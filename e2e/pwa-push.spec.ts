/**
 * Owner push client (ADR 0003, task 4.3) in the PRODUCTION build (see pwa.spec.ts for why). Chromium cannot reach a
 * real push service from CI, so `PushManager.subscribe/getSubscription` are replaced by an in-page fake that returns
 * a well-formed subscription (real P-256 key, known push host); everything else is real: the permission state, the
 * panel UI, the owner API and database, the service worker and its `push` / `notificationclick` handlers. Pushes are
 * delivered to the worker through the DevTools protocol, exactly as a push service would.
 */
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

const ORIGIN = "http://localhost:5198";
/** The production VAPID public key from wrangler.jsonc; the private half is not configured locally. */
const VAPID_PUBLIC_KEY =
  "<vapid-public-key>";

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const KEYS = {
  p256dh: ecdh.getPublicKey().toString("base64url"),
  auth: randomBytes(16).toString("base64url"),
};

test.use({ baseURL: ORIGIN, permissions: ["notifications"] });
test.describe.configure({ mode: "serial" });

async function prepare(page: Page, endpoint: string) {
  await page.addInitScript(
    ({ endpoint, keys }) => {
      const STORE = "e2e.fakePush";
      const toBytes = (b64: string) =>
        Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
      const make = () => ({
        endpoint,
        expirationTime: null,
        options: {},
        getKey: (name: string) => toBytes(name === "auth" ? keys.auth : keys.p256dh).buffer,
        toJSON: () => ({ endpoint, expirationTime: null, keys }),
        unsubscribe: async () => {
          localStorage.removeItem(STORE);
          return true;
        },
      });
      const w = window as unknown as {
        __subscribeOptions?: { userVisibleOnly: boolean; keyLength: number; firstByte: number };
      };
      PushManager.prototype.getSubscription = async () =>
        localStorage.getItem(STORE) ? (make() as never) : null;
      PushManager.prototype.subscribe = async (options?: PushSubscriptionOptionsInit) => {
        const key = new Uint8Array(options?.applicationServerKey as ArrayBuffer);
        w.__subscribeOptions = {
          userVisibleOnly: options?.userVisibleOnly === true,
          keyLength: key.length,
          firstByte: key[0] ?? -1,
        };
        localStorage.setItem(STORE, "1");
        return make() as never;
      };
    },
    { endpoint, keys: KEYS },
  );
  await page.route("**/api/push/config", (route) =>
    route.fulfill({ json: { vapidPublicKey: VAPID_PUBLIC_KEY } }),
  );
}

/** Loads the panel and waits until the service worker controls the page (as in pwa.spec.ts). */
async function openControlled(page: Page, path = "/") {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  if (path !== "/") await page.goto(path);
}

/**
 * Reads the notifications from inside the worker. (Asking from the page while a push is being handled keeps the
 * notification from appearing in Chromium, so the page never polls `getNotifications`.)
 */
const shown = async (context: BrowserContext) => {
  // The browser may have replaced the worker process since it was first listed: ask every handle, keep live answers.
  for (const worker of context.serviceWorkers().reverse()) {
    try {
      return await worker.evaluate(async () => {
        const scope = self as unknown as { registration: ServiceWorkerRegistration };
        return (await scope.registration.getNotifications()).map((n) => ({
          title: n.title,
          body: n.body,
          tag: n.tag,
          data: n.data,
          icon: n.icon,
        }));
      });
    } catch {
      // Stale handle: try the next one.
    }
  }
  return [];
};

/** Notifications currently on screen, once exactly `count` are (the browser shows them asynchronously). */
async function notificationsShown(context: BrowserContext, count: number) {
  await expect
    .poll(async () => (await shown(context)).length, { timeout: 15_000, intervals: [500] })
    .toBe(count);
  return shown(context);
}

async function deliver(context: BrowserContext, page: Page, data: string) {
  const cdp = await context.newCDPSession(page);
  const registrationId = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
      const reg = e.registrations.find((r) => r.scopeURL.startsWith(ORIGIN));
      if (reg) resolve(reg.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  const id = await registrationId;
  // `deliverPushMessage` is occasionally dropped by Chromium right after a context starts; the push service would
  // retry, so the helper does too, until the notifications on screen change.
  const before = JSON.stringify(await shown(context));
  for (let attempt = 0; attempt < 4; attempt++) {
    await cdp.send("ServiceWorker.deliverPushMessage", { origin: ORIGIN, registrationId: id, data });
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(500);
      if (JSON.stringify(await shown(context)) !== before) return;
    }
  }
}

const clearNotifications = (context: BrowserContext) => {
  const [worker] = context.serviceWorkers();
  return worker?.evaluate(async () => {
    const scope = self as unknown as { registration: ServiceWorkerRegistration };
    for (const n of await scope.registration.getNotifications()) n.close();
  });
};

test("turning notifications on registers this device; it is listed, survives a reload and turning off deletes it", async ({
  page,
  request,
}) => {
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${randomUUID()}`;
  const name = `E2E phone ${randomUUID().slice(0, 6)}`;
  await prepare(page, endpoint);
  await openControlled(page, "/settings/notifications");

  await expect(page.getByRole("heading", { name: "Notifications on this device" })).toBeVisible();
  await page.getByLabel("Device name").fill(name);
  const posted = page.waitForRequest(
    (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/push/subscriptions",
  );
  await page.getByRole("button", { name: "Turn on for this device" }).click();
  expect((await posted).postDataJSON()).toEqual({ endpoint, keys: KEYS, label: name });
  expect(
    await page.evaluate(() => (window as unknown as { __subscribeOptions: unknown }).__subscribeOptions),
  ).toEqual({
    userVisibleOnly: true,
    keyLength: 65,
    firstByte: 4,
  });

  await expect(page.getByText("On for this device")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByText("This device")).toBeVisible();
  const listed = await (await request.get("/api/push/subscriptions")).json();
  expect(listed.subscriptions.map((s: { label: string }) => s.label)).toContain(name);
  expect(JSON.stringify(listed)).not.toContain(endpoint);

  await page.reload();
  await expect(page.getByText("On for this device")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: name }).getByText("This device")).toBeVisible();

  const deleted = page.waitForResponse(
    (r) => r.request().method() === "DELETE" && /\/api\/push\/subscriptions\/[^/]+$/.test(r.url()),
  );
  await page.getByRole("button", { name: "Turn off" }).click();
  expect((await deleted).status()).toBe(204);
  await expect(page.getByRole("button", { name: "Turn on for this device" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  const after = await (await request.get("/api/push/subscriptions")).json();
  expect(after.subscriptions.map((s: { label: string }) => s.label)).not.toContain(name);
});

test("a device can be removed from the list, the test button reports a result, item name defaults to off", async ({
  page,
  request,
}) => {
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${randomUUID()}`;
  const name = `E2E tablet ${randomUUID().slice(0, 6)}`;
  await prepare(page, endpoint);
  await openControlled(page, "/settings/notifications");
  await page.getByLabel("Device name").fill(name);
  await page.getByRole("button", { name: "Turn on for this device" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();

  const itemName = page.getByRole("switch", { name: /Show the item name in notifications/ });
  await expect(itemName).not.toBeChecked();
  await expect(page.getByText(/visible on your lock screen/)).toBeVisible();
  await expect(page.getByRole("switch", { name: /Send push notifications/ })).toBeChecked();

  const tested = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/push/test",
  );
  await page.getByRole("button", { name: "Send test notification" }).click();
  expect((await tested).status()).toBe(200);
  await expect(
    page.getByText(/Push is not set up on the server|Test notification sent|did not accept/),
  ).toBeVisible();

  await page.getByRole("button", { name: `Remove ${name}` }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Turn on for this device" })).toBeVisible();
  const after = await (await request.get("/api/push/subscriptions")).json();
  expect(after.subscriptions.map((s: { label: string }) => s.label)).not.toContain(name);
});

test("a blocked permission explains itself and offers no button", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: ORIGIN, permissions: [] });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "denied" });
  });
  await openControlled(page, "/settings/notifications");
  await expect(page.getByText(/Notifications are blocked for this site/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Turn on for this device" })).toHaveCount(0);
  await context.close();
});

test("the service worker shows a content-free notification and never message text", async ({
  page,
  context,
}) => {
  await openControlled(page);
  await clearNotifications(context);
  await deliver(
    context,
    page,
    JSON.stringify({
      web_push: 8030,
      notification: {
        title: "RETURN",
        body: "New message about an item",
        navigate: `${ORIGIN}/conversations/c1`,
        lang: "en",
        tag: "c-c1",
      },
      return: { v: 1, kind: "new_message", conversationId: "c1" },
      // Not part of the contract: must never reach the screen even if a server bug put it there.
      message: "SECRET MESSAGE TEXT",
    }),
  );
  const [n] = await notificationsShown(context, 1);
  expect(n).toMatchObject({
    title: "RETURN",
    body: "New message about an item",
    tag: "c-c1",
    data: { url: "/conversations/c1" },
  });
  expect(n?.icon).toContain("/icons/icon-192.png");
  expect(JSON.stringify(n)).not.toContain("SECRET");

  // A newer push with the same tag replaces it instead of stacking.
  await deliver(
    context,
    page,
    JSON.stringify({
      web_push: 8030,
      notification: {
        title: "RETURN",
        body: "Second",
        navigate: `${ORIGIN}/conversations/c1`,
        lang: "en",
        tag: "c-c1",
      },
    }),
  );
  await expect
    .poll(async () => (await shown(context)).map((x) => x.body), { timeout: 15_000, intervals: [500] })
    .toEqual(["Second"]);
  await clearNotifications(context);
});

test("a missing or malformed payload still shows the generic notification", async ({ page, context }) => {
  await openControlled(page);
  await clearNotifications(context);
  await deliver(context, page, "this is not json");
  expect((await notificationsShown(context, 1))[0]).toMatchObject({
    title: "RETURN",
    body: "Something new in RETURN",
    data: { url: "/" },
  });
  await clearNotifications(context);
});

for (const [name, target, expected] of [
  ["opens the conversation in the existing panel window", "/conversations/c1", /\/conversations\/c1$/],
  ["never navigates to another origin", "https://evil.test/phish", /^http:\/\/localhost:5198\/$/],
  ["never navigates to the API", "/api/data/export", /^http:\/\/localhost:5198\/$/],
] as const) {
  test(`notification click ${name}`, async ({ page, context }) => {
    await openControlled(page, "/tags");
    await clearNotifications(context);
    await deliver(
      context,
      page,
      JSON.stringify({
        web_push: 8030,
        notification: { title: "RETURN", body: "x", navigate: target, lang: "en", tag: "click" },
      }),
    );
    await notificationsShown(context, 1);
    const [worker] = context.serviceWorkers();
    expect(worker).toBeTruthy();
    // Dispatches the same event the browser fires when the notification is tapped.
    await worker?.evaluate(async () => {
      const scope = self as unknown as {
        registration: ServiceWorkerRegistration;
        NotificationEvent: new (type: string, init: { notification: Notification; action: string }) => Event;
        dispatchEvent(event: Event): boolean;
      };
      const [notification] = await scope.registration.getNotifications();
      if (!notification) throw new Error("no notification to click");
      scope.dispatchEvent(new scope.NotificationEvent("notificationclick", { notification, action: "" }));
    });
    await page.waitForURL(expected);
    expect(context.pages()).toHaveLength(1);
    await notificationsShown(context, 0);
  });
}
