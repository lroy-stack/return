/// <reference lib="webworker" />
/**
 * Kill switch (docs/operations.md): built instead of `sw.ts` with `SW_KILL=1`. Every browser that checks for a
 * new `/sw.js` installs this, deletes all caches, unregisters itself and reloads its open tabs onto plain
 * network pages.
 */
declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) await caches.delete(name);
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: "window" });
      for (const client of windows) void client.navigate(client.url);
    })(),
  );
});

export {};
