/**
 * Service-worker routing for the owner panel (ADR 0002). Pure on purpose: the rule "private responses never
 * reach Cache Storage" is code with a unit test (test/sw-routing.test.ts), not configuration.
 *
 * `passthrough`: the worker does not call `respondWith`; the browser talks to the network and nothing is stored.
 */
export type SwStrategy = "passthrough" | "navigation" | "cache-first";

export interface SwRequestInfo {
  url: string;
  method: string;
  /** `Request.mode`; only `"navigate"` matters. */
  mode: string;
}

/** The app shell is stored under this key; every panel route is served the same `index.html`. */
export const SHELL_PATH = "/";

/** Build-time static files that may be stored: hashed bundles, icons, the manifest. */
const STATIC_PATH = /^\/(?:assets\/[^/]+|icons\/[^/]+|manifest\.webmanifest)$/;

/** Server-owned paths: owner API and Cloudflare Access endpoints (login, logout, identity). */
const PRIVATE_PATH = /^\/(?:api|cdn-cgi)(?:\/|$)/;

/** Lower-cased and with repeated slashes collapsed, so `//API/x` cannot slip past the private-path check. */
function normalise(pathname: string): string {
  return pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

/** True when a response for this path may be written to Cache Storage. Checked before every write. */
export function isStorable(pathname: string): boolean {
  if (pathname === SHELL_PATH) return true;
  return STATIC_PATH.test(pathname) && !PRIVATE_PATH.test(normalise(pathname));
}

export function strategyFor(request: SwRequestInfo, origin: string): SwStrategy {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return "passthrough";
  }
  if (request.method !== "GET") return "passthrough";
  if (url.origin !== origin) return "passthrough";
  if (PRIVATE_PATH.test(normalise(url.pathname))) return "passthrough";
  if (request.mode === "navigate") return "navigation";
  return isStorable(url.pathname) && url.pathname !== SHELL_PATH ? "cache-first" : "passthrough";
}
