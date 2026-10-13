/// <reference lib="webworker" />
/**
 * Owner-panel service worker (ADR 0002). Bundled to `/sw.js` by `vite/sw-plugin.ts`, which injects the build id
 * and the precache list. What is cached is decided only by `src/shared/sw-routing.ts`: nothing from `/api/`,
 * `/cdn-cgi/` or any non-GET request ever reaches Cache Storage.
 */
import { base64UrlToBytes, parsePushPayload, safePanelPath, subscriptionBody } from "../shared/push-client";
import { isStorable, SHELL_PATH, strategyFor } from "../shared/sw-routing";

declare const self: ServiceWorkerGlobalScope;

const CACHE_PREFIX = "return-app-";
const CACHE = `${CACHE_PREFIX}${__BUILD_ID__}`;
/** How long a navigation waits for the network before the cached shell is shown instead. */
const NAVIGATION_TIMEOUT_MS = 4000;

/** A response that is safe to keep: same-origin, successful, not the result of a redirect (Access login). */
function isCleanResponse(res: Response): boolean {
  return res.ok && res.type === "basic" && !res.redirected;
}

async function precache(): Promise<void> {
  const cache = await caches.open(CACHE);
  await Promise.all(
    [SHELL_PATH, ...__PRECACHE__].map(async (path) => {
      if (!isStorable(path)) throw new Error(`precache refused ${path}`);
      // `redirect: "manual"`: an expired Access session answers with a login redirect, which must fail the
      // install (retried on the next update check) rather than be stored as the shell.
      const res = await fetch(new Request(path, { cache: "reload", redirect: "manual" }));
      if (!isCleanResponse(res)) throw new Error(`precache failed for ${path} (${res.status})`);
      await cache.put(path, res);
    }),
  );
}

async function removeOldCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE).map((n) => caches.delete(n)),
  );
}

async function cacheFirst(request: Request, event: FetchEvent): Promise<Response> {
  const hit = await caches.match(request.url, { cacheName: CACHE });
  if (hit) return hit;
  const res = await fetch(request);
  if (isCleanResponse(res) && isStorable(new URL(request.url).pathname)) {
    const copy = res.clone();
    event.waitUntil(caches.open(CACHE).then((c) => c.put(request.url, copy)));
  }
  return res;
}

async function networkFirstShell(request: Request, event: FetchEvent): Promise<Response> {
  const network = fetch(request);
  // Keep the shell fresh whenever a clean HTML page arrives, even after the timeout below has fired.
  event.waitUntil(
    network
      .then(async (res) => {
        const isHtml = res.headers.get("content-type")?.includes("text/html") ?? false;
        if (isCleanResponse(res) && isHtml) await (await caches.open(CACHE)).put(SHELL_PATH, res.clone());
      })
      .catch(() => undefined),
  );
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
  } catch {
    // Offline or unreachable: fall through to the cached shell.
  }
  const shell = await caches.match(SHELL_PATH, { cacheName: CACHE });
  if (shell) return shell;
  return network;
}

self.addEventListener("install", (event) => {
  // No skipWaiting here: a new version waits until the panel asks for it (SKIP_WAITING) so a page is never
  // swapped under the owner mid-edit.
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(removeOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const strategy = strategyFor(
    { url: request.url, method: request.method, mode: request.mode },
    self.location.origin,
  );
  if (strategy === "passthrough") return;
  event.respondWith(
    strategy === "navigation" ? networkFirstShell(request, event) : cacheFirst(request, event),
  );
});

self.addEventListener("message", (event) => {
  const data: unknown = event.data;
  if (typeof data === "object" && data !== null && "type" in data && data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// Push (ADR 0003). These handlers never touch Cache Storage and never put message content on screen: the payload is
// content-free by contract and only `notification.{title,body,tag,lang,navigate}` is read (shared/push-client.ts).
const NOTIFICATION_ICON = "/icons/icon-192.png";

self.addEventListener("push", (event) => {
  let raw: unknown = null;
  try {
    raw = event.data?.json();
  } catch {
    // Not JSON (or no payload): show the generic notification, a push must always be visible.
  }
  const view = parsePushPayload(raw, self.location.origin);
  const options: NotificationOptions & { renotify?: boolean; lang?: string } = {
    body: view.body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    data: { url: view.url },
    // A follow-up for the same conversation replaces the earlier one but still alerts.
    ...(view.tag ? { tag: view.tag, renotify: true } : {}),
    ...(view.lang ? { lang: view.lang } : {}),
  };
  event.waitUntil(self.registration.showNotification(view.title, options));
});

async function openPanel(path: string): Promise<void> {
  const target = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const panel = windows.find((c) => new URL(c.url).origin === self.location.origin);
  if (panel) {
    // Focusing can be refused (no user activation); navigating still has to be attempted.
    await panel.focus().catch(() => undefined);
    try {
      await panel.navigate(target);
      return;
    } catch {
      // `navigate` rejects for a window this worker does not control: open a new one instead.
    }
  }
  await self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const url = typeof data === "object" && data !== null && "url" in data ? data.url : null;
  event.waitUntil(openPanel(safePanelPath(url, self.location.origin)));
});

/** The browser rotated or expired the subscription: register the new one under the same key, best effort. */
self.addEventListener("pushsubscriptionchange", (event) => {
  const change = event as Event & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
  };
  event.waitUntil(
    (async () => {
      try {
        let subscription = change.newSubscription ?? null;
        if (!subscription) {
          let key: BufferSource | null = change.oldSubscription?.options.applicationServerKey ?? null;
          if (!key) {
            const res = await fetch("/api/push/config");
            const config: unknown = res.ok ? await res.json() : null;
            const vapid =
              typeof config === "object" && config !== null && "vapidPublicKey" in config
                ? config.vapidPublicKey
                : null;
            if (typeof vapid !== "string") return;
            key = base64UrlToBytes(vapid);
          }
          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
        }
        const body = subscriptionBody(subscription.toJSON(), null);
        if (!body) return;
        await fetch("/api/push/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // Best effort: the panel registers the device again the next time Settings > Notifications opens.
      }
    })(),
  );
});
