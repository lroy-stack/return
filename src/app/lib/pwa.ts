import { useSyncExternalStore } from "react";

/**
 * Service-worker lifecycle for the panel (ADR 0002). `/sw.js` exists only in production builds (emitted by
 * `vite/sw-plugin.ts`), so registration is skipped in `vite dev`; the panel is only ever served on the app host,
 * so the finder host never registers it.
 */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

let waiting: ServiceWorker | null = null;
let reloading = false;
const listeners = new Set<() => void>();

function setWaiting(worker: ServiceWorker | null): void {
  waiting = worker;
  for (const l of listeners) l();
}

function watch(registration: ServiceWorkerRegistration): void {
  if (registration.waiting) setWaiting(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed" && registration.waiting) setWaiting(registration.waiting);
    });
  });
  const check = () => void registration.update().catch(() => undefined);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.setInterval(check, UPDATE_CHECK_MS);
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Only reload when the owner asked for the update; the first claim after install must not reload the page.
    if (reloading) window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(watch)
      .catch((error: unknown) => console.error("service worker registration failed", error));
  });
}

/** Activates the waiting worker; the page reloads into the new build once it takes control. */
export function applyUpdate(): void {
  if (!waiting) return;
  reloading = true;
  waiting.postMessage({ type: "SKIP_WAITING" });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while a newer build is installed and waiting for the owner to reload. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => waiting !== null,
    () => false,
  );
}

/** Drops every cache this origin owns (sign-out; the next visit starts clean). Never throws. */
export async function clearCaches(): Promise<void> {
  try {
    if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    // Storage may be unavailable; signing out must still go ahead.
  }
}
