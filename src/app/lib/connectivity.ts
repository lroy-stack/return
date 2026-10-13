import { useSyncExternalStore } from "react";
import { notifyDataChanged } from "./data-events";

/**
 * Connectivity as the panel sees it. `offline` is the browser's own signal; `unreachable` means the browser says
 * it is online but the last API call failed at the network level (server down, or an Access session that expired
 * and answered with a cross-origin login redirect).
 */
export type Connectivity = "online" | "offline" | "unreachable";

let apiFailed = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Called by the API client after every request: `false` on a network-level failure, `true` on any response. */
export function reportApiReachable(reachable: boolean): void {
  if (apiFailed === !reachable) return;
  apiFailed = !reachable;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onOnline = () => {
    apiFailed = false;
    emit();
    // Back online: pages reload what failed while the connection was gone.
    notifyDataChanged();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", listener);
  };
}

function snapshot(): Connectivity {
  if (!navigator.onLine) return "offline";
  return apiFailed ? "unreachable" : "online";
}

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(subscribe, snapshot, () => "online");
}
