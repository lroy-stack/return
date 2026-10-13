/**
 * Per-client budgets backed by the Workers Rate Limiting bindings, and the one place that
 * decides what "the same client" means.
 *
 * - IPv4 clients are keyed by address, IPv6 clients by their /64 prefix (a single subscriber
 *   controls a whole /64, so per-address keys would be trivially evaded).
 * - In production a request without CF-Connecting-IP shares one "unknown" bucket, so budgets
 *   and caps are never skipped. Elsewhere (local runs, tests) a missing IP means "unlimited".
 * - A missing binding or a failing limiter fails open so finders are never locked out by an
 *   infrastructure fault.
 */
const UNKNOWN_CLIENT = "unknown";

/** IPv4 stays as is; IPv6 becomes its lower-case /64 prefix, e.g. "2001:db8:0:1::/64". */
export function normalizeIp(raw: string): string {
  const ip = raw.trim().toLowerCase().split("%")[0] ?? "";
  if (!ip.includes(":")) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped?.[1]) return mapped[1];
  const [head = "", tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = ip.includes("::") && tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? 8 - headParts.length - tailParts.length : 0;
  const groups = [...headParts, ...Array<string>(Math.max(missing, 0)).fill("0"), ...tailParts];
  const prefix = groups.slice(0, 4).map((g) => Number.parseInt(g || "0", 16).toString(16));
  return `${prefix.join(":")}::/64`;
}

/** The normalised client key, or null when there is no client IP and limits do not apply. */
export function clientKey(env: Env, request: Request): string | null {
  const raw = request.headers.get("CF-Connecting-IP");
  if (raw) return normalizeIp(raw);
  return env.ENVIRONMENT === "production" ? UNKNOWN_CLIENT : null;
}

/** The address exactly as received (only for the Turnstile `remoteip` hint, never stored). */
export function rawClientIp(request: Request): string | null {
  return request.headers.get("CF-Connecting-IP");
}

async function check(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key });
    return success;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "ratelimit failed", error: String(err) }));
    return true;
  }
}

/** Budget for requests that write or send something. */
export async function allowPublicWrite(env: Env, request: Request): Promise<boolean> {
  const key = clientKey(env, request);
  if (!key) return true;
  return check(env.PUBLIC_WRITE_LIMIT as RateLimit | undefined, `w:${key}`);
}

/** Budget for reading tag and conversation pages. */
export async function allowPublicRead(env: Env, request: Request): Promise<boolean> {
  const key = clientKey(env, request);
  if (!key) return true;
  return check(env.PUBLIC_READ_LIMIT as RateLimit | undefined, `r:${key}`);
}
