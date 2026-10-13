import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail, Proposal } from "../src/shared/schemas";
import { hmacHex } from "../src/worker/lib/ids";
import { normalizeIp } from "../src/worker/lib/ratelimit";
import { api, apiJson } from "./helpers/api";
import { APP, PUBLIC, worker } from "./helpers/auth";
import {
  finderGet,
  finderPost,
  openConversation,
  ownerId,
  resetPublicStubs,
  seedRecovery,
  seedTag,
  seedTrustedContact,
  trackSpy,
  turnstile,
  uniqueIp,
} from "./helpers/public";

const TURNSTILE_FIELD = { "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" };

afterEach(resetPublicStubs);

async function count(sql: string, ...params: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("static finder routes", () => {
  it("serves robots.txt, a data-free home page, privacy and emergency pages", async () => {
    const robots = await finderGet("/robots.txt");
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /");

    const home = await (await finderGet("/")).text();
    expect(home).toContain("<h1>RETURN</h1>");
    expect(home).toContain("Fundservice");
    expect(home).toContain("objetos perdidos");

    const privacy = await finderGet("/privacy?lang=de");
    expect(privacy.status).toBe(200);
    expect(await privacy.text()).toContain("Datenschutz");

    const emergency = await (await finderGet("/emergency")).text();
    expect(emergency).toContain("backup@example.test");
  });

  it("serves the emergency page without touching the database", async () => {
    trackSpy(vi.spyOn(env.DB, "prepare")).mockImplementation(() => {
      throw new Error("D1 is down");
    });
    const res = await finderGet("/emergency");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("backup@example.test");
  });
});

describe("tag page", () => {
  it("shows public fields and never private ones", async () => {
    // A second item of the same owner must not appear either.
    await seedTag({ item: { name: "OTHER-ITEM-NAME", serialNumber: "OTHER-SERIAL" } });
    const seeded = await seedTag({
      settings: { messages: { returnMessage: { en: "Please message me, thank you!" } } },
      item: { publicMessage: "Ask for Ada at the front desk.", name: "PRIVATE-NAME-XYZ" },
    });
    const res = await finderGet(`/t/${seeded.token}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Grey travel backpack");
    expect(html).toContain("Ada Traveller");
    expect(html).toContain("Please message me, thank you!");
    expect(html).toContain("Ask for Ada at the front desk.");
    expect(html).toContain(`action="/t/${seeded.token}/contact"`);
    for (const secret of [
      "PRIVATE-NAME-XYZ",
      "Osprey",
      "Farpoint",
      "SN-SECRET-4471",
      "passport is in the lid pocket",
      "18900",
      "189",
      "OTHER-ITEM-NAME",
      "OTHER-SERIAL",
    ]) {
      expect(html).not.toContain(secret);
    }
  });

  it("falls back to a generic localized category name instead of the private name", async () => {
    const seeded = await seedTag({
      item: { publicTitle: null, name: "PRIVATE-NAME-ABC", category: "laptop" },
    });
    const html = await (await finderGet(`/t/${seeded.token}?lang=de`)).text();
    expect(html).toContain("Laptop");
    expect(html).not.toContain("PRIVATE-NAME-ABC");
  });

  it("sends capability headers, a strict CSP and no inline styles or scripts", async () => {
    const seeded = await seedTag();
    const res = await finderGet(`/t/${seeded.token}`);
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
    const html = await res.text();
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
    expect(html).toContain('src="/p/public.js"');
    expect(html).toContain("https://challenges.cloudflare.com/turnstile/v0/api.js");
    expect(html).toContain('data-sitekey="1x00000000000000000000AA"');
    expect(html).toContain("/privacy");
  });

  it("answers unknown, revoked, unassigned, archived and malformed tokens identically", async () => {
    const revoked = await seedTag({ tagStatus: "revoked" });
    const unassigned = await seedTag({ unassigned: true });
    const archived = await seedTag({ item: { archived: true } });
    const paths = [
      "/t/0123456789abcdefghjkmnpqrs",
      `/t/${revoked.token}`,
      `/t/${unassigned.token}`,
      `/t/${archived.token}`,
      "/t/short",
      "/T/%20%20",
    ];
    const bodies: string[] = [];
    for (const path of paths) {
      const res = await finderGet(path, { lang: "en" });
      expect(res.status, path).toBe(404);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain("This tag is not active");
  });

  it("accepts tokens case-insensitively and under /T/", async () => {
    const seeded = await seedTag();
    const upper = await finderGet(`/T/${seeded.token.toUpperCase()}`);
    expect(upper.status).toBe(200);
    expect(await upper.text()).toContain("Grey travel backpack");
  });

  it("negotiates the language: ?lang, cookie, Accept-Language, owner default", async () => {
    const seeded = await seedTag({ settings: { identity: { defaultPublicLanguage: "es" } } });
    const path = `/t/${seeded.token}`;
    expect(await (await finderGet(`${path}?lang=de`, { lang: "es" })).text()).toContain(
      "Dem Eigentümer schreiben",
    );
    expect(await (await finderGet(path, { cookie: "lang=de", lang: "es" })).text()).toContain(
      "Dem Eigentümer",
    );
    const es = await (await finderGet(path, { lang: "fr;q=0.9, es-ES;q=0.8, en;q=0.1" })).text();
    expect(es).toContain("Escribe al propietario");
    expect(es).toContain('<html lang="es">');
    expect(await (await finderGet(path, { lang: "de-DE,de;q=0.9" })).text()).toContain(
      "Dem Eigentümer schreiben",
    );
    expect(await (await finderGet(path, { lang: "fr" })).text()).toContain("Escribe al propietario");
    expect(await (await finderGet(path, { lang: "en-US" })).text()).toContain("Write to the owner");
    // Labels around the owner's single-language note are localized; the note itself is left as written.
    const noted = await seedTag({ item: { publicMessage: "Ask at the desk" } });
    const de = await (await finderGet(`/t/${noted.token}?lang=de`)).text();
    expect(de).toContain("Hinweis des Eigentümers");
    expect(de).toContain("Ask at the desk");
    expect(await (await finderGet(`/t/${noted.token}?lang=es`)).text()).toContain("Nota del propietario");
  });

  it("shows the lost banner, localized message and reward", async () => {
    const seeded = await seedTag({
      settings: {
        messages: { lostMessage: { en: "Please help me get it back.", de: "Bitte helfen Sie mir." } },
        publicPage: { defaultRewardText: { en: "A coffee on me" } },
      },
      item: { status: "lost" },
    });
    const en = await (await finderGet(`/t/${seeded.token}?lang=en`)).text();
    expect(en).toContain("Reported lost");
    expect(en).toContain("Please help me get it back.");
    expect(en).toContain("A coffee on me");
    expect(await (await finderGet(`/t/${seeded.token}?lang=de`)).text()).toContain("Bitte helfen Sie mir.");

    const own = await seedTag({ item: { status: "lost", rewardText: "50 EUR" } });
    expect(await (await finderGet(`/t/${own.token}`)).text()).toContain("50 EUR");
  });

  it("shows only the contact methods that are visible, with per-item overrides", async () => {
    const owner = await ownerId();
    await seedTrustedContact(owner, { name: "Public Pat", email: "pat@example.test", showPublic: true });
    await seedTrustedContact(owner, { name: "Hidden Hal", email: "hal@example.test", showPublic: false });
    const settings = {
      contact: {
        email: "ada@example.test",
        phone: "+49 170 1234567",
        whatsapp: "+34 600-111-222",
        visibility: { email: true, phone: true, whatsapp: true, trustedContacts: true },
      },
    };
    const all = await (await finderGet(`/t/${(await seedTag({ settings })).token}`)).text();
    expect(all).toContain('href="mailto:ada@example.test"');
    expect(all).toContain('href="tel:+491701234567"');
    expect(all).toContain('href="https://wa.me/34600111222"');
    expect(all).toContain("Public Pat");
    expect(all).toContain("pat@example.test");
    expect(all).not.toContain("Hidden Hal");
    expect(all).not.toContain("hal@example.test");

    const overridden = await seedTag({
      settings,
      item: { contactVisibility: { email: false, phone: false, whatsapp: false, trustedContacts: false } },
    });
    const none = await (await finderGet(`/t/${overridden.token}`)).text();
    expect(none).not.toContain("mailto:");
    expect(none).not.toContain("wa.me");
    expect(none).toContain("<textarea");
  });

  it("serves the public photo with a short private cache, only when allowed", async () => {
    const seeded = await seedTag({ item: { withPhoto: true } });
    const page = await (await finderGet(`/t/${seeded.token}`)).text();
    expect(page).toContain(`src="/t/${seeded.token}/photo"`);
    const photo = await finderGet(`/t/${seeded.token}/photo`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(photo.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));

    const hidden = await seedTag({
      item: { withPhoto: true },
      settings: { publicPage: { showItemPhoto: false } },
    });
    expect((await finderGet(`/t/${hidden.token}/photo`)).status).toBe(404);
    expect(await (await finderGet(`/t/${hidden.token}`)).text()).not.toContain("/photo");
    const none = await seedTag();
    expect((await finderGet(`/t/${none.token}/photo`)).status).toBe(404);
    const revoked = await seedTag({ item: { withPhoto: true }, tagStatus: "revoked" });
    expect((await finderGet(`/t/${revoked.token}/photo`)).status).toBe(404);
  });

  it("logs scans at most hourly and alerts for lost items at most every 6 hours", async () => {
    const owner = await ownerId();
    const lost = await seedTag({
      settings: { notifications: { emailAddress: "owner@example.test" } },
      item: { status: "lost" },
    });
    await finderGet(`/t/${lost.token}`);
    await finderGet(`/t/${lost.token}`);
    await vi.waitFor(async () => {
      expect(
        await count(
          "SELECT COUNT(*) AS n FROM activity_events WHERE tag_id = ? AND type = 'tag.scanned'",
          lost.tagId,
        ),
      ).toBe(1);
      expect(
        await count(
          "SELECT COUNT(*) AS n FROM notifications WHERE owner_id = ? AND kind = 'owner.lost_item_scanned' AND created_at > ?",
          owner,
          new Date(Date.now() - 60_000).toISOString(),
        ),
      ).toBeGreaterThanOrEqual(1);
    });
    const tag = await env.DB.prepare("SELECT last_seen_at FROM tags WHERE id = ?")
      .bind(lost.tagId)
      .first<{ last_seen_at: string | null }>();
    expect(tag?.last_seen_at).not.toBeNull();
    const event = await env.DB.prepare("SELECT country, data FROM activity_events WHERE tag_id = ?")
      .bind(lost.tagId)
      .first<{ country: string | null; data: string }>();
    expect(event?.country).toBeNull();
    expect(JSON.parse(event?.data ?? "{}")).toMatchObject({ lost: true, alerted: true });

    // An hour later the scan is logged again, but the 6 h alert window has not elapsed.
    const past = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await env.DB.prepare("UPDATE tags SET last_seen_at = ? WHERE id = ?").bind(past, lost.tagId).run();
    await finderGet(`/t/${lost.token}`);
    await vi.waitFor(async () => {
      expect(
        await count(
          "SELECT COUNT(*) AS n FROM activity_events WHERE tag_id = ? AND type = 'tag.scanned'",
          lost.tagId,
        ),
      ).toBe(2);
    });
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM activity_events WHERE tag_id = ? AND json_extract(data, '$.alerted') = 1",
        lost.tagId,
      ),
    ).toBe(1);

    const normal = await seedTag();
    await finderGet(`/t/${normal.token}`);
    await vi.waitFor(async () => {
      expect(await count("SELECT COUNT(*) AS n FROM activity_events WHERE tag_id = ?", normal.tagId)).toBe(1);
    });
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM activity_events WHERE tag_id = ? AND json_extract(data, '$.alerted') = 1",
        normal.tagId,
      ),
    ).toBe(0);
  });

  it("falls back to a 503 page with the fallback e-mail when the database fails", async () => {
    const seeded = await seedTag();
    trackSpy(vi.spyOn(env.DB, "prepare")).mockImplementation(() => {
      throw new Error("D1 exploded: secret internal detail");
    });
    const res = await finderGet(`/t/${seeded.token}`);
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("backup@example.test");
    expect(html).not.toContain("secret internal detail");
    expect(html).not.toContain("Error:");
  });

  it("offers to continue an existing open conversation from the rc cookie", async () => {
    const seeded = await seedTag();
    const other = await seedTag();
    const conv = await openConversation(seeded);
    const withCookie = await (
      await finderGet(`/t/${seeded.token}`, { cookie: `__Host-rc=${conv.token}` })
    ).text();
    expect(withCookie).toContain(`href="/c/${conv.token}"`);
    expect(withCookie).toContain("Continue your conversation");
    const wrongTag = await (
      await finderGet(`/t/${other.token}`, { cookie: `__Host-rc=${conv.token}` })
    ).text();
    expect(wrongTag).not.toContain(conv.token);
  });
});

describe("starting a conversation", () => {
  it("creates the conversation, sets the cookie and redirects (PRG)", async () => {
    const seeded = await seedTag({ settings: { notifications: { emailAddress: "owner@example.test" } } });
    const recoveryId = await seedRecovery(seeded);
    const ip = uniqueIp();
    const res = await finderPost(
      `/t/${seeded.token}/contact`,
      { message: "Found it at the bus stop.", name: "Sam", lang: "de", ...TURNSTILE_FIELD },
      { ip },
    );
    expect(res.status).toBe(303);
    const location = res.headers.get("Location") ?? "";
    expect(location).toMatch(/^\/c\/[A-Za-z0-9_-]{43}$/);
    const token = location.slice(3);
    const setCookie = res.headers.getSetCookie().find((h) => h.startsWith("__Host-rc=")) ?? "";
    expect(setCookie).toContain(`__Host-rc=${token}`);
    expect(setCookie).not.toMatch(/domain=/i);
    for (const attr of ["Path=/", "HttpOnly", "Secure", "SameSite=Lax", "Max-Age=2592000"]) {
      expect(setCookie).toContain(attr);
    }

    const conv = await env.DB.prepare("SELECT * FROM conversations WHERE tag_id = ?")
      .bind(seeded.tagId)
      .first<Record<string, unknown>>();
    expect(conv).toMatchObject({
      subject: "Grey travel backpack",
      finder_name: "Sam",
      finder_lang: "de",
      status: "open",
      recovery_id: recoveryId,
    });
    expect(conv?.finder_ip_hmac).toBe(await hmacHex(env.IP_HMAC_SECRET, ip));
    expect(JSON.stringify(conv)).not.toContain(ip);
    expect(conv?.finder_token_hash).not.toBe(token);
    const recovery = await env.DB.prepare("SELECT status FROM recoveries WHERE id = ?")
      .bind(recoveryId)
      .first<{ status: string }>();
    // An anonymous first contact must not change the recovery state; it is only linked.
    expect(recovery?.status).toBe("lost");
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM activity_events WHERE tag_id = ? AND type = 'conversation.created'",
        seeded.tagId,
      ),
    ).toBe(1);

    const page = await finderGet(location);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Found it at the bus stop.");
    expect(html).toContain("Grey travel backpack");
    expect(html).toContain('lang="de"');

    await vi.waitFor(async () => {
      expect(
        await count(
          "SELECT COUNT(*) AS n FROM notifications WHERE conversation_id = ? AND kind = 'owner.new_conversation'",
          conv?.id,
        ),
      ).toBe(1);
    });
    expect(turnstile.calls.at(-1)?.body).toContain(`remoteip=${encodeURIComponent(ip)}`);
    expect(turnstile.calls.at(-1)?.body).toContain("secret=");
  });

  it("stores the message even when notification delivery fails", async () => {
    const seeded = await seedTag({ settings: { notifications: { emailAddress: "owner@example.test" } } });
    const send = trackSpy(vi.spyOn(env.EMAIL, "send")).mockRejectedValue(new Error("smtp down"));
    const conv = await openConversation(seeded, { message: "Still stored" });
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?", conv.id)).toBe(1);
    await vi.waitFor(async () => {
      const row = await env.DB.prepare(
        "SELECT status FROM notifications WHERE conversation_id = ? AND kind = 'owner.new_conversation'",
      )
        .bind(conv.id)
        .first<{ status: string }>();
      expect(row?.status).toBe("failed");
    });
    expect(send).toHaveBeenCalled();
  });

  it("rejects the request when Turnstile verification fails", async () => {
    const seeded = await seedTag();
    turnstile.success = false;
    const res = await finderPost(`/t/${seeded.token}/contact`, { message: "hello", ...TURNSTILE_FIELD });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("hello");
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(0);

    turnstile.success = true;
    const missing = await finderPost(`/t/${seeded.token}/contact`, { message: "hello" });
    expect(missing.status).toBe(403);
  });

  it("rejects a Turnstile token issued for another hostname", async () => {
    const seeded = await seedTag();
    turnstile.hostname = "evil.example";
    const res = await finderPost(`/t/${seeded.token}/contact`, { message: "hello", ...TURNSTILE_FIELD });
    expect(res.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(0);
  });

  it("fails closed when Turnstile is unreachable", async () => {
    const seeded = await seedTag();
    turnstile.unreachable = true;
    const res = await finderPost(`/t/${seeded.token}/contact`, { message: "hello", ...TURNSTILE_FIELD });
    expect(res.status).toBe(403);
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(0);
  });

  it("requires a same-origin Origin header", async () => {
    const seeded = await seedTag();
    const body = { message: "hello", ...TURNSTILE_FIELD };
    expect((await finderPost(`/t/${seeded.token}/contact`, body, { origin: null })).status).toBe(403);
    expect(
      (await finderPost(`/t/${seeded.token}/contact`, body, { origin: "https://evil.example" })).status,
    ).toBe(403);
    expect((await finderPost(`/t/${seeded.token}/contact`, body, { origin: "null" })).status).toBe(403);
    // Browsers send "Origin: null" for same-origin form posts under Referrer-Policy: no-referrer.
    const sameSite = await finderPost(`/t/${seeded.token}/contact`, body, {
      origin: "null",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });
    expect(sameSite.status).toBe(303);
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(1);
  });

  it("rejects Origin: null unless Sec-Fetch-Site says same-origin", async () => {
    const seeded = await seedTag();
    const body = { message: "hello", ...TURNSTILE_FIELD };
    for (const site of ["cross-site", "same-site", "none", undefined]) {
      const res = await finderPost(`/t/${seeded.token}/contact`, body, {
        origin: "null",
        headers: site ? { "Sec-Fetch-Site": site } : {},
      });
      expect(res.status, String(site)).toBe(403);
    }
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(0);
  });

  it("requires a declared small url-encoded body", async () => {
    const seeded = await seedTag();
    const url = `${PUBLIC}/t/${seeded.token}/contact`;
    const base = { Origin: PUBLIC, "CF-Connecting-IP": uniqueIp() };
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("message=hi"));
        controller.close();
      },
    });
    const noLength = await worker.fetch(
      new Request(url, {
        method: "POST",
        headers: { ...base, "Content-Type": "application/x-www-form-urlencoded" },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(noLength.status).toBe(411);

    const form = new FormData();
    form.set("message", "hi");
    const multipart = await worker.fetch(
      new Request(url, { method: "POST", headers: { ...base, "Content-Length": "200" }, body: form }),
    );
    expect(multipart.status).toBe(415);

    const big = await finderPost(`/t/${seeded.token}/contact`, { message: "x".repeat(40_000) });
    expect(big.status).toBe(413);
  });

  it("caps a tag at 5 distinct sources per day and keeps the finder's text and contact options", async () => {
    const seeded = await seedTag();
    const sources: string[] = [];
    for (let n = 0; n < 5; n += 1) sources.push((await openConversation(seeded)).ip);
    const res = await finderPost(`/t/${seeded.token}/contact`, {
      message: "one more please keep me",
      ...TURNSTILE_FIELD,
    });
    expect(res.status).toBe(429);
    const html = await res.text();
    expect(html).toContain("We could not send your message right now");
    expect(html).toContain("one more please keep me");
    expect(html).toContain("backup@example.test");
    expect(html).toContain('href="mailto:ada@example.test"');
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(5);

    // A source that already contacted this tag is not locked out by the others.
    const again = await finderPost(
      `/t/${seeded.token}/contact`,
      { message: "second message from a known source", ...TURNSTILE_FIELD },
      { ip: sources[0] },
    );
    expect(again.status).toBe(303);
  });

  it("keeps one source from locking out the others", async () => {
    const seeded = await seedTag();
    const ip = uniqueIp();
    for (let n = 0; n < 3; n += 1) await openConversation(seeded, {}, { ip });
    expect(
      (await finderPost(`/t/${seeded.token}/contact`, { message: "x", ...TURNSTILE_FIELD }, { ip })).status,
    ).toBe(429);
    const other = await finderPost(`/t/${seeded.token}/contact`, { message: "hi", ...TURNSTILE_FIELD });
    expect(other.status).toBe(303);
  });

  it("applies the per-source cap atomically under concurrency", async () => {
    const seeded = await seedTag();
    const ip = uniqueIp();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        finderPost(`/t/${seeded.token}/contact`, { message: "burst", ...TURNSTILE_FIELD }, { ip }),
      ),
    );
    expect(results.filter((r) => r.status === 303)).toHaveLength(3);
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(3);
  });

  it("caps new conversations at 3 per IP per day", async () => {
    const ip = uniqueIp();
    for (let n = 0; n < 3; n += 1) await openConversation(await seedTag(), {}, { ip });
    const res = await finderPost(
      `/t/${(await seedTag()).token}/contact`,
      { message: "again", ...TURNSTILE_FIELD },
      { ip },
    );
    expect(res.status).toBe(429);
    expect(await res.text()).toContain("again");
  });

  it("treats every address in an IPv6 /64 as one client", async () => {
    expect(normalizeIp("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(normalizeIp("2001:DB8:1:2::9")).toBe("2001:db8:1:2::/64");
    expect(normalizeIp("::1")).toBe("0:0:0:0::/64");
    expect(normalizeIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");

    const a = "2001:db8:aa:bb::1";
    const sameNet = "2001:db8:aa:bb:ffff:eeee:dddd:1";
    const otherNet = "2001:db8:aa:cc::1";
    for (let n = 0; n < 3; n += 1) await openConversation(await seedTag(), {}, { ip: a });
    const capped = await finderPost(
      `/t/${(await seedTag()).token}/contact`,
      { message: "from the same /64", ...TURNSTILE_FIELD },
      { ip: sameNet },
    );
    expect(capped.status).toBe(429);
    const free = await finderPost(
      `/t/${(await seedTag()).token}/contact`,
      { message: "from another /64", ...TURNSTILE_FIELD },
      { ip: otherNet },
    );
    expect(free.status).toBe(303);

    // A block on one address covers the whole /64, and the limiter keys on the prefix too.
    const seeded = await seedTag();
    const blockedConv = await openConversation(seeded, {}, { ip: "2001:db8:dd:ee::5" });
    await apiJson("POST", `/conversations/${blockedConv.id}/block`, {});
    const blocked = await finderPost(
      `/t/${seeded.token}/contact`,
      { message: "neighbour", ...TURNSTILE_FIELD },
      { ip: "2001:db8:dd:ee::99" },
    );
    expect(blocked.status).toBe(429);

    const limit = vi.fn().mockResolvedValue({ success: true });
    const original = env.PUBLIC_WRITE_LIMIT;
    Object.defineProperty(env, "PUBLIC_WRITE_LIMIT", { value: { limit }, configurable: true });
    try {
      await finderPost(`/t/${seeded.token}/contact`, { message: "k" }, { ip: "2001:db8:dd:ee::99" });
      expect(limit).toHaveBeenCalledWith({ key: "w:2001:db8:dd:ee::/64" });
    } finally {
      Object.defineProperty(env, "PUBLIC_WRITE_LIMIT", { value: original, configurable: true });
    }
  });

  it("uses a shared bucket when the client IP is missing in production", async () => {
    const seeded = await seedTag();
    const limit = vi.fn().mockResolvedValue({ success: true });
    const originalLimit = env.PUBLIC_WRITE_LIMIT;
    const originalEnv = env.ENVIRONMENT;
    Object.defineProperty(env, "PUBLIC_WRITE_LIMIT", { value: { limit }, configurable: true });
    Object.defineProperty(env, "ENVIRONMENT", { value: "production", configurable: true });
    try {
      await finderPost(`/t/${seeded.token}/contact`, { message: "k" }, { ip: null });
      expect(limit).toHaveBeenCalledWith({ key: "w:unknown" });
    } finally {
      Object.defineProperty(env, "PUBLIC_WRITE_LIMIT", { value: originalLimit, configurable: true });
      Object.defineProperty(env, "ENVIRONMENT", { value: originalEnv, configurable: true });
    }
    limit.mockClear();
    await finderPost(`/t/${seeded.token}/contact`, { message: "k" }, { ip: null });
    expect(limit).not.toHaveBeenCalled();
  });

  it("rejects blocked IPs with the same generic answer", async () => {
    const seeded = await seedTag();
    const ip = uniqueIp();
    await env.DB.prepare(
      "INSERT INTO blocks (id, owner_id, ip_hmac, reason, expires_at, created_at) VALUES ('b1', ?, ?, 'spam', NULL, ?)",
    )
      .bind(seeded.ownerId, await hmacHex(env.IP_HMAC_SECRET, ip), new Date().toISOString())
      .run();
    const res = await finderPost(`/t/${seeded.token}/contact`, { message: "hi", ...TURNSTILE_FIELD }, { ip });
    expect(res.status).toBe(429);
    const lockedHtml = await res.text();
    expect(lockedHtml).not.toMatch(/blocked/i);
    expect(lockedHtml).toContain("We could not send your message right now");

    const expired = uniqueIp();
    await env.DB.prepare(
      "INSERT INTO blocks (id, owner_id, ip_hmac, reason, expires_at, created_at) VALUES ('b2', ?, ?, 'old', '2020-01-01T00:00:00.000Z', ?)",
    )
      .bind(seeded.ownerId, await hmacHex(env.IP_HMAC_SECRET, expired), new Date().toISOString())
      .run();
    const ok = await finderPost(
      `/t/${seeded.token}/contact`,
      { message: "hi", ...TURNSTILE_FIELD },
      { ip: expired },
    );
    expect(ok.status).toBe(303);
  });

  it("re-renders validation errors with the user's input", async () => {
    const seeded = await seedTag({ settings: { notifications: { notifyFinders: true } } });
    const res = await finderPost(`/t/${seeded.token}/contact`, {
      message: "   ",
      name: "Keep Me <b>",
      email: "not-an-email",
      ...TURNSTILE_FIELD,
    });
    expect(res.status).toBe(422);
    const html = await res.text();
    expect(html).toContain("Please write a message");
    expect(html).toContain("Please enter a valid e-mail address");
    expect(html).toContain('value="Keep Me &lt;b&gt;"');
    expect(html).toContain('value="not-an-email"');
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(0);

    const tooLong = await finderPost(`/t/${seeded.token}/contact`, {
      message: "x".repeat(4001),
      ...TURNSTILE_FIELD,
    });
    expect(tooLong.status).toBe(422);
  });

  it("ignores the finder e-mail unless the owner enabled finder notifications", async () => {
    const seeded = await seedTag();
    const page = await (await finderGet(`/t/${seeded.token}`)).text();
    expect(page).not.toContain('name="email"');
    const conv = await openConversation(seeded, { email: "finder@example.test" });
    const row = await env.DB.prepare("SELECT finder_email FROM conversations WHERE id = ?")
      .bind(conv.id)
      .first<{ finder_email: string | null }>();
    expect(row?.finder_email).toBeNull();
  });

  it("sends the private link to a finder who gave an e-mail when enabled", async () => {
    const seeded = await seedTag({
      settings: { notifications: { notifyFinders: true, emailAddress: "owner@example.test" } },
    });
    trackSpy(vi.spyOn(env.EMAIL, "send")).mockResolvedValue({ messageId: "m1" } as never);
    const conv = await openConversation(seeded, { email: "finder@example.test" });
    await vi.waitFor(async () => {
      expect(
        await count(
          "SELECT COUNT(*) AS n FROM notifications WHERE conversation_id = ? AND kind = 'finder.link' AND recipient = 'finder@example.test'",
          conv.id,
        ),
      ).toBe(1);
    });
  });

  it("requires explicit confirmation before storing a location", async () => {
    const seeded = await seedTag();
    const unconfirmed = await finderPost(`/t/${seeded.token}/contact`, {
      message: "hello",
      location_label: "Central station",
      ...TURNSTILE_FIELD,
    });
    expect(unconfirmed.status).toBe(422);
    expect(await unconfirmed.text()).toContain("agree to share it");
    expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(0);

    const gpsUnconfirmed = await finderPost(`/t/${seeded.token}/contact`, {
      message: "hello",
      location_source: "gps",
      location_lat: "52.52",
      location_lng: "13.405",
      ...TURNSTILE_FIELD,
    });
    expect(gpsUnconfirmed.status).toBe(422);

    const conv = await openConversation(seeded, {
      location_source: "gps",
      location_lat: "52.52",
      location_lng: "13.405",
      location_accuracy: "12.4",
      location_confirmed: "yes",
    });
    const stored = await env.DB.prepare("SELECT * FROM shared_locations WHERE conversation_id = ?")
      .bind(conv.id)
      .first<Record<string, unknown>>();
    expect(stored).toMatchObject({
      source: "gps",
      lat: 52.52,
      lng: 13.405,
      accuracy_m: 12.4,
      shared_by: "finder",
    });
    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).toContain("Open in Google Maps");
    expect(html).toContain("Open in Apple Maps");
    expect(html).toContain("google.com/maps/dir/");
    expect(html).not.toContain("<iframe");

    const manual = await openConversation(seeded, {
      location_label: "Platform 3",
      location_confirmed: "yes",
    });
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM shared_locations WHERE conversation_id = ? AND source = 'manual' AND label = 'Platform 3'",
        manual.id,
      ),
    ).toBe(1);
  });

  it("escapes finder input in the finder page and keeps it literal in owner JSON", async () => {
    const seeded = await seedTag();
    const xss = "<script>alert(1)</script>";
    const conv = await openConversation(seeded, { message: xss, name: "<img src=x onerror=alert(2)>" });
    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).not.toContain(xss);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

    const res = await api("GET", `/conversations/${conv.id}`);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const detail = (await res.json()) as ConversationDetail;
    expect(detail.messages[0]?.body).toBe(xss);
  });
});

describe("conversation page", () => {
  it("shows the thread to the holder of the token only", async () => {
    const a = await openConversation(await seedTag(), { message: "Message from finder A" });
    const b = await openConversation(await seedTag(), { message: "Message from finder B" });
    const pageA = await (await finderGet(`/c/${a.token}`)).text();
    expect(pageA).toContain("Message from finder A");
    expect(pageA).not.toContain("Message from finder B");
    expect(pageA).toContain("Save this private link to come back");

    // Unknown, malformed and swapped tokens are the same plain 404.
    const unknown = await finderGet(`/c/${"A".repeat(43)}`, { lang: "en" });
    const malformed = await finderGet("/c/not-a-token", { lang: "en" });
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(await unknown.text()).toBe(await malformed.text());
    expect((await finderGet(`/c/${a.token.slice(0, 42)}x`)).status).toBe(404);

    const post = await finderPost(`/c/${"B".repeat(43)}/messages`, { message: "intrusion" });
    expect(post.status).toBe(404);
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE body = 'intrusion'")).toBe(0);
    expect(b.id).not.toBe(a.id);
  });

  it("lets the finder reply, share a location and propose a return", async () => {
    const seeded = await seedTag({ settings: { notifications: { emailAddress: "owner@example.test" } } });
    const conv = await openConversation(seeded);
    const path = `/c/${conv.token}`;

    const reply = await finderPost(`${path}/messages`, { message: "Are you still there?" });
    expect(reply.status).toBe(303);
    expect(reply.headers.get("Location")).toBe(path);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND sender = 'finder'",
        conv.id,
      ),
    ).toBe(2);

    const empty = await finderPost(`${path}/messages`, { message: "" });
    expect(empty.status).toBe(422);
    expect(await empty.text()).toContain("Please write a message");

    const noConsent = await finderPost(`${path}/location`, { location_label: "Near the fountain" });
    expect(noConsent.status).toBe(422);
    const nothing = await finderPost(`${path}/location`, { location_confirmed: "yes" });
    expect(nothing.status).toBe(422);
    const shared = await finderPost(`${path}/location`, {
      location_source: "gps",
      location_lat: "41.38",
      location_lng: "2.17",
      location_accuracy: "30",
      location_confirmed: "yes",
    });
    expect(shared.status).toBe(303);

    const badProposal = await finderPost(`${path}/proposals`, { kind: "teleport", place: "" });
    expect(badProposal.status).toBe(422);
    const proposal = await finderPost(`${path}/proposals`, {
      kind: "hotel_reception",
      place: "Hotel Sol, Calle Mayor 1",
      meet_at: "2026-10-14T18:30",
      instructions: "Ask for Sam",
    });
    expect(proposal.status).toBe(303);

    const html = await (await finderGet(path)).text();
    expect(html).toContain("Hotel Sol, Calle Mayor 1");
    expect(html).toContain("Ask for Sam");
    expect(html).toContain("Are you still there?");
    expect(html).toContain("41.38000, 2.17000");
    await vi.waitFor(async () => {
      expect(
        await count("SELECT COUNT(*) AS n FROM notifications WHERE conversation_id = ?", conv.id),
      ).toBeGreaterThanOrEqual(1);
    });
  });

  it("exposes only lastActivityAt for polling and moves it on new activity", async () => {
    const conv = await openConversation(await seedTag());
    const first = (await (await finderGet(`/c/${conv.token}/state.json`)).json()) as Record<string, unknown>;
    expect(Object.keys(first)).toEqual(["lastActivityAt"]);
    await apiJson("POST", `/conversations/${conv.id}/messages`, { body: "Hello from the owner" });
    const second = (await (await finderGet(`/c/${conv.token}/state.json`)).json()) as {
      lastActivityAt: string;
    };
    expect(second.lastActivityAt > String(first.lastActivityAt)).toBe(true);
    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).toContain(`data-last-activity="${second.lastActivityAt}"`);
    expect(html).toContain("Hello from the owner");
    expect((await finderGet(`/c/${"A".repeat(43)}/state.json`)).status).toBe(404);
  });

  it("applies the capability headers to conversation pages", async () => {
    const conv = await openConversation(await seedTag());
    const res = await finderGet(`/c/${conv.token}`);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(await res.text()).toContain("data-copy");
  });

  it("is read-only once closed, and a blocked conversation looks closed", async () => {
    const conv = await openConversation(await seedTag());
    await apiJson("POST", `/conversations/${conv.id}/close`);
    const closed = await (await finderGet(`/c/${conv.token}`)).text();
    expect(closed).toContain("This conversation is closed");
    expect(closed).not.toContain('name="message"');
    for (const [path, body] of [
      ["messages", { message: "late" }],
      ["location", { location_label: "x", location_confirmed: "yes" }],
      ["proposals", { kind: "other", place: "x" }],
    ] as const) {
      expect((await finderPost(`/c/${conv.token}/${path}`, body)).status).toBe(409);
    }
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?", conv.id)).toBe(1);

    const other = await openConversation(await seedTag());
    await apiJson("POST", `/conversations/${other.id}/block`, { reason: "abuse" });
    const blocked = await finderGet(`/c/${other.token}`);
    expect(blocked.status).toBe(200);
    const html = await blocked.text();
    expect(html).toContain("This conversation is closed");
    expect(html).not.toMatch(/blocked/i);
    expect((await finderPost(`/c/${other.token}/messages`, { message: "hi" })).status).toBe(409);
  });
});

describe("return proposals", () => {
  async function propose(conv: { token: string }, place: string): Promise<void> {
    const res = await finderPost(`/c/${conv.token}/proposals`, { kind: "meeting_point", place });
    expect(res.status).toBe(303);
  }

  async function proposals(id: string): Promise<Proposal[]> {
    return (await apiJson<ConversationDetail>("GET", `/conversations/${id}`)).proposals;
  }

  it("runs the state machine: accept, supersede, recovery -> returning", async () => {
    const seeded = await seedTag();
    const recoveryId = await seedRecovery(seeded);
    const conv = await openConversation(seeded);

    await propose(conv, "Cafe Central");
    const [first] = await proposals(conv.id);
    expect(first).toMatchObject({ proposedBy: "finder", status: "proposed", place: "Cafe Central" });

    // The proposer cannot accept their own proposal; the owner can.
    const self = await finderPost(`/c/${conv.token}/proposals/${first?.id}/respond`, { action: "accept" });
    expect(self.status).toBe(403);
    const accepted = await apiJson<Proposal>(
      "POST",
      `/conversations/${conv.id}/proposals/${first?.id}/respond`,
      { action: "accept" },
    );
    expect(accepted.status).toBe("accepted");
    const recovery = await env.DB.prepare("SELECT status FROM recoveries WHERE id = ?")
      .bind(recoveryId)
      .first<{ status: string }>();
    expect(recovery?.status).toBe("returning");

    // Only 'proposed' can change.
    const again = await api("POST", `/conversations/${conv.id}/proposals/${first?.id}/respond`, {
      action: "decline",
    });
    expect(again.status).toBe(409);

    // The finder sees the accepted one highlighted with map links.
    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).toContain("status-accepted");
    expect(html).toContain("Open in Google Maps");

    // A newer owner proposal that the finder accepts supersedes the old agreement.
    const second = await apiJson<Proposal>("POST", `/conversations/${conv.id}/proposals`, {
      kind: "hotel_reception",
      place: "Hotel Sol",
    });
    const accept = await finderPost(`/c/${conv.token}/proposals/${second.id}/respond`, { action: "accept" });
    expect(accept.status).toBe(303);
    const after = await proposals(conv.id);
    expect(after.find((p) => p.id === first?.id)?.status).toBe("superseded");
    expect(after.find((p) => p.id === second.id)?.status).toBe("accepted");

    // Cancel only by the proposer; the other side declines.
    const third = await apiJson<Proposal>("POST", `/conversations/${conv.id}/proposals`, {
      kind: "other",
      place: "Pier 4",
    });
    expect(
      (await finderPost(`/c/${conv.token}/proposals/${third.id}/respond`, { action: "cancel" })).status,
    ).toBe(403);
    expect(
      (await api("POST", `/conversations/${conv.id}/proposals/${third.id}/respond`, { action: "accept" }))
        .status,
    ).toBe(403);
    expect(
      (await api("POST", `/conversations/${conv.id}/proposals/${third.id}/respond`, { action: "cancel" }))
        .status,
    ).toBe(200);
    expect(
      (await finderPost(`/c/${conv.token}/proposals/${third.id}/respond`, { action: "bogus" })).status,
    ).toBe(422);
  });

  it("never lets a proposal id from another conversation through", async () => {
    const a = await openConversation(await seedTag());
    const b = await openConversation(await seedTag());
    await propose(b, "Elsewhere");
    const [foreign] = await proposals(b.id);
    const res = await finderPost(`/c/${a.token}/proposals/${foreign?.id}/respond`, { action: "decline" });
    expect(res.status).toBe(404);
    expect((await proposals(b.id))[0]?.status).toBe("proposed");
    const viaApi = await api("POST", `/conversations/${a.id}/proposals/${foreign?.id}/respond`, {
      action: "accept",
    });
    expect(viaApi.status).toBe(404);
  });

  it("does not accept proposals or responses on a closed conversation", async () => {
    const conv = await openConversation(await seedTag());
    await propose(conv, "Cafe");
    const [p] = await proposals(conv.id);
    await apiJson("POST", `/conversations/${conv.id}/close`);
    expect(
      (await finderPost(`/c/${conv.token}/proposals/${p?.id}/respond`, { action: "cancel" })).status,
    ).toBe(409);
    expect(
      (await api("POST", `/conversations/${conv.id}/proposals/${p?.id}/respond`, { action: "accept" }))
        .status,
    ).toBe(409);
  });
});

describe("rate limiting", () => {
  it("answers 429 when the per-IP write budget is exhausted", async () => {
    const seeded = await seedTag();
    const limit = vi.fn().mockResolvedValue({ success: false });
    const original = env.PUBLIC_WRITE_LIMIT;
    Object.defineProperty(env, "PUBLIC_WRITE_LIMIT", { value: { limit }, configurable: true });
    try {
      const res = await finderPost(
        `/t/${seeded.token}/contact`,
        { message: "hi", ...TURNSTILE_FIELD },
        { ip: "203.0.113.9" },
      );
      expect(res.status).toBe(429);
      expect(limit).toHaveBeenCalledWith({ key: "w:203.0.113.9" });
      expect(await count("SELECT COUNT(*) AS n FROM conversations WHERE tag_id = ?", seeded.tagId)).toBe(0);
    } finally {
      Object.defineProperty(env, "PUBLIC_WRITE_LIMIT", { value: original, configurable: true });
    }
  });

  it("redirects finder paths requested on the app host to the public host", async () => {
    const res = await worker.fetch(
      new Request(`${APP}/t/0123456789abcdefghjkmnpqrs`, { redirect: "manual" }),
    );
    expect(res.status).toBe(308);
    expect(res.headers.get("Location")).toBe(`${PUBLIC}/t/0123456789abcdefghjkmnpqrs`);
  });
});

describe("degraded mode", () => {
  it("shows the typed message and the fallback e-mail when the database fails while saving", async () => {
    const seeded = await seedTag();
    const original = env.DB.prepare.bind(env.DB);
    trackSpy(vi.spyOn(env.DB, "prepare")).mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO conversations")) throw new Error("D1 write failed");
      return original(sql);
    });
    const res = await finderPost(`/t/${seeded.token}/contact`, {
      message: "please keep my words",
      ...TURNSTILE_FIELD,
    });
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("backup@example.test");
    expect(html).toContain("please keep my words");
    expect(html).not.toContain("D1 write failed");
  });

  it("answers 503 with the fallback e-mail when a conversation page cannot load", async () => {
    const conv = await openConversation(await seedTag());
    trackSpy(vi.spyOn(env.DB, "prepare")).mockImplementation(() => {
      throw new Error("D1 is down");
    });
    for (const path of [`/c/${conv.token}`, `/c/${conv.token}/state.json`]) {
      const res = await finderGet(path);
      expect(res.status, path).toBe(503);
      expect(await res.text()).toContain("backup@example.test");
    }
  });
});

describe("conversation privacy and caps", () => {
  it("never renders the item name, tag label or finder e-mail on the conversation page", async () => {
    const seeded = await seedTag({
      settings: { notifications: { notifyFinders: true } },
      item: { name: "PRIVATE-ITEM-NAME-77" },
    });
    const conv = await openConversation(seeded, { email: "finder-secret@example.test" });
    const tag = await env.DB.prepare("SELECT label FROM tags WHERE id = ?")
      .bind(seeded.tagId)
      .first<{ label: string }>();
    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).not.toContain("PRIVATE-ITEM-NAME-77");
    expect(html).not.toContain("finder-secret@example.test");
    expect(html).not.toContain(`>${tag?.label}<`);
    expect(html).not.toContain("Osprey");
  });

  it("caps finder messages, proposals and locations per conversation per day", async () => {
    const conv = await openConversation(await seedTag());
    const now = new Date().toISOString();
    const statements = [];
    for (let n = 0; n < 49; n += 1) {
      statements.push(
        env.DB.prepare(
          "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES (?, ?, 'finder', 'x', ?)",
        ).bind(`m-${conv.id}-${n}`, conv.id, now),
      );
    }
    for (let n = 0; n < 20; n += 1) {
      statements.push(
        env.DB.prepare(
          "INSERT INTO proposals (id, conversation_id, proposed_by, kind, place, status, created_at) VALUES (?, ?, 'finder', 'other', 'p', 'proposed', ?)",
        ).bind(`p-${conv.id}-${n}`, conv.id, now),
      );
    }
    for (let n = 0; n < 10; n += 1) {
      statements.push(
        env.DB.prepare(
          "INSERT INTO shared_locations (id, conversation_id, shared_by, source, label, created_at) VALUES (?, ?, 'finder', 'manual', 'l', ?)",
        ).bind(`l-${conv.id}-${n}`, conv.id, now),
      );
    }
    await env.DB.batch(statements);
    const path = `/c/${conv.token}`;

    // 49 + the opening message = 50: the 51st finder message is refused, but 50 would not be.
    const refused = await finderPost(`${path}/messages`, { message: "message number fifty-one" });
    expect(refused.status).toBe(429);
    const html = await refused.text();
    expect(html).toContain("limit for this conversation");
    expect(html).toContain("message number fifty-one");
    expect((await finderPost(`${path}/proposals`, { kind: "other", place: "again" })).status).toBe(429);
    expect(
      (await finderPost(`${path}/location`, { location_label: "again", location_confirmed: "yes" })).status,
    ).toBe(429);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND body = 'message number fifty-one'",
        conv.id,
      ),
    ).toBe(0);

    // The owner is never capped.
    expect((await api("POST", `/conversations/${conv.id}/messages`, { body: "owner reply" })).status).toBe(
      201,
    );
    expect(
      (await api("POST", `/conversations/${conv.id}/proposals`, { kind: "other", place: "o" })).status,
    ).toBe(201);
  });
});
