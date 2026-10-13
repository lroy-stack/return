export type ThemeChoice = "system" | "light" | "dark";
const KEY = "return.theme";

export function readTheme(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // Storage may be blocked (private mode); fall back to the OS preference.
  }
  return "system";
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, choice);
  } catch {
    // Not persisted; the choice still applies for this session.
  }
}
