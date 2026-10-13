import { type AnchorHTMLAttributes, type MouseEvent, useMemo, useSyncExternalStore } from "react";

/** Minimal history-API router. Route matching is done by the pages with `matchPath`. */

const listeners = new Set<() => void>();
let navigated = false;
window.addEventListener("popstate", () => {
  navigated = true;
});

/** True once the user moved within the app; used to move focus to the new page heading. */
export const didNavigate = (): boolean => navigated;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  navigated = true;
  if (opts.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  for (const l of listeners) l();
}

export interface Location {
  pathname: string;
  search: URLSearchParams;
}

export function useLocation(): Location {
  const key = useSyncExternalStore(subscribe, snapshot, () => "/");
  return useMemo(() => {
    const [pathname = "/", query = ""] = key.split("?");
    return { pathname, search: new URLSearchParams(query) };
  }, [key]);
}

/** Match "/items/:id" against a pathname. Returns params or null. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = pathname.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i] as string;
    const val = s[i] as string;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(val);
    else if (seg !== val) return null;
  }
  return params;
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  to: string;
}

export function Link({ to, onClick, target, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (target && target !== "_self") return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} target={target} onClick={handle} {...rest} />;
}
