import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "return.theme";

/** Browser-chrome colour per theme: the `--surface` token of each theme (also inlined in public/theme-init.js). */
export const THEME_COLORS = { light: "#FAF7F2", dark: "#0F1719" } as const;

const listeners = new Set<() => void>();
let current: ThemeChoice | null = null;

export function readTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // Storage may be blocked (private mode); fall back to the OS preference.
  }
  return "system";
}

/**
 * Points every `<meta name="theme-color">` at the explicit choice. With "system" each meta goes back to its own
 * scheme colour, so the `media` attributes pick the one that matches the OS.
 */
function syncThemeColor(choice: ThemeChoice): void {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = choice === "system" ? meta.dataset.scheme : choice;
    if (scheme === "light" || scheme === "dark") meta.content = THEME_COLORS[scheme];
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  syncThemeColor(choice);
  try {
    if (choice === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    // Not persisted; the choice still applies for this session.
  }
  current = choice;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the choice: follow it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return;
    const next = readTheme();
    if (next === current) return;
    applyTheme(next);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The stored theme choice; every control (rail, header sheet, Settings) reads the same value. */
export function useThemeChoice(): [ThemeChoice, (next: ThemeChoice) => void] {
  const choice = useSyncExternalStore(
    subscribe,
    () => current ?? readTheme(),
    () => "system" as const,
  );
  return [choice, applyTheme];
}
