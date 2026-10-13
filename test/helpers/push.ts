import { env } from "cloudflare:workers";
import { expect, vi } from "vitest";
import { base64urlDecode, base64urlEncode } from "../../src/worker/lib/base64url";
import { newId } from "../../src/worker/lib/ids";

export const text = (s: string) => new TextEncoder().encode(s);

export async function importEcdh(privateB64: string, publicB64: string): Promise<CryptoKeyPair> {
  const point = base64urlDecode(publicB64);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64urlEncode(point.slice(1, 33)),
    y: base64urlEncode(point.slice(33, 65)),
  };
  const alg = { name: "ECDH", namedCurve: "P-256" };
  return {
    privateKey: await crypto.subtle.importKey("jwk", { ...jwk, d: privateB64 }, alg, false, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("jwk", jwk, alg, true, []),
  };
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: string, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const params = { name: "HKDF", hash: "SHA-256", salt, info: text(info) };
  return new Uint8Array(await crypto.subtle.deriveBits(params, key, bytes * 8));
}

/** Independent receiver side of RFC 8291 (user agent), used to prove our ciphertext decrypts. */
export async function decrypt(
  body: Uint8Array,
  receiver: CryptoKeyPair,
  receiverPublic: string,
  auth: string,
) {
  const salt = body.slice(0, 16);
  const idLen = body[20] ?? 0;
  const senderPublic = body.slice(21, 21 + idLen);
  const senderKey = await crypto.subtle.importKey(
    "raw",
    senderPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: senderKey } as SubtleCryptoDeriveKeyAlgorithm,
      receiver.privateKey,
      256,
    ),
  );
  const info = new Uint8Array([
    ...text("WebPush: info\0"),
    ...base64urlDecode(receiverPublic),
    ...senderPublic,
  ]);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: base64urlDecode(auth),
        info,
      },
      await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]),
      256,
    ),
  );
  const cek = await hkdf(ikm, salt, "Content-Encoding: aes128gcm\0", 16);
  const nonce = await hkdf(ikm, salt, "Content-Encoding: nonce\0", 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const record = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, body.slice(21 + idLen)),
  );
  let end = record.length;
  while (end > 0 && record[end - 1] === 0) end--;
  expect(record[end - 1]).toBe(2);
  return record.slice(0, end - 1);
}

/** A browser's push subscription keys; the private half lets tests read what the Worker sent. */
export interface Device {
  pair: CryptoKeyPair;
  p256dh: string;
  auth: string;
}

export async function newDevice(): Promise<Device> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const p256dh = base64urlEncode(
    new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer),
  );
  return { pair, p256dh, auth: base64urlEncode(crypto.getRandomValues(new Uint8Array(16))) };
}

export const ENDPOINT = "https://fcm.googleapis.com/fcm/send/";

/** A push request as the fake push service received it (body read eagerly: streams cannot cross isolates). */
export interface CapturedPush {
  url: string;
  headers: Headers;
  body: Uint8Array;
}

export async function decryptRequest(request: CapturedPush, device: Device): Promise<unknown> {
  const plaintext = await decrypt(request.body, device.pair, device.p256dh, device.auth);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function seedSubscription(
  ownerId: string,
  device: Device,
  opts: { endpoint?: string; label?: string; failures?: number; firstFailureAt?: string } = {},
): Promise<{ id: string; endpoint: string }> {
  const id = newId();
  const endpoint = opts.endpoint ?? `${ENDPOINT}${id}`;
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (id, owner_id, audience, channel, endpoint, p256dh, auth, label, failures, first_failure_at, created_at)
     VALUES (?, ?, 'owner', 'webpush', ?, ?, ?, ?, ?, ?, '2026-01-01T00:00:00.000Z')`,
  )
    .bind(
      id,
      ownerId,
      endpoint,
      device.p256dh,
      device.auth,
      opts.label ?? null,
      opts.failures ?? 0,
      opts.firstFailureAt ?? null,
    )
    .run();
  return { id, endpoint };
}

export interface FakePushService {
  requests: CapturedPush[];
  restore(): void;
}

/**
 * Answers every request to a push service (any host that is not the Access certs URL) with
 * `status` and records it; everything else keeps going through the previous fetch stub.
 */
export function fakePushService(
  status: number | ((request: CapturedPush) => number | Error) = 201,
): FakePushService {
  const spy = vi.spyOn(globalThis, "fetch");
  const previous = spy.getMockImplementation();
  const requests: CapturedPush[] = [];
  spy.mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (
      !/^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[^/]*\.push\.apple\.com|[^/]*\.notify\.windows\.com)\//.test(
        request.url,
      )
    ) {
      if (!previous) throw new Error(`unexpected fetch ${request.url}`);
      return previous(input, init);
    }
    const captured = {
      url: request.url,
      headers: request.headers,
      body: new Uint8Array(await request.arrayBuffer()),
    };
    requests.push(captured);
    const outcome = typeof status === "function" ? status(captured) : status;
    if (outcome instanceof Error) throw outcome;
    return new Response(null, { status: outcome });
  });
  return {
    requests,
    restore: () => {
      if (previous) spy.mockImplementation(previous);
    },
  };
}
