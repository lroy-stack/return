const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

/**
 * Server-side Turnstile verification. Fails closed: a missing secret, a network error, a
 * timeout, an unexpected response or a token issued for another hostname all count as "not verified".
 */
export async function verifyTurnstile(env: Env, token: string | null, ip: string | null): Promise<boolean> {
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;
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
