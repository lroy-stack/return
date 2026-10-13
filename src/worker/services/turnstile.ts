const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

/**
 * Cloudflare's documented test secret that always validates
 * (https://developers.cloudflare.com/turnstile/troubleshooting/testing/).
 */
export const TURNSTILE_ALWAYS_PASS_SECRET = "1x0000000000000000000000000000000AA";

/**
 * Server-side Turnstile verification. Fails closed: a missing secret, a network error, a
 * timeout, an unexpected response or a token issued for another hostname all count as "not verified".
 */
export async function verifyTurnstile(env: Env, token: string | null, ip: string | null): Promise<boolean> {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
  // Local development with the always-pass test secret: siteverify would answer "success" anyway,
  // and the local runtime may have no outbound network. Never applies outside development or with
  // a real secret.
  if (env.ENVIRONMENT === "development" && env.TURNSTILE_SECRET_KEY === TURNSTILE_ALWAYS_PASS_SECRET)
    return true;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return false;
    const result = (await res.json()) as { success?: boolean; hostname?: string };
    if (result.success !== true) return false;
    // A token solved on another site must not unlock this one.
    if (env.PUBLIC_HOST && env.ENVIRONMENT !== "development") return result.hostname === env.PUBLIC_HOST;
    return true;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "turnstile failed", error: String(err) }));
    return false;
  }
}
