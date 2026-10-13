/**
 * Identifier and token generation. Everything here uses the Web Crypto CSPRNG.
 *
 * - Internal ids: opaque UUIDv4, never shown to finders.
 * - Tag tokens: 128 random bits, Crockford base32, lowercase (26 chars). Printed in QR/NFC URLs.
 * - Secret tokens (finder conversation access): 256 random bits, base64url. Only the SHA-256
 *   hash is stored, so a database leak does not grant access to conversations.
 */

import { base64urlEncode } from "./base64url";

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

export function newId(): string {
  return crypto.randomUUID();
}

export function newTagToken(): string {
  return base32(crypto.getRandomValues(new Uint8Array(16)));
}

/** Tag tokens are case-insensitive and tolerate the usual Crockford look-alikes. */
export function normalizeTagToken(raw: string): string | null {
  const token = raw.trim().toLowerCase().replace(/[il]/g, "1").replace(/o/g, "0");
  return /^[0-9a-hjkmnp-tv-z]{26}$/.test(token) ? token : null;
}

export function newSecretToken(): string {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export function isWellFormedSecretToken(raw: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(raw);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return hex(new Uint8Array(digest));
}

export async function hmacHex(secret: string, input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return hex(new Uint8Array(sig));
}

function base32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
