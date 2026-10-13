import { useSyncExternalStore } from "react";

/**
 * Installing the panel as an app (M-03).
 *  - Chromium (Android, desktop) fires `beforeinstallprompt` once the app is installable: the event is kept and
 *    `prompt()` is called from our own button.
 *  - iOS / iPadOS Safari has no prompt at all: the owner is guided through Share > Add to Home Screen.
 *  - Inside the installed app (standalone display mode) none of this is offered.
 * The listeners are registered at start-up (`watchInstall`, from main.tsx): the event can fire before any
 * component has mounted, and it fires only once per page load.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallMode =
  /** Running as the installed app: offer nothing. */
  | "installed"
  /** The browser handed us an install prompt: one button. */
  | "prompt"
  /** iOS / iPadOS browser: show the Add to Home Screen steps. */
  | "ios"
  /** Not installed and no prompt (yet): point to the browser menu. */
  | "manual";

const HINT_KEY = "return.installHint";

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
let watching = false;
let snapshot: InstallMode = "manual";
const listeners = new Set<() => void>();

export function isIos(): boolean {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports a Mac user agent; only a touch screen tells it apart.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

function compute(): InstallMode {
  if (installedNow || isStandalone()) return "installed";
  if (deferred) return "prompt";
  if (isIos()) return "ios";
  return "manual";
}

function emit(): void {
  snapshot = compute();
  for (const l of listeners) l();
}

/** Registers the install listeners once. Safe to call repeatedly. */
export function watchInstall(): void {
  if (watching) return;
  watching = true;
  snapshot = compute();
  window.addEventListener("beforeinstallprompt", (e) => {
    // Hold the event: the browser's own mini-infobar is suppressed and we prompt from our button.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    emit();
  });
  window.matchMedia("(display-mode: standalone)").addEventListener("change", emit);
}

/** Shows the browser's install dialog. Resolves with the owner's choice, or "unavailable" without a held event. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  // The event can be used once, whatever the answer.
  deferred = null;
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    installedNow = true;
    emit();
  }
  return outcome;
}

function subscribe(listener: () => void): () => void {
  watchInstall();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => "manual" as const,
  );
}

/** The one-time hint was closed (or acted on) before. */
export function installHintDismissed(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export function dismissInstallHint(): void {
  try {
    window.localStorage.setItem(HINT_KEY, "dismissed");
  } catch {
    // Not persisted: the hint may show again next visit.
  }
}
