import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PushConfig,
  PushPayload,
  PushSubscriptionView,
  PushTestResult,
  SystemStatus,
} from "../src/shared/schemas";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import { saveSettings } from "../src/worker/db/settings";
import { notifyOwner } from "../src/worker/services/notify";
import { MAX_FOLLOW_UP_PUSHES_PER_HOUR, MAX_PUSHES_PER_HOUR } from "../src/worker/services/push/owner-push";
import { loadVapid } from "../src/worker/services/push/webpush";
import { api, apiJson } from "./helpers/api";
import { seedForeignOwner } from "./helpers/files";
import { ownerId as currentOwnerId } from "./helpers/public";
import {
  type CapturedPush,
  type Device,
  decryptRequest,
  ENDPOINT,
  type FakePushService,
  fakePushService,
  newDevice,
  seedSubscription,
} from "./helpers/push";

const CONVERSATION = "0b9c1a52-4d3e-4f60-8a71-5c2d9e8f7a10";
const SECRET_TEXT = "my passport is in locker 42, call 600123456";
const ITEM_NAME = "Red Backpack";

let service: FakePushService;
let owner: string;

function pushed(index: number): CapturedPush {
  const request = service.requests[index];
  if (!request) throw new Error(`no push request #${index}`);
  return request;
}

async function pushRows(
  where = "1 = 1",
): Promise<{ status: string; error: string | null; recipient: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT status, error, recipient FROM notifications WHERE owner_id = ? AND channel = 'push' AND ${where} ORDER BY created_at, rowid`,
  )
    .bind(owner)
    .all<{ status: string; error: string | null; recipient: string }>();
  return results;
}

async function setPush(patch: { enabled?: boolean; showItemName?: boolean; mutedUntil?: string | null }) {
  const { mutedUntil, ...push } = patch;
  await saveSettings(env.DB, owner, {
    ...DEFAULT_SETTINGS,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      emailEnabled: false,
      ...(mutedUntil === undefined ? {} : { mutedUntil }),
      push: { ...DEFAULT_SETTINGS.notifications.push, ...push },
    },
  });
}

beforeEach(async () => {
  owner = await currentOwnerId();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM push_subscriptions WHERE owner_id = ?").bind(owner),
    env.DB.prepare("DELETE FROM notifications WHERE owner_id = ?").bind(owner),
  ]);
  await setPush({});
  service = fakePushService(201);
});

afterEach(() => {
  service.restore();
});

describe("owner push API", () => {
  let device: Device;
  beforeEach(async () => {
    device = await newDevice();
  });

  const subscribe = (endpoint: string, d: Device = device, label?: string) =>
    api("POST", "/push/subscriptions", { endpoint, keys: { p256dh: d.p256dh, auth: d.auth }, label });

  it("exposes the public VAPID key and never the private one", async () => {
    const res = await api("GET", "/push/config");
    const config = (await res.json()) as PushConfig;
    expect(config.vapidPublicKey).toBe(env.VAPID_PUBLIC_KEY);
    expect(JSON.stringify(config)).not.toContain(env.VAPID_PRIVATE_KEY ?? "missing");
  });

  it("registers a device idempotently and lists it without secrets", async () => {
    const endpoint = `${ENDPOINT}abc`;
    const first = await subscribe(endpoint, device, "iPhone (Home Screen)");
    expect(first.status).toBe(201);
    const { id } = (await first.json()) as { id: string };

    const again = await subscribe(endpoint, device, "iPhone 15");
    expect(((await again.json()) as { id: string }).id).toBe(id);

    const raw = await (await api("GET", "/push/subscriptions")).text();
    const { subscriptions } = JSON.parse(raw) as { subscriptions: PushSubscriptionView[] };
    expect(subscriptions).toEqual([
      {
        id,
        service: "google",
        label: "iPhone 15",
        createdAt: expect.any(String),
        lastSuccessAt: null,
        lastFailureAt: null,
        failures: 0,
      },
    ]);
    for (const secret of [endpoint, device.p256dh, device.auth]) expect(raw).not.toContain(secret);
  });

  it("re-registering resets the failure counters", async () => {
    const { id, endpoint } = await seedSubscription(owner, device, {
      failures: 3,
      firstFailureAt: "2026-01-01T00:00:00.000Z",
    });
    await subscribe(endpoint);
    const row = await env.DB.prepare(
      "SELECT failures, first_failure_at AS f FROM push_subscriptions WHERE id = ?",
    )
      .bind(id)
      .first();
    expect(row).toEqual({ failures: 0, f: null });
  });

  it.each([
    ["plain http", "http://fcm.googleapis.com/fcm/send/x"],
    ["unknown host", "https://push.evil.example/x"],
    ["allowed host as a prefix of another", "https://fcm.googleapis.com.evil.example/x"],
    ["allowed host in the path", "https://evil.example/fcm.googleapis.com"],
    ["credentials in the URL", "https://user:pw@fcm.googleapis.com/x"],
    ["explicit port", "https://fcm.googleapis.com:8443/x"],
    ["bare apple suffix", "https://push.apple.com.evil.example/x"],
    ["loopback", "https://localhost/x"],
    ["allowed host with a trailing dot", "https://fcm.googleapis.com./fcm/send/x"],
    ["not a URL", "fcm.googleapis.com/x"],
    ["too long", `https://fcm.googleapis.com/${"a".repeat(1100)}`],
  ])("rejects an endpoint that is %s", async (_name, endpoint) => {
    expect((await subscribe(endpoint)).status).toBe(422);
    expect((await api("GET", "/push/subscriptions").then((r) => r.json())) as object).toEqual({
      subscriptions: [],
    });
  });

  it.each([
    "https://fcm.googleapis.com/fcm/send/a",
    "https://FCM.GoogleAPIs.com/fcm/send/upper",
    "https://updates.push.services.mozilla.com/wpush/v2/a",
    "https://web.push.apple.com/a",
    "https://wns2-par02p.notify.windows.com/w/?token=a",
  ])("accepts the known push service endpoint %s", async (endpoint) => {
    expect((await subscribe(endpoint)).status).toBe(201);
  });

  it("rejects malformed keys, including a point that is not on the curve", async () => {
    const body = (keys: object) => api("POST", "/push/subscriptions", { endpoint: `${ENDPOINT}k`, keys });
    expect((await body({ p256dh: "short", auth: device.auth })).status).toBe(422);
    expect((await body({ p256dh: device.p256dh, auth: "short" })).status).toBe(422);
    const offCurve = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]).toString("base64url");
    expect((await body({ p256dh: offCurve, auth: device.auth })).status).toBe(422);
  });

  it("requires Access and a same-origin Origin", async () => {
    const body = { endpoint: `${ENDPOINT}o`, keys: { p256dh: device.p256dh, auth: device.auth } };
    expect((await api("POST", "/push/subscriptions", body, { jwt: null })).status).toBe(401);
    expect((await api("POST", "/push/subscriptions", body, { origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect((await api("POST", "/push/subscriptions", body, { origin: null })).status).toBe(403);
    expect((await api("GET", "/push/config", undefined, { jwt: null })).status).toBe(401);
  });

  it("keeps devices per owner: foreign rows are invisible, undeletable and cannot be taken over", async () => {
    await seedForeignOwner();
    const foreign = await seedSubscription("foreign", await newDevice(), { endpoint: `${ENDPOINT}foreign` });
    const list = (await (await api("GET", "/push/subscriptions")).json()) as {
      subscriptions: { id: string }[];
    };
    expect(list.subscriptions.map((s) => s.id)).not.toContain(foreign.id);
    expect((await api("DELETE", `/push/subscriptions/${foreign.id}`)).status).toBe(404);
    expect((await api("POST", "/push/test", { subscriptionId: foreign.id })).status).toBe(404);
    const taken = await subscribe(foreign.endpoint);
    expect(taken.status).toBe(409);
    expect(
      await env.DB.prepare("SELECT owner_id FROM push_subscriptions WHERE id = ?").bind(foreign.id).first(),
    ).toEqual({
      owner_id: "foreign",
    });
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(foreign.id).run();
  });

  it("deletes a device and then answers 404", async () => {
    const { id } = (await (await subscribe(`${ENDPOINT}del`)).json()) as { id: string };
    expect((await api("DELETE", `/push/subscriptions/${id}`)).status).toBe(204);
    expect((await api("DELETE", `/push/subscriptions/${id}`)).status).toBe(404);
  });

  it("caps the number of devices", async () => {
    for (let i = 0; i < 10; i++) expect((await subscribe(`${ENDPOINT}cap${i}`)).status).toBe(201);
    expect((await subscribe(`${ENDPOINT}cap10`)).status).toBe(409);
    expect((await subscribe(`${ENDPOINT}cap3`)).status).toBe(201);
  });

  describe("test push", () => {
    it("explains what is missing", async () => {
      const none = (await (await api("POST", "/push/test")).json()) as PushTestResult;
      expect(none).toEqual({ ok: false, code: "no_subscriptions", results: [] });
    });

    it("sends an encrypted, content-free test to each device and reports the outcome", async () => {
      const a = await seedSubscription(owner, device);
      const res = await api("POST", "/push/test");
      expect(await res.json()).toEqual({
        ok: true,
        code: "sent",
        results: [{ id: a.id, status: "sent", error: null }],
      });
      const request = service.requests[0];
      expect(request?.url).toBe(a.endpoint);
      expect(await decryptRequest(pushed(0), device)).toMatchObject({
        web_push: 8030,
        return: { v: 1, kind: "test", conversationId: null },
      });
      expect(await pushRows()).toEqual([{ status: "sent", error: null, recipient: a.id }]);
    });

    it("targets one device when asked and drops a device the push service reports gone", async () => {
      const keep = await seedSubscription(owner, device);
      const dead = await seedSubscription(owner, await newDevice());
      service.restore();
      service = fakePushService((r) => (r.url === dead.endpoint ? 410 : 201));
      const result = (await (
        await api("POST", "/push/test", { subscriptionId: dead.id })
      ).json()) as PushTestResult;
      expect(result).toMatchObject({ ok: false, code: "failed", results: [{ id: dead.id, status: "gone" }] });
      expect(service.requests).toHaveLength(1);
      const left = await env.DB.prepare("SELECT id FROM push_subscriptions WHERE owner_id = ?")
        .bind(owner)
        .all();
      expect(left.results).toEqual([{ id: keep.id }]);
    });
  });

  it("loadVapid refuses a missing secret and a mismatched pair", async () => {
    expect(await loadVapid({ ...env, VAPID_PRIVATE_KEY: undefined })).toBeNull();
    expect(await loadVapid({ ...env, VAPID_PUBLIC_KEY: "" })).toBeNull();
    const other = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const mismatched = Buffer.from(
      (await crypto.subtle.exportKey("raw", other.publicKey)) as ArrayBuffer,
    ).toString("base64url");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadVapid({ ...env, VAPID_PUBLIC_KEY: mismatched })).toBeNull();
    errors.mockRestore();
    expect(await loadVapid(env)).not.toBeNull();
  });
});

describe("owner events push to devices", () => {
  let device: Device;
  beforeEach(async () => {
    device = await newDevice();
  });

  const event = (
    kind: "new_message" | "new_conversation" | "proposal" | "lost_item_scanned" = "new_message",
  ) =>
    notifyOwner(env, owner, {
      kind,
      itemName: ITEM_NAME,
      conversationId: CONVERSATION,
      preview: SECRET_TEXT,
    });

  it("sends a declarative payload with neither message text nor the item name by default", async () => {
    await seedSubscription(owner, device);
    await event();
    expect(service.requests).toHaveLength(1);
    const payload = (await decryptRequest(pushed(0), device)) as PushPayload;
    expect(payload).toEqual({
      web_push: 8030,
      notification: {
        title: "RETURN",
        body: "New message about an item",
        navigate: `https://app.return.test/conversations/${CONVERSATION}`,
        lang: "en",
        tag: `c-${CONVERSATION}`,
      },
      return: { v: 1, kind: "new_message", conversationId: CONVERSATION },
    });
    const serialized = JSON.stringify(payload);
    for (const leaked of [SECRET_TEXT, "passport", "locker", ITEM_NAME, "Backpack"]) {
      expect(serialized).not.toContain(leaked);
    }
  });

  it("adds the item name, never the message text, when the owner opts in", async () => {
    await setPush({ showItemName: true });
    await seedSubscription(owner, device);
    await event();
    const payload = (await decryptRequest(pushed(0), device)) as PushPayload;
    expect(payload.notification.body).toBe(`New message about an item: ${ITEM_NAME}`);
    expect(JSON.stringify(payload)).not.toContain("passport");
  });

  it("uses the owner's panel language", async () => {
    await saveSettings(env.DB, owner, {
      ...DEFAULT_SETTINGS,
      identity: { ...DEFAULT_SETTINGS.identity, panelLanguage: "es" },
      notifications: { ...DEFAULT_SETTINGS.notifications, emailEnabled: false },
    });
    await seedSubscription(owner, device);
    await event("new_conversation");
    const payload = (await decryptRequest(pushed(0), device)) as PushPayload;
    expect(payload.notification).toMatchObject({ lang: "es", body: "Alguien ha encontrado un objeto" });
  });

  it("sets TTL, Urgency, Topic and the VAPID header, and logs one row per device", async () => {
    const a = await seedSubscription(owner, device);
    const b = await seedSubscription(owner, await newDevice());
    await event("new_conversation");
    expect(service.requests).toHaveLength(2);
    const headers = service.requests[0]?.headers;
    expect(headers?.get("TTL")).toBe("86400");
    expect(headers?.get("Urgency")).toBe("high");
    expect(headers?.get("Topic")).toBe("c0b9c1a524d3e4f60");
    expect(headers?.get("Content-Encoding")).toBe("aes128gcm");
    expect(headers?.get("Authorization")).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    const rows = await pushRows();
    expect(rows.map((r) => r.recipient).sort()).toEqual([a.id, b.id].sort());
    expect(rows.every((r) => r.status === "sent" && r.error === null)).toBe(true);
    const stored = await env.DB.prepare("SELECT last_success_at AS s FROM push_subscriptions WHERE id = ?")
      .bind(a.id)
      .first<{ s: string | null }>();
    expect(stored?.s).not.toBeNull();
  });

  it("uses normal urgency for follow-ups and omits the topic without a conversation", async () => {
    await seedSubscription(owner, device);
    await event("proposal");
    expect(service.requests[0]?.headers.get("Urgency")).toBe("normal");
    await notifyOwner(env, owner, { kind: "lost_item_scanned", itemName: ITEM_NAME });
    expect(service.requests[1]?.headers.get("Urgency")).toBe("high");
    expect(service.requests[1]?.headers.has("Topic")).toBe(false);
    const payload = (await decryptRequest(pushed(1), device)) as PushPayload;
    expect(payload.notification).toMatchObject({
      navigate: "https://app.return.test/",
      tag: "lost_item_scanned",
    });
  });

  it.each([
    ["push is switched off", () => setPush({ enabled: false })],
    [
      "notifications are muted",
      () => setPush({ mutedUntil: new Date(Date.now() + 3_600_000).toISOString() }),
    ],
  ])("sends nothing when %s", async (_name, arrange) => {
    await arrange();
    await seedSubscription(owner, device);
    await event();
    expect(service.requests).toHaveLength(0);
  });

  it("respects the per-event toggle", async () => {
    await saveSettings(env.DB, owner, {
      ...DEFAULT_SETTINGS,
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        emailEnabled: false,
        events: { ...DEFAULT_SETTINGS.notifications.events, newMessage: false },
      },
    });
    await seedSubscription(owner, device);
    await event("new_message");
    expect(service.requests).toHaveLength(0);
    await event("new_conversation");
    expect(service.requests).toHaveLength(1);
  });

  it("limits follow-ups to one per conversation per cooldown, but never first contact", async () => {
    await seedSubscription(owner, device);
    await event("new_message");
    await event("proposal");
    expect(service.requests).toHaveLength(1);
    await event("new_conversation");
    expect(service.requests).toHaveLength(2);
    await env.DB.prepare("UPDATE notifications SET created_at = ? WHERE owner_id = ?")
      .bind(new Date(Date.now() - 3 * 60_000).toISOString(), owner)
      .run();
    await event("new_message");
    expect(service.requests).toHaveLength(3);
  });

  /** `events` past pushes to `devices` devices each; every event gets its own timestamp, like production. */
  async function seedPastEvents(events: number, devices: number, kind = "owner.new_message") {
    const base = Date.now() - 60_000;
    await env.DB.batch(
      Array.from({ length: events * devices }, (_, n) =>
        env.DB.prepare(
          `INSERT INTO notifications (id, owner_id, channel, kind, recipient, conversation_id, status, created_at)
           VALUES (?, ?, 'push', ?, ?, ?, 'sent', ?)`,
        ).bind(
          `past-${kind}-${n}`,
          owner,
          kind,
          `device-${n % devices}`,
          `past-conv-${Math.floor(n / devices)}`,
          new Date(base + Math.floor(n / devices)).toISOString(),
        ),
      ),
    );
  }

  it("counts events, not deliveries: 30 follow-ups on 2 devices still let first contact reach both", async () => {
    await seedSubscription(owner, device);
    await seedSubscription(owner, await newDevice());
    await seedPastEvents(30, 2);
    await event("new_conversation");
    expect(service.requests).toHaveLength(2);
  });

  it("stops follow-ups at 40 events an hour but keeps room for first contact and scans", async () => {
    await seedSubscription(owner, device);
    await seedSubscription(owner, await newDevice());
    await seedPastEvents(MAX_FOLLOW_UP_PUSHES_PER_HOUR, 2);
    await event("new_message");
    expect(service.requests).toHaveLength(0);
    expect(await pushRows("status = 'skipped'")).toEqual([
      { status: "skipped", error: "hourly_cap", recipient: "all" },
    ]);
    await event("new_conversation");
    await notifyOwner(env, owner, { kind: "lost_item_scanned", itemName: ITEM_NAME });
    expect(service.requests).toHaveLength(4);
  });

  it("stops everything at 60 events an hour and always sends an allowed event to every device", async () => {
    await seedSubscription(owner, device);
    await seedSubscription(owner, await newDevice());
    await seedPastEvents(MAX_PUSHES_PER_HOUR - 1, 2);
    await event("new_conversation");
    expect(service.requests).toHaveLength(2);
    await event("lost_item_scanned");
    expect(service.requests).toHaveLength(2);
  });

  it("does not count test pushes toward the cap", async () => {
    await seedSubscription(owner, device);
    await seedPastEvents(MAX_PUSHES_PER_HOUR + 5, 1, "owner.test");
    await event("new_message");
    expect(service.requests).toHaveLength(1);
  });

  it("deletes a subscription the push service reports gone (404 and 410)", async () => {
    service.restore();
    service = fakePushService((r) => (r.url.endsWith("/a") ? 410 : 404));
    await seedSubscription(owner, device, { endpoint: `${ENDPOINT}a` });
    await seedSubscription(owner, await newDevice(), { endpoint: `${ENDPOINT}b` });
    await event();
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE owner_id = ?")
      .bind(owner)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
    expect(await pushRows()).toEqual([
      { status: "skipped", error: "subscription_gone", recipient: expect.any(String) },
      { status: "skipped", error: "subscription_gone", recipient: expect.any(String) },
    ]);
  });

  it("counts other failures and survives them without throwing", async () => {
    service.restore();
    service = fakePushService((r) => (r.url.endsWith("/boom") ? new TypeError("network") : 503));
    await seedSubscription(owner, device, { endpoint: `${ENDPOINT}x` });
    await seedSubscription(owner, await newDevice(), { endpoint: `${ENDPOINT}boom` });
    await expect(event()).resolves.toBeUndefined();
    const rows = await env.DB.prepare(
      "SELECT id, failures, last_failure_at AS l FROM push_subscriptions WHERE owner_id = ? ORDER BY id",
    )
      .bind(owner)
      .all<{ id: string; failures: number; l: string | null }>();
    expect(rows.results.map((r) => [r.failures, r.l !== null])).toEqual([
      [1, true],
      [1, true],
    ]);
    expect((await pushRows()).map((r) => r.error).sort()).toEqual(["http_503", "network_error"]);
  });

  it.each([400, 401, 403, 413])(
    "HTTP %i keeps the subscription, does not count as a failure and shows in System status",
    async (status) => {
      service.restore();
      service = fakePushService(status);
      const { id } = await seedSubscription(owner, device);
      await event();
      const row = await env.DB.prepare(
        "SELECT failures, first_failure_at AS f, last_failure_at AS l FROM push_subscriptions WHERE id = ?",
      )
        .bind(id)
        .first();
      expect(row).toEqual({ failures: 0, f: null, l: null });
      expect(await pushRows()).toEqual([{ status: "failed", error: `http_${status}`, recipient: id }]);
      const system = await apiJson<SystemStatus>("GET", "/system");
      expect(system.push).toMatchObject({ subscriptions: 1, recentFailures: 1 });
    },
  );

  it("never deletes a device that is rejected, however long it has been rejected", async () => {
    service.restore();
    service = fakePushService(403);
    const { id } = await seedSubscription(owner, device, {
      failures: 4,
      firstFailureAt: new Date(Date.now() - 72 * 3_600_000).toISOString(),
    });
    await event();
    const row = await env.DB.prepare("SELECT failures FROM push_subscriptions WHERE id = ?").bind(id).first();
    expect(row).toEqual({ failures: 4 });
  });

  it("treats 429 and 5xx as transient failures", async () => {
    service.restore();
    service = fakePushService((r) => (r.url.endsWith("/rl") ? 429 : 500));
    await seedSubscription(owner, device, { endpoint: `${ENDPOINT}rl` });
    await seedSubscription(owner, await newDevice(), { endpoint: `${ENDPOINT}err` });
    await event();
    const { results } = await env.DB.prepare("SELECT failures FROM push_subscriptions WHERE owner_id = ?")
      .bind(owner)
      .all();
    expect(results).toEqual([{ failures: 1 }, { failures: 1 }]);
  });

  it("does not follow a redirect from a push service", async () => {
    service.restore();
    const redirect = vi.spyOn(globalThis, "fetch");
    const previous = redirect.getMockImplementation();
    const seen: string[] = [];
    redirect.mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      if (!request.url.startsWith(ENDPOINT))
        return previous ? previous(input, init) : new Response(null, { status: 500 });
      seen.push(request.url);
      return new Response(null, { status: 307, headers: { Location: "https://evil.example/steal" } });
    });
    const { id } = await seedSubscription(owner, device);
    await event();
    expect(seen).toHaveLength(1);
    expect(await pushRows()).toEqual([{ status: "failed", error: "http_3xx", recipient: id }]);
    if (previous) redirect.mockImplementation(previous);
  });

  it("drops a subscription after five failures spanning 24 hours, not before", async () => {
    service.restore();
    service = fakePushService(503);
    const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const young = await seedSubscription(owner, device, {
      failures: 4,
      firstFailureAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    await seedSubscription(owner, await newDevice(), { failures: 4, firstFailureAt: twoDaysAgo });
    await event();
    const left = await env.DB.prepare("SELECT id FROM push_subscriptions WHERE owner_id = ?")
      .bind(owner)
      .all();
    expect(left.results).toEqual([{ id: young.id }]);
  });

  it("does not touch email counters and email does not count push rows", async () => {
    const now = new Date().toISOString();
    await env.DB.batch(
      Array.from({ length: 45 }, (_, i) =>
        env.DB.prepare(
          `INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, created_at)
           VALUES (?, ?, 'push', 'owner.new_message', 'x', 'sent', ?)`,
        ).bind(`pushrow-${i}`, owner, now),
      ),
    );
    await saveSettings(env.DB, owner, {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications, emailAddress: "owner@example.test" },
    });
    const send = vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "t" } as never);
    await event("new_conversation");
    expect(send).toHaveBeenCalledOnce();
    send.mockRestore();
  });

  it("a failed push is not an email failure: System and alerts keep reporting the last email", async () => {
    const t = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, created_at)
         VALUES ('mail-ok', ?, 'email', 'owner.new_message', 'a@b.test', 'sent', ?)`,
      ).bind(owner, new Date(t - 5000).toISOString()),
      env.DB.prepare(
        `INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, error, created_at)
         VALUES ('push-bad', ?, 'push', 'owner.new_message', 'sub', 'failed', 'http_403', ?)`,
      ).bind(owner, new Date(t).toISOString()),
    ]);
    const system = await apiJson<SystemStatus>("GET", "/system");
    expect(system.email.lastOwnerDelivery).toMatchObject({ status: "sent", code: null });
    expect(system.email.recentFailures).toBe(0);
    expect(system.push.recentFailures).toBe(1);
    const alerts = await apiJson<{ alerts: { kind: string; code: string }[] }>("GET", "/alerts");
    expect(alerts.alerts.filter((a) => a.code !== "email_not_configured")).toEqual([]);
  });

  it("a push sent a moment ago does not suppress the follow-up email", async () => {
    await env.DB.prepare(
      `INSERT INTO notifications (id, owner_id, channel, kind, recipient, conversation_id, status, created_at)
       VALUES ('push-now', ?, 'push', 'owner.new_message', 'sub', ?, 'sent', ?)`,
    )
      .bind(owner, CONVERSATION, new Date().toISOString())
      .run();
    await saveSettings(env.DB, owner, {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications, emailAddress: "owner@example.test" },
    });
    const send = vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "t" } as never);
    await event("new_message");
    expect(send).toHaveBeenCalledOnce();
    send.mockRestore();
  });

  it("still emails the owner when push delivery fails", async () => {
    service.restore();
    service = fakePushService(new TypeError("down") as never);
    await seedSubscription(owner, device);
    await saveSettings(env.DB, owner, {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications, emailAddress: "owner@example.test" },
    });
    const send = vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "t" } as never);
    await event("new_conversation");
    expect(send).toHaveBeenCalledOnce();
    send.mockRestore();
  });

  it("reports push facts in the system status without counting them as email failures", async () => {
    service.restore();
    service = fakePushService(503);
    await seedSubscription(owner, device);
    await event();
    const status = await apiJson<SystemStatus>("GET", "/system");
    expect(status.push).toEqual({
      configured: true,
      subscriptions: 1,
      recentFailures: 1,
      lastSuccessAt: null,
    });
    expect(status.email.recentFailures).toBe(0);
  });
});
