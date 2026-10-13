import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";
import { isDevelopment, isLoopbackHost } from "../env";

/**
 * Owner authentication. The app host is protected by Cloudflare Access, which forwards a
 * signed JWT in `Cf-Access-Jwt-Assertion`. We verify signature, issuer and audience against
 * the team's published keys, so a client cannot forge identity with a header alone.
 * See https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */

const jwksCache = new Map<string, JWTVerifyGetKey>();

function jwksFor(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000,
      cooldownDuration: 30_000,
    });
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export type AuthResult = { ok: true; email: string } | { ok: false; reason: string };

export async function authenticateOwner(request: Request, env: Env): Promise<AuthResult> {
  const devEmail = devOwnerEmail(request, env);
  if (devEmail) return { ok: true, email: devEmail };

  const teamDomain = env.ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.ACCESS_AUD?.trim();
  if (!teamDomain || !audience) return { ok: false, reason: "access_not_configured" };

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, reason: "missing_token" };

  let email: unknown;
  try {
    const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
      algorithms: ["RS256"],
    });
    email = payload.email;
  } catch {
    return { ok: false, reason: "invalid_token" };
  }
  if (typeof email !== "string" || !email) return { ok: false, reason: "no_email_claim" };
  if (!ownerEmails(env).has(email.toLowerCase())) return { ok: false, reason: "not_an_owner" };
  return { ok: true, email: email.toLowerCase() };
}

export function ownerEmails(env: Env): Set<string> {
  return new Set(
    (env.OWNER_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Local development shortcut. Only honoured when ENVIRONMENT=development (set in the
 * git-ignored .dev.vars) AND the request targets a loopback host, so a misconfigured
 * production variable alone cannot open the panel.
 */
function devOwnerEmail(request: Request, env: Env): string | null {
  if (!isDevelopment(env) || !env.DEV_OWNER_EMAIL) return null;
  if (!isLoopbackHost(new URL(request.url).hostname)) return null;
  return env.DEV_OWNER_EMAIL.toLowerCase();
}
