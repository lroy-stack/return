/** URL helpers for printed cards. */

const RESERVED_SUFFIXES = [".test", ".localhost", ".example", ".invalid", ".local"];

/**
 * True when a URL must not be printed for real: not https, a loopback/IP host, or a reserved
 * test/local TLD. Exports for such URLs are stamped "PROOF — NOT FOR PRINT".
 */
export function isProofUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (parsed.protocol !== "https:") return true;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host === "0.0.0.0") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return true;
  return RESERVED_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));
}

/** Host + path as a finder would type it, without scheme, query or fragment. */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url.replace(/^[a-z]+:\/\//i, "");
  }
}

/** UTF-8 length, the number the NFC chip has to store (before NDEF prefix compression). */
export function urlByteLength(url: string): number {
  return new TextEncoder().encode(url).length;
}
