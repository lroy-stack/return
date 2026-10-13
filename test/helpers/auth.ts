import { env, exports } from "cloudflare:workers";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { vi } from "vitest";

/**
 * Simulates Cloudflare Access: a real RS256 key pair whose public half is served at the
 * team's certs URL through a fetch stub, so tests exercise genuine JWT verification.
 */
const keys = await generateKeyPair("RS256", { extractable: true });
const jwk: JWK = { ...(await exportJWK(keys.publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
const certsUrl = `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;

const realFetch = globalThis.fetch;
vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === certsUrl) return Response.json({ keys: [jwk] });
  return realFetch(input, init);
});

export async function accessJwt(
  email = "owner@example.test",
  overrides: { aud?: string; iss?: string; expSeconds?: number } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(overrides.iss ?? `https://${env.ACCESS_TEAM_DOMAIN}`)
    .setAudience(overrides.aud ?? env.ACCESS_AUD)
    .setIssuedAt(now)
    .setExpirationTime(now + (overrides.expSeconds ?? 600))
    .sign(keys.privateKey);
}

export const APP = `https://${env.APP_HOST}`;
export const PUBLIC = `https://${env.PUBLIC_HOST}`;

/** The Worker under test (same isolate). The generated `Exports` type does not model the default handler. */
export const worker = (exports as unknown as { default: Fetcher }).default;
