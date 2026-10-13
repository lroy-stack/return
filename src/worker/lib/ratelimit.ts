/**
 * Per-IP budgets backed by the Workers Rate Limiting bindings. A missing binding (local runs,
 * tests without the binding) or a missing client IP means "allowed"; a failing limiter fails
 * open so finders are never locked out by an infrastructure fault.
 */
function clientIp(request: Request): string | null {
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

export function requestIp(request: Request): string | null {
  return clientIp(request);
}

/** Budget for requests that write or send something. */
export async function allowPublicWrite(env: Env, request: Request): Promise<boolean> {
  const ip = clientIp(request);
  if (!ip) return true;
  return check(env.PUBLIC_WRITE_LIMIT as RateLimit | undefined, `w:${ip}`);
}

/** Budget for reading tag and conversation pages. */
export async function allowPublicRead(env: Env, request: Request): Promise<boolean> {
  const ip = clientIp(request);
  if (!ip) return true;
  return check(env.PUBLIC_READ_LIMIT as RateLimit | undefined, `r:${ip}`);
}
