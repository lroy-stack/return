/** Unpadded base64url (RFC 4648 section 5), the encoding of Web Push keys, salts and JWTs. */

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Accepts padded and unpadded input; throws on characters outside the base64url alphabet. */
export function base64urlDecode(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new Error("not base64url");
  const base64 = text.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}
