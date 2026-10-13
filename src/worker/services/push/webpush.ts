/**
 * Web Push on WebCrypto only (ADR 0003): RFC 8291 message encryption (`aes128gcm`, RFC 8188),
 * RFC 8292 VAPID and the RFC 8030 request headers. No I/O besides the final `fetch`.
 */
import { SignJWT } from "jose";
import { pushServiceOf } from "../../../shared/schemas";
import { base64urlDecode, base64urlEncode } from "../../lib/base64url";
import { appOrigin } from "../../lib/urls";

const RECORD_SIZE = 4096;
const SALT_BYTES = 16;
const TAG_BYTES = 16;
const P256_POINT_BYTES = 65;
/** Header written before the ciphertext: salt, record size, key id length, key id (sender public key). */
const HEADER_BYTES = SALT_BYTES + 4 + 1 + P256_POINT_BYTES;
/** Largest plaintext that fits one record and still stays within the 4096 bytes every push service accepts. */
export const MAX_PLAINTEXT_BYTES = RECORD_SIZE - HEADER_BYTES - TAG_BYTES - 1;
/** Payload lengths are hidden from the push service by padding to a multiple of this many bytes. */
export const PADDING_BLOCK = 128;

const VAPID_LIFETIME_S = 12 * 3600;
/** A cached VAPID JWT is reused until this long before it expires. */
const VAPID_REFRESH_MARGIN_S = 3600;
export const PUSH_TIMEOUT_MS = 5000;

const encoder = new TextEncoder();

export interface PushTarget {
  endpoint: string;
  /** Receiver public key: 65-byte uncompressed P-256 point, base64url. */
  p256dh: string;
  /** Authentication secret: 16 bytes, base64url. */
  auth: string;
}

export interface PushOptions {
  /** Seconds the push service keeps the message while the device is offline. */
  ttl: number;
  urgency: "very-low" | "low" | "normal" | "high";
  /** Replaces a pending message with the same topic (up to 32 base64url characters). */
  topic?: string;
}

export interface VapidKeys {
  privateKey: CryptoKey;
  /** Application server public key as sent in `k=`: 65-byte uncompressed point, base64url. */
  publicKey: string;
  /** `mailto:` or `https:` contact for the push service operators. */
  subject: string;
}

export type PushResult =
  | { kind: "ok" }
  | { kind: "gone" }
  /**
   * `transient` failures (timeout, network, 429, 5xx) may heal and count toward dropping the
   * subscription. The rest (rejected request, bad key, encryption error) are our bug or a key
   * mismatch: retrying or deleting the device would not help, so they are reported, not counted.
   */
  | { kind: "error"; status: number | null; error: string; transient: boolean };

/** Randomness of one encryption. Production never passes it; tests inject the RFC 8291 values. */
export interface EncryptionInputs {
  salt?: Uint8Array;
  ephemeral?: CryptoKeyPair;
  /** Pad the plaintext with zeros up to a multiple of this many bytes (default `PADDING_BLOCK`). */
  paddingBlock?: number;
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8);
  return new Uint8Array(bits);
}

/** The runtime member is `public`; the generated Workers typings only know it as `$public`. */
const ecdhParams = (peer: CryptoKey) => ({ name: "ECDH", public: peer }) as SubtleCryptoDeriveKeyAlgorithm;

export interface KeyMaterial {
  ikm: Uint8Array;
  cek: Uint8Array;
  nonce: Uint8Array;
}

/** RFC 8291 section 3.3-3.4 and RFC 8188 section 2.2-2.3. */
export async function deriveKeyMaterial(
  receiverPublic: Uint8Array,
  authSecret: Uint8Array,
  senderPrivate: CryptoKey,
  senderPublic: Uint8Array,
  salt: Uint8Array,
): Promise<KeyMaterial> {
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(ecdhParams(receiverKey), senderPrivate, 256),
  );
  const keyInfo = concat(encoder.encode("WebPush: info\0"), receiverPublic, senderPublic);
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);
  const cek = await hkdf(ikm, salt, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, encoder.encode("Content-Encoding: nonce\0"), 12);
  return { ikm, cek, nonce };
}

/** Encrypts `plaintext` into a complete `aes128gcm` body (header + one record) for the target device. */
export async function encryptPayload(
  target: Pick<PushTarget, "p256dh" | "auth">,
  plaintext: Uint8Array,
  inputs: EncryptionInputs = {},
): Promise<Uint8Array> {
  const receiverPublic = base64urlDecode(target.p256dh);
  const authSecret = base64urlDecode(target.auth);
  if (receiverPublic.length !== P256_POINT_BYTES || receiverPublic[0] !== 4) {
    throw new Error("p256dh must be an uncompressed P-256 point");
  }
  if (authSecret.length !== 16) throw new Error("auth must be 16 bytes");

  const block = inputs.paddingBlock ?? PADDING_BLOCK;
  if (plaintext.length > MAX_PLAINTEXT_BYTES) {
    throw new Error(`payload too large (${plaintext.length} bytes, max ${MAX_PLAINTEXT_BYTES})`);
  }
  const wanted = block > 1 ? (block - ((plaintext.length + 1) % block)) % block : 0;
  const padding = Math.min(wanted, MAX_PLAINTEXT_BYTES - plaintext.length);

  const salt = inputs.salt ?? crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const ephemeral =
    inputs.ephemeral ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, [
      "deriveBits",
    ])) as CryptoKeyPair);
  const senderPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", ephemeral.publicKey)) as ArrayBuffer,
  );
  const { cek, nonce } = await deriveKeyMaterial(
    receiverPublic,
    authSecret,
    ephemeral.privateKey,
    senderPublic,
    salt,
  );

  // Single, last record: data, delimiter 0x02, then zero padding (RFC 8188 section 2).
  const record = new Uint8Array(plaintext.length + 1 + padding);
  record.set(plaintext);
  record[plaintext.length] = 2;
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );

  const header = new Uint8Array(HEADER_BYTES);
  header.set(salt);
  new DataView(header.buffer).setUint32(SALT_BYTES, RECORD_SIZE);
  header[SALT_BYTES + 4] = P256_POINT_BYTES;
  header.set(senderPublic, SALT_BYTES + 5);
  return concat(header, ciphertext);
}

/* ------------------------------------------------------------------------------- VAPID */

interface CachedJwt {
  jwt: string;
  expiresAt: number;
}
const jwtCache = new Map<string, CachedJwt>();

/**
 * ES256 JWT for the push service's origin, cached per (application key, audience) in isolate
 * memory until one hour before it expires.
 */
async function vapidJwt(vapid: VapidKeys, audience: string, nowMs: number): Promise<string> {
  const cacheKey = `${vapid.publicKey}|${vapid.subject}|${audience}`;
  const nowS = Math.floor(nowMs / 1000);
  const cached = jwtCache.get(cacheKey);
  if (cached && cached.expiresAt - VAPID_REFRESH_MARGIN_S > nowS) return cached.jwt;
  const expiresAt = nowS + VAPID_LIFETIME_S;
  const jwt = await new SignJWT({})
    .setProtectedHeader({ typ: "JWT", alg: "ES256" })
    .setAudience(audience)
    .setExpirationTime(expiresAt)
    .setSubject(vapid.subject)
    .sign(vapid.privateKey);
  jwtCache.set(cacheKey, { jwt, expiresAt });
  return jwt;
}

/** RFC 8292 section 3 `Authorization` value. */
export async function vapidAuthorization(vapid: VapidKeys, endpoint: string, nowMs: number): Promise<string> {
  const jwt = await vapidJwt(vapid, new URL(endpoint).origin, nowMs);
  return `vapid t=${jwt}, k=${vapid.publicKey}`;
}

/** Test hook: forget cached JWTs. */
export function clearVapidCache(): void {
  jwtCache.clear();
}

const vapidKeyCache = new Map<string, Promise<CryptoKey>>();

/**
 * VAPID key pair from the environment, or null when push is not set up. The private key
 * (PKCS#8, base64url) must belong to the public key (raw point, base64url): a mismatch would
 * make every push service answer 403, so it is reported as "not configured" instead.
 */
export async function loadVapid(env: Env): Promise<VapidKeys | null> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateEncoded = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateEncoded) return null;
  try {
    let pending = vapidKeyCache.get(privateEncoded);
    if (!pending) {
      pending = crypto.subtle.importKey(
        "pkcs8",
        base64urlDecode(privateEncoded),
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign"],
      );
      vapidKeyCache.set(privateEncoded, pending);
    }
    const privateKey = await pending;
    const jwk = (await crypto.subtle.exportKey("jwk", privateKey)) as JsonWebKey;
    if (!jwk.x || !jwk.y) return null;
    const derived = base64urlEncode(
      concat(new Uint8Array([4]), base64urlDecode(jwk.x), base64urlDecode(jwk.y)),
    );
    if (derived !== publicKey) {
      console.error(
        JSON.stringify({ level: "error", msg: "VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY" }),
      );
      return null;
    }
    const subject = env.NOTIFY_FROM ? `mailto:${env.NOTIFY_FROM}` : appOrigin(env);
    return { privateKey, publicKey, subject };
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "VAPID keys unusable", error: String(err) }));
    return null;
  }
}

/* ------------------------------------------------------------------------------ Request */

/** Builds the encrypted, VAPID-signed POST for one device (RFC 8030 section 5 headers). */
export async function buildPushRequest(
  target: PushTarget,
  payload: Uint8Array,
  options: PushOptions,
  vapid: VapidKeys,
  nowMs: number,
  encryption: EncryptionInputs = {},
): Promise<Request> {
  const body = await encryptPayload(target, payload, encryption);
  const headers = new Headers({
    Authorization: await vapidAuthorization(vapid, target.endpoint, nowMs),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(options.ttl),
    Urgency: options.urgency,
  });
  if (options.topic) headers.set("Topic", options.topic);
  return new Request(target.endpoint, { method: "POST", headers, body });
}

/**
 * Sends one push. Never throws: 201/202 -> ok, 404/410 -> gone (the subscription is dead),
 * everything else -> error (see `PushResult`). Redirects are never followed: the endpoint is
 * user-supplied and the request carries the VAPID Authorization header.
 */
export async function sendWebPush(
  target: PushTarget,
  payload: Uint8Array,
  options: PushOptions,
  vapid: VapidKeys,
  nowMs: number = Date.now(),
  timeoutMs: number = PUSH_TIMEOUT_MS,
): Promise<PushResult> {
  // Checked again right before the request: rows written before the allowlist changed must not be contacted.
  if (pushServiceOf(target.endpoint) === null) {
    return { kind: "error", status: null, error: "endpoint_not_allowed", transient: false };
  }
  let request: Request;
  try {
    request = await buildPushRequest(target, payload, options, vapid, nowMs);
  } catch {
    return { kind: "error", status: null, error: "encrypt_failed", transient: false };
  }
  try {
    const response = await fetch(request, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    // The body is never read (it can echo nothing useful); cancel it to free the connection.
    await response.body?.cancel();
    const { status } = response;
    if (status === 201 || status === 202) return { kind: "ok" };
    if (status === 404 || status === 410) return { kind: "gone" };
    if (status >= 300 && status < 400) return { kind: "error", status, error: "http_3xx", transient: false };
    return { kind: "error", status, error: `http_${status}`, transient: status === 429 || status >= 500 };
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    const error = name === "TimeoutError" ? "timeout" : "network_error";
    return { kind: "error", status: null, error, transient: true };
  }
}
