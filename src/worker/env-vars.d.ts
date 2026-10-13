/**
 * Optional variables that are deliberately not in `wrangler.jsonc` (and therefore not in the
 * generated `worker-configuration.d.ts`): production uses the defaults.
 */
interface OptionalVars {
  /** Base URL of the Nominatim API. Tests and E2E point it at a stub; defaults to the public service. */
  NOMINATIM_URL?: string;
  /** Minimum milliseconds between outbound Nominatim calls per isolate (default 1000; tests use 0). */
  NOMINATIM_MIN_INTERVAL_MS?: string;
  /** "1" together with ENVIRONMENT=development answers geocoding from a built-in stub (E2E only). */
  NOMINATIM_STUB?: string;
  /** Web Push VAPID private key (PKCS#8, base64url). A secret; push is off while it is unset. */
  VAPID_PRIVATE_KEY?: string;
}

interface Env extends OptionalVars {}
declare namespace Cloudflare {
  interface Env extends OptionalVars {}
}
