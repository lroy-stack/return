import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "./api";

export type Resource<T> =
  | { status: "loading"; data: undefined; error: undefined }
  | { status: "ready"; data: T; error: undefined }
  | { status: "error"; data: undefined; error: ApiRequestError };

export interface UseResource<T> {
  state: Resource<T>;
  /** Re-fetch. Silent keeps showing current data (no skeleton flash). */
  reload: (silent?: boolean) => void;
  setData: (data: T) => void;
}

function toApiError(e: unknown): ApiRequestError {
  return e instanceof ApiRequestError ? e : new ApiRequestError(0, "unknown", String(e));
}

/** Fetch on mount and whenever `key` changes. `fetcher` receives an AbortSignal. */
export function useResource<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  opts: { pollMs?: number } = {},
): UseResource<T> {
  const [state, setState] = useState<Resource<T>>({ status: "loading", data: undefined, error: undefined });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [nonce, setNonce] = useState(0);
  const silentRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: key and nonce are the triggers; fetcher is read via ref
  useEffect(() => {
    if (key === null) return;
    const ctrl = new AbortController();
    if (!silentRef.current) setState({ status: "loading", data: undefined, error: undefined });
    silentRef.current = false;
    fetcherRef
      .current(ctrl.signal)
      .then((data) => setState({ status: "ready", data, error: undefined }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState((prev) =>
          silentRefKeep(prev) ? prev : { status: "error", data: undefined, error: toApiError(e) },
        );
      });
    return () => ctrl.abort();
  }, [key, nonce]);

  useEffect(() => {
    if (!opts.pollMs || key === null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        silentRef.current = true;
        setNonce((n) => n + 1);
      }
    }, opts.pollMs);
    return () => window.clearInterval(id);
  }, [opts.pollMs, key]);

  const reload = useCallback((silent = false) => {
    silentRef.current = silent;
    setNonce((n) => n + 1);
  }, []);
  const setData = useCallback((data: T) => setState({ status: "ready", data, error: undefined }), []);
  return { state, reload, setData };
}

/** A failed silent refresh keeps showing the data we already have. */
function silentRefKeep<T>(prev: Resource<T>): boolean {
  return prev.status === "ready";
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Run an async action with pending + error state. */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<void>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const run = useCallback(
    async (...args: A) => {
      setPending(true);
      setError(null);
      try {
        await fn(...args);
      } catch (e) {
        setError(toApiError(e));
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, clearError: () => setError(null) };
}

/**
 * Where the visible part of the page is while the on-screen keyboard is open. iOS Safari keeps the layout viewport
 * (and `100dvh`) unchanged and pans the visual viewport instead, which would hide a bottom-anchored composer behind
 * the keyboard; Android Chrome resizes the layout viewport itself. Null when no keyboard covers the page.
 */
export function useKeyboardBox(): { top: number; height: number } | null {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height;
      const next = covered > 120 ? { top: Math.round(vv.offsetTop), height: Math.round(vv.height) } : null;
      setBox((prev) => (prev?.top === next?.top && prev?.height === next?.height ? prev : next));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return box;
}
