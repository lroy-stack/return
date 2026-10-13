import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BlockEntry,
  ConversationDetail,
  ConversationSummary,
  Message,
  Proposal,
} from "../src/shared/schemas";
import { hmacHex } from "../src/worker/lib/ids";
import { api, apiJson } from "./helpers/api";
import { APP, accessJwt, worker } from "./helpers/auth";
import {
  finderGet,
  finderPost,
  localIn,
  openConversation,
  resetPublicStubs,
  seedTag,
  uniqueIp,
} from "./helpers/public";

afterEach(resetPublicStubs);

async function count(sql: string, ...params: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** A conversation that belongs to a different owner, inserted directly. */
async function foreignConversation(): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO owners (id, email, created_at) VALUES ('other-owner', 'other@example.test', ?)",
    ).bind(now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO conversations (id, owner_id, finder_token_hash, subject, status, last_message_at, created_at)
       VALUES ('foreign-conv', 'other-owner', 'foreign-hash', 'Not yours', 'open', ?, ?)`,
    ).bind(now, now),
    env.DB.prepare(
      "INSERT OR IGNORE INTO messages (id, conversation_id, sender, body, created_at) VALUES ('foreign-msg', 'foreign-conv', 'finder', 'secret', ?)",
    ).bind(now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO proposals (id, conversation_id, proposed_by, kind, place, status, created_at)
       VALUES ('foreign-prop', 'foreign-conv', 'finder', 'other', 'Somewhere', 'proposed', ?)`,
    ).bind(now),
  ]);
  return "foreign-conv";
}

describe("owner conversations API", () => {
  it("lists conversations with unread state and status filter", async () => {
    const seeded = await seedTag();
    const conv = await openConversation(seeded, { message: "Is this yours?" });
    const { conversations } = await apiJson<{ conversations: ConversationSummary[] }>(
      "GET",
      "/conversations",
    );
    const summary = conversations.find((c) => c.id === conv.id);
    expect(summary).toMatchObject({
      subject: "Grey travel backpack",
      status: "open",
      unread: true,
      lastMessagePreview: "Is this yours?",
      itemId: seeded.itemId,
    });

    const detail = await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`);
    expect(detail.messages.map((m) => m.body)).toEqual(["Is this yours?"]);
    expect(detail.conversation).toMatchObject({ finderLang: "en", finderEmail: null });
    const after = await apiJson<{ conversations: ConversationSummary[] }>(
      "GET",
      "/conversations?status=open",
    );
    expect(after.conversations.find((c) => c.id === conv.id)?.unread).toBe(false);
    const closed = await apiJson<{ conversations: ConversationSummary[] }>(
      "GET",
      "/conversations?status=closed",
    );
    expect(closed.conversations.find((c) => c.id === conv.id)).toBeUndefined();
    expect((await api("GET", "/conversations?status=nonsense")).status).toBe(422);
  });

  it("lets the owner reply and the finder reads it", async () => {
    const conv = await openConversation(await seedTag());
    const message = await apiJson<Message>("POST", `/conversations/${conv.id}/messages`, {
      body: "Thank you! Where are you?",
    });
    expect(message).toMatchObject({ sender: "owner", body: "Thank you! Where are you?" });
    expect(await (await finderGet(`/c/${conv.token}`)).text()).toContain("Thank you! Where are you?");
    expect((await api("POST", `/conversations/${conv.id}/messages`, { body: "" })).status).toBe(422);
    expect((await api("POST", `/conversations/${conv.id}/messages`, {})).status).toBe(422);
    const detail = await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`);
    expect(detail.conversation.unread).toBe(false);
  });

  it("emails the finder about a reply only when they opted in", async () => {
    const seeded = await seedTag({
      settings: { notifications: { notifyFinders: true, emailAddress: "owner@example.test" } },
    });
    const conv = await openConversation(seeded, { email: "finder@example.test" });
    await apiJson("POST", `/conversations/${conv.id}/messages`, { body: "On my way" });
    await vi.waitFor(async () => {
      expect(
        await count(
          "SELECT COUNT(*) AS n FROM notifications WHERE conversation_id = ? AND kind = 'finder.reply'",
          conv.id,
        ),
      ).toBe(1);
    });
  });

  it("creates owner proposals with map links and validates them", async () => {
    const conv = await openConversation(await seedTag());
    const meetAt = localIn("Europe/Madrid", 3 * 24 * 60);
    const proposal = await apiJson<Proposal>("POST", `/conversations/${conv.id}/proposals`, {
      kind: "meeting_point",
      place: "Main square",
      lat: 40.4168,
      lng: -3.7038,
      meetAt,
      meetTz: "Europe/Madrid",
      instructions: "Blue umbrella",
    });
    expect(proposal).toMatchObject({
      proposedBy: "owner",
      status: "proposed",
      meetAt,
      meetTz: "Europe/Madrid",
    });
    expect(proposal.maps?.google).toContain("40.41680%2C-3.70380");
    expect(proposal.maps?.apple).toContain("maps.apple.com");
    expect(
      (await api("POST", `/conversations/${conv.id}/proposals`, { kind: "nope", place: "x" })).status,
    ).toBe(422);
    expect(
      (await api("POST", `/conversations/${conv.id}/proposals`, { kind: "other", place: "x", lat: 1 }))
        .status,
    ).toBe(422);

    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).toContain("Main square");
    expect(html).toContain('name="action" value="accept"');
  });

  it("closes, reopens and refuses writes while closed", async () => {
    const conv = await openConversation(await seedTag());
    const closed = await apiJson<ConversationDetail>("POST", `/conversations/${conv.id}/close`);
    expect(closed.conversation.status).toBe("closed");
    expect((await api("POST", `/conversations/${conv.id}/messages`, { body: "hi" })).status).toBe(409);
    expect(
      (await api("POST", `/conversations/${conv.id}/proposals`, { kind: "other", place: "x" })).status,
    ).toBe(409);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM activity_events WHERE conversation_id = ? AND type = 'conversation.closed'",
        conv.id,
      ),
    ).toBe(1);

    const reopened = await apiJson<ConversationDetail>("POST", `/conversations/${conv.id}/reopen`);
    expect(reopened.conversation.status).toBe("open");
    expect((await api("POST", `/conversations/${conv.id}/messages`, { body: "hi again" })).status).toBe(201);
  });

  it("blocks the finder: conversation blocked, IP hash blocked, no reopening", async () => {
    const seeded = await seedTag();
    const conv = await openConversation(seeded);
    const blocked = await apiJson<ConversationDetail>("POST", `/conversations/${conv.id}/block`, {
      reason: "harassment",
    });
    expect(blocked.conversation.status).toBe("blocked");
    const row = await env.DB.prepare(
      "SELECT ip_hmac, reason, expires_at FROM blocks WHERE owner_id = ? AND ip_hmac = ?",
    )
      .bind(seeded.ownerId, await hmacHex(env.IP_HMAC_SECRET, conv.ip))
      .first<{ ip_hmac: string; reason: string; expires_at: string | null }>();
    expect(row).toMatchObject({ reason: "harassment", expires_at: null });

    // The same IP cannot start a new conversation any more.
    const again = await finderPost(
      `/t/${seeded.token}/contact`,
      { message: "let me in", "cf-turnstile-response": "x" },
      { ip: conv.ip },
    );
    expect(again.status).toBe(429);
    expect((await api("POST", `/conversations/${conv.id}/reopen`)).status).toBe(409);
    expect((await api("POST", `/conversations/${conv.id}/messages`, { body: "hi" })).status).toBe(409);
  });

  it("deletes only with the typed confirmation and removes everything", async () => {
    const seeded = await seedTag();
    const conv = await openConversation(seeded, { location_label: "Bench", location_confirmed: "yes" });
    await finderPost(`/c/${conv.token}/proposals`, { kind: "other", place: "Pier" });

    expect((await api("DELETE", `/conversations/${conv.id}`, {})).status).toBe(422);
    expect((await api("DELETE", `/conversations/${conv.id}`, { confirm: "delete" })).status).toBe(422);
    expect((await api("DELETE", `/conversations/${conv.id}`, { confirm: "DELETE" })).status).toBe(204);

    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE id = ?", conv.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?", conv.id)).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM shared_locations WHERE conversation_id = ?", conv.id)).toBe(
      0,
    );
    expect(await count("SELECT COUNT(*) AS n FROM proposals WHERE conversation_id = ?", conv.id)).toBe(0);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM activity_events WHERE conversation_id = ? AND type = 'conversation.deleted'",
        conv.id,
      ),
    ).toBe(1);
    expect((await api("GET", `/conversations/${conv.id}`)).status).toBe(404);
    expect((await finderGet(`/c/${conv.token}`)).status).toBe(404);
  });

  it("keeps exactly one accepted proposal when accepts race", async () => {
    const seeded = await seedTag();
    const conv = await openConversation(seeded);
    await finderPost(`/c/${conv.token}/proposals`, { kind: "meeting_point", place: "Cafe" });
    const [proposal] = (await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`)).proposals;
    const settled = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        api("POST", `/conversations/${conv.id}/proposals/${proposal?.id}/respond`, { action: "accept" }),
      ),
    );
    const statuses = settled.map((r) => (r.status === "fulfilled" ? r.value.status : 0)).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(3);
    const after = (await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`)).proposals;
    expect(after.map((p) => p.status)).toEqual(["accepted"]);
  });

  it("blanks notification recipients when a conversation is deleted", async () => {
    const seeded = await seedTag({
      settings: { notifications: { notifyFinders: true, emailAddress: "owner@example.test" } },
    });
    const conv = await openConversation(seeded, { email: "finder-gone@example.test" });
    await vi.waitFor(async () => {
      expect(
        await count("SELECT COUNT(*) AS n FROM notifications WHERE conversation_id = ?", conv.id),
      ).toBeGreaterThanOrEqual(2);
    });
    expect((await api("DELETE", `/conversations/${conv.id}`, { confirm: "DELETE" })).status).toBe(204);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM notifications WHERE conversation_id = ? AND recipient <> '[deleted]'",
        conv.id,
      ),
    ).toBe(0);
    expect(
      await count("SELECT COUNT(*) AS n FROM notifications WHERE recipient = 'finder-gone@example.test'"),
    ).toBe(0);
  });

  it("never exposes or changes another owner's conversation (IDOR)", async () => {
    const foreign = await foreignConversation();
    const base = `/conversations/${foreign}`;
    expect((await api("GET", base)).status).toBe(404);
    expect((await api("POST", `${base}/messages`, { body: "hi" })).status).toBe(404);
    expect((await api("POST", `${base}/proposals`, { kind: "other", place: "x" })).status).toBe(404);
    expect((await api("POST", `${base}/proposals/foreign-prop/respond`, { action: "accept" })).status).toBe(
      404,
    );
    expect((await api("POST", `${base}/close`)).status).toBe(404);
    expect((await api("POST", `${base}/reopen`)).status).toBe(404);
    expect((await api("POST", `${base}/block`, {})).status).toBe(404);
    expect((await api("DELETE", base, { confirm: "DELETE" })).status).toBe(404);
    const { conversations } = await apiJson<{ conversations: ConversationSummary[] }>(
      "GET",
      "/conversations",
    );
    expect(conversations.map((c) => c.id)).not.toContain(foreign);
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE id = ?", foreign)).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM blocks WHERE owner_id = 'other-owner'")).toBe(0);
  });

  it("requires a same-origin request and an Access identity", async () => {
    const conv = await openConversation(await seedTag());
    expect(
      (await api("POST", `/conversations/${conv.id}/close`, undefined, { origin: "https://evil.example" }))
        .status,
    ).toBe(403);
    expect((await api("GET", `/conversations/${conv.id}`, undefined, { jwt: null })).status).toBe(401);
  });

  it("keeps unrelated finders apart: a second finder gets a different token and thread", async () => {
    const seeded = await seedTag();
    const a = await openConversation(seeded, { message: "from A" });
    const b = await openConversation(seeded, { message: "from B" });
    expect(a.token).not.toBe(b.token);
    expect(await (await finderGet(`/c/${a.token}`)).text()).not.toContain("from B");
    expect(await (await finderGet(`/c/${b.token}`)).text()).not.toContain("from A");
    expect(uniqueIp()).not.toBe(uniqueIp());
  });
});

describe("blocks lifecycle", () => {
  async function blockedConversation(body?: Record<string, unknown>) {
    const seeded = await seedTag();
    const conv = await openConversation(seeded);
    const res = await api("POST", `/conversations/${conv.id}/block`, body);
    return { seeded, conv, res };
  }
  const ipHash = (ip: string) => hmacHex(env.IP_HMAC_SECRET, ip);

  it("blocks with an empty body, as the panel sends it", async () => {
    const { conv, res } = await blockedConversation();
    expect(res.status).toBe(200);
    expect(((await res.json()) as ConversationDetail).conversation.status).toBe("blocked");
    const row = await env.DB.prepare("SELECT reason, expires_at FROM blocks WHERE ip_hmac = ?")
      .bind(await ipHash(conv.ip))
      .first<{ reason: string | null; expires_at: string | null }>();
    expect(row).toEqual({ reason: null, expires_at: null });
  });

  it("rejects malformed JSON and unknown durations", async () => {
    const conv = await openConversation(await seedTag());
    expect((await api("POST", `/conversations/${conv.id}/block`, { duration: "1y" })).status).toBe(422);
    const bad = await worker.fetch(
      new Request(`${APP}/api/conversations/${conv.id}/block`, {
        method: "POST",
        headers: {
          "Cf-Access-Jwt-Assertion": await accessJwt(),
          Origin: APP,
          "Content-Type": "application/json",
        },
        body: "{nope",
      }),
    );
    expect(bad.status).toBe(400);
  });

  it.each([
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ])("expires a %s block after %d days", async (duration, days) => {
    const { conv } = await blockedConversation({ duration });
    const row = await env.DB.prepare("SELECT expires_at FROM blocks WHERE ip_hmac = ?")
      .bind(await ipHash(conv.ip))
      .first<{ expires_at: string }>();
    const expected = Date.now() + days * 86_400_000;
    expect(Math.abs(Date.parse(row?.expires_at ?? "") - expected)).toBeLessThan(60_000);
  });

  it("blocking again replaces the earlier block of the same address", async () => {
    const { conv } = await blockedConversation({ reason: "first" });
    await api("POST", `/conversations/${conv.id}/block`, { reason: "second", duration: "7d" });
    expect(await count("SELECT COUNT(*) AS n FROM blocks WHERE ip_hmac = ?", await ipHash(conv.ip))).toBe(1);
    const { blocks } = await apiJson<{ blocks: BlockEntry[] }>("GET", "/blocks");
    expect(blocks.find((b) => b.reason === "second")?.expiresAt).not.toBeNull();
  });

  it("unblocks: the block row goes, the conversation reopens, the finder can write again", async () => {
    const { seeded, conv } = await blockedConversation({ reason: "oops" });
    const detail = await apiJson<ConversationDetail>("POST", `/conversations/${conv.id}/unblock`);
    expect(detail.conversation.status).toBe("open");
    expect(await count("SELECT COUNT(*) AS n FROM blocks WHERE ip_hmac = ?", await ipHash(conv.ip))).toBe(0);
    expect((await api("POST", `/conversations/${conv.id}/messages`, { body: "back" })).status).toBe(201);
    const again = await finderPost(
      `/t/${seeded.token}/contact`,
      { message: "hello again", "cf-turnstile-response": "x" },
      { ip: conv.ip },
    );
    expect(again.status).toBe(303);
    expect((await api("POST", `/conversations/${conv.id}/unblock`)).status).toBe(409);
  });

  it("lists active blocks with their conversation, hides expired ones and never shows the address hash", async () => {
    const { conv } = await blockedConversation({ reason: "spam", duration: "30d" });
    const expiredIp = uniqueIp();
    await env.DB.prepare(
      "INSERT INTO blocks (id, owner_id, ip_hmac, expires_at, created_at) VALUES ('b-expired-list', (SELECT owner_id FROM conversations WHERE id = ?), ?, ?, ?)",
    )
      .bind(
        conv.id,
        await ipHash(expiredIp),
        new Date(Date.now() - 1000).toISOString(),
        new Date().toISOString(),
      )
      .run();
    const res = await api("GET", "/blocks");
    const body = (await res.json()) as { blocks: BlockEntry[] };
    const mine = body.blocks.find((b) => b.conversation?.id === conv.id);
    expect(mine).toMatchObject({
      reason: "spam",
      orphaned: false,
      conversation: { subject: "Grey travel backpack" },
    });
    expect(mine?.expiresAt).not.toBeNull();
    expect(body.blocks.map((b) => b.id)).not.toContain("b-expired-list");
    expect(JSON.stringify(body)).not.toContain(await ipHash(conv.ip));
  });

  it("keeps a block when its conversation is deleted and lists it as orphaned", async () => {
    const { seeded, conv } = await blockedConversation({ reason: "abuse" });
    expect((await api("DELETE", `/conversations/${conv.id}`, { confirm: "DELETE" })).status).toBe(204);
    const { blocks } = await apiJson<{ blocks: BlockEntry[] }>("GET", "/blocks");
    const orphan = blocks.find((b) => b.reason === "abuse");
    expect(orphan).toMatchObject({ orphaned: true, conversation: null });
    const again = await finderPost(
      `/t/${seeded.token}/contact`,
      { message: "let me in", "cf-turnstile-response": "x" },
      { ip: conv.ip },
    );
    expect(again.status).toBe(429);
  });

  it("removes a block from the list; its blocked conversation becomes closed, not blocked", async () => {
    const { seeded, conv } = await blockedConversation();
    const { blocks } = await apiJson<{ blocks: BlockEntry[] }>("GET", "/blocks");
    const mine = blocks.find((b) => b.conversation?.id === conv.id);
    expect((await api("DELETE", `/blocks/${mine?.id}`)).status).toBe(204);
    expect((await api("DELETE", `/blocks/${mine?.id}`)).status).toBe(404);
    const detail = await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`);
    expect(detail.conversation.status).toBe("closed");
    const again = await finderPost(
      `/t/${seeded.token}/contact`,
      { message: "hi", "cf-turnstile-response": "x" },
      { ip: conv.ip },
    );
    expect(again.status).toBe(303);
  });

  it("never lists, lifts or unblocks another owner's blocks (IDOR)", async () => {
    const foreign = await foreignConversation();
    await env.DB.prepare(
      "UPDATE conversations SET status = 'blocked', finder_ip_hmac = 'foreign-ip' WHERE id = ?",
    )
      .bind(foreign)
      .run();
    await env.DB.prepare(
      "INSERT INTO blocks (id, owner_id, ip_hmac, reason, created_at) VALUES ('foreign-block', 'other-owner', 'foreign-ip', 'theirs', ?)",
    )
      .bind(new Date().toISOString())
      .run();
    const { blocks } = await apiJson<{ blocks: BlockEntry[] }>("GET", "/blocks");
    expect(blocks.map((b) => b.id)).not.toContain("foreign-block");
    expect((await api("DELETE", "/blocks/foreign-block")).status).toBe(404);
    expect((await api("POST", `/conversations/${foreign}/unblock`)).status).toBe(404);
    expect(await count("SELECT COUNT(*) AS n FROM blocks WHERE id = 'foreign-block'")).toBe(1);
    expect(
      await count("SELECT COUNT(*) AS n FROM conversations WHERE id = ? AND status = 'blocked'", foreign),
    ).toBe(1);
  });

  it("requires Access and a same-origin request for the block endpoints", async () => {
    expect((await api("GET", "/blocks", undefined, { jwt: null })).status).toBe(401);
    expect((await api("DELETE", "/blocks/x", undefined, { origin: "https://evil.example" })).status).toBe(
      403,
    );
  });
});

describe("owner proposals: dates and zones", () => {
  async function propose(extra: Record<string, unknown>) {
    const conv = await openConversation(
      await seedTag({ settings: { identity: { timezone: "Asia/Tokyo" } } }),
    );
    const res = await api("POST", `/conversations/${conv.id}/proposals`, {
      kind: "other",
      place: "Pier",
      ...extra,
    });
    return { conv, res };
  }

  it("rejects a day that does not exist instead of rolling it over", async () => {
    const { res } = await propose({ meetAt: "2099-02-31T18:30" });
    expect(res.status).toBe(422);
  });

  it("rejects an unknown zone and a malformed time", async () => {
    expect((await propose({ meetAt: localIn("UTC", 1000), meetTz: "Mars/Olympus" })).res.status).toBe(422);
    expect((await propose({ meetAt: "2099-01-01T25:00" })).res.status).toBe(422);
  });

  it("rejects a time in the past, evaluated in the zone sent", async () => {
    const past = await propose({ meetAt: localIn("Europe/Madrid", -120), meetTz: "Europe/Madrid" });
    expect(past.res.status).toBe(422);
    const body = (await past.res.json()) as { error: { code: string; details: { path: string[] }[] } };
    expect(body.error.code).toBe("meeting_in_past");
    expect(body.error.details[0]?.path).toEqual(["meetAt"]);
  });

  it("accepts a time a few minutes into the past", async () => {
    expect(
      (await propose({ meetAt: localIn("Europe/Madrid", -5), meetTz: "Europe/Madrid" })).res.status,
    ).toBe(201);
  });

  it("stores the owner's time zone when the panel sends none", async () => {
    const { res } = await propose({ meetAt: localIn("Asia/Tokyo", 600) });
    expect(res.status).toBe(201);
    expect(((await res.json()) as Proposal).meetTz).toBe("Asia/Tokyo");
  });

  it("has no zone when there is no time", async () => {
    const { res } = await propose({ meetTz: "Europe/Madrid" });
    expect(((await res.json()) as Proposal).meetTz).toBeNull();
  });
});
