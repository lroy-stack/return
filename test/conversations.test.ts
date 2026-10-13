import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail, ConversationSummary, Message, Proposal } from "../src/shared/schemas";
import { hmacHex } from "../src/worker/lib/ids";
import { api, apiJson } from "./helpers/api";
import {
  finderGet,
  finderPost,
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
      `INSERT INTO conversations (id, owner_id, finder_token_hash, subject, status, last_message_at, created_at)
       VALUES ('foreign-conv', 'other-owner', 'foreign-hash', 'Not yours', 'open', ?, ?)`,
    ).bind(now, now),
    env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('foreign-msg', 'foreign-conv', 'finder', 'secret', ?)",
    ).bind(now),
    env.DB.prepare(
      `INSERT INTO proposals (id, conversation_id, proposed_by, kind, place, status, created_at)
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
    const proposal = await apiJson<Proposal>("POST", `/conversations/${conv.id}/proposals`, {
      kind: "meeting_point",
      place: "Main square",
      lat: 40.4168,
      lng: -3.7038,
      meetAt: "2026-10-14T18:30",
      instructions: "Blue umbrella",
    });
    expect(proposal).toMatchObject({ proposedBy: "owner", status: "proposed", meetAt: "2026-10-14T18:30" });
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
