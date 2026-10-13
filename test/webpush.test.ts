import { jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base64urlDecode, base64urlEncode } from "../src/worker/lib/base64url";
import {
  buildPushRequest,
  clearVapidCache,
  deriveKeyMaterial,
  encryptPayload,
  MAX_PLAINTEXT_BYTES,
  type PushTarget,
  sendWebPush,
  type VapidKeys,
} from "../src/worker/services/push/webpush";
import { decrypt, importEcdh, text } from "./helpers/push";

/** RFC 8291 section 5 and appendix A. */
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  authSecret: "BTBZMqHH6r4Tts7J_aSIgg",
  receiverPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  receiverPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  senderPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  senderPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  ikm: "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg",
  cek: "oIhVW04MRdy2XN9CiKLxTg",
  nonce: "4h_95klXJ5E_qnoN",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

const ecdsaPair = async (extractable: boolean) =>
  (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, extractable, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

describe("RFC 8291 message encryption", () => {
  it("derives the published IKM, content encryption key and nonce", async () => {
    const sender = await importEcdh(RFC.senderPrivate, RFC.senderPublic);
    const material = await deriveKeyMaterial(
      base64urlDecode(RFC.receiverPublic),
      base64urlDecode(RFC.authSecret),
      sender.privateKey,
      base64urlDecode(RFC.senderPublic),
      base64urlDecode(RFC.salt),
    );
    expect(base64urlEncode(material.ikm)).toBe(RFC.ikm);
    expect(base64urlEncode(material.cek)).toBe(RFC.cek);
    expect(base64urlEncode(material.nonce)).toBe(RFC.nonce);
  });

  it("reproduces the example message body byte for byte", async () => {
    const body = await encryptPayload(
      { p256dh: RFC.receiverPublic, auth: RFC.authSecret },
      text(RFC.plaintext),
      {
        salt: base64urlDecode(RFC.salt),
        ephemeral: await importEcdh(RFC.senderPrivate, RFC.senderPublic),
        paddingBlock: 1,
      },
    );
    expect(base64urlEncode(body)).toBe(RFC.body);
    // 86-byte header + 41 plaintext + 1 delimiter + 16 tag.
    expect(body.length).toBe(144);
  });

  it("pads to a block multiple and decrypts with the receiver key", async () => {
    const receiver = await importEcdh(RFC.receiverPrivate, RFC.receiverPublic);
    const body = await encryptPayload(
      { p256dh: RFC.receiverPublic, auth: RFC.authSecret },
      text(RFC.plaintext),
    );
    // header 86 + padded record (128) + GCM tag 16, whatever the plaintext length.
    expect(body.length).toBe(86 + 128 + 16);
    expect(new TextDecoder().decode(await decrypt(body, receiver, RFC.receiverPublic, RFC.authSecret))).toBe(
      RFC.plaintext,
    );
  });

  it("uses a fresh salt and ephemeral key per message", async () => {
    const target = { p256dh: RFC.receiverPublic, auth: RFC.authSecret };
    const [a, b] = await Promise.all([encryptPayload(target, text("x")), encryptPayload(target, text("x"))]);
    expect(base64urlEncode(a.slice(0, 16))).not.toBe(base64urlEncode(b.slice(0, 16)));
    expect(base64urlEncode(a.slice(21, 86))).not.toBe(base64urlEncode(b.slice(21, 86)));
  });

  it("rejects oversized payloads and malformed subscription keys", async () => {
    const target = { p256dh: RFC.receiverPublic, auth: RFC.authSecret };
    await expect(encryptPayload(target, new Uint8Array(MAX_PLAINTEXT_BYTES + 1))).rejects.toThrow(
      /too large/,
    );
    await expect(encryptPayload(target, new Uint8Array(MAX_PLAINTEXT_BYTES))).resolves.toHaveLength(4096);
    await expect(encryptPayload({ ...target, auth: "AAAA" }, text("x"))).rejects.toThrow(/auth/);
    await expect(encryptPayload({ ...target, p256dh: "AAAA" }, text("x"))).rejects.toThrow(/p256dh/);
  });
});

describe("RFC 8292 VAPID and request headers", () => {
  let vapid: VapidKeys;
  let verifyKey: CryptoKey;
  const target: PushTarget = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    p256dh: RFC.receiverPublic,
    auth: RFC.authSecret,
  };
  const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);

  beforeEach(async () => {
    clearVapidCache();
    const pair = await ecdsaPair(true);
    verifyKey = pair.publicKey;
    vapid = {
      privateKey: pair.privateKey,
      publicKey: base64urlEncode(
        new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer),
      ),
      subject: "mailto:return@return.test",
    };
  });

  const parts = (authorization: string) => {
    const match = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(authorization);
    if (!match?.[1] || !match[2]) throw new Error(`bad Authorization: ${authorization}`);
    return { jwt: match[1], key: match[2] };
  };

  it("signs an ES256 JWT for the endpoint origin that verifies with the public key", async () => {
    const request = await buildPushRequest(target, text("{}"), { ttl: 60, urgency: "normal" }, vapid, NOW);
    const { jwt, key } = parts(request.headers.get("Authorization") ?? "");
    expect(key).toBe(vapid.publicKey);
    const { payload, protectedHeader } = await jwtVerify(jwt, verifyKey, {
      audience: "https://fcm.googleapis.com",
      currentDate: new Date(NOW),
    });
    expect(protectedHeader).toEqual({ typ: "JWT", alg: "ES256" });
    expect(payload.sub).toBe("mailto:return@return.test");
    expect(payload.exp).toBe(NOW / 1000 + 12 * 3600);
    // A signature from another key must not verify.
    const other = await ecdsaPair(false);
    await expect(jwtVerify(jwt, other.publicKey, { currentDate: new Date(NOW) })).rejects.toThrow();
  });

  it("caches the JWT per audience and renews it one hour before expiry", async () => {
    const jwtOf = async (endpoint: string, at: number) => {
      const req = await buildPushRequest(
        { ...target, endpoint },
        text("{}"),
        { ttl: 1, urgency: "low" },
        vapid,
        at,
      );
      return parts(req.headers.get("Authorization") ?? "").jwt;
    };
    const first = await jwtOf("https://fcm.googleapis.com/a", NOW);
    expect(await jwtOf("https://fcm.googleapis.com/b", NOW + 3 * 3600_000)).toBe(first);
    expect(await jwtOf("https://updates.push.services.mozilla.com/c", NOW)).not.toBe(first);
    expect(await jwtOf("https://fcm.googleapis.com/a", NOW + 11.5 * 3600_000)).not.toBe(first);
  });

  it("sets TTL, Urgency, Content-Encoding and Topic", async () => {
    const request = await buildPushRequest(
      target,
      text("{}"),
      { ttl: 86_400, urgency: "high", topic: "c0123456789abcdef" },
      vapid,
      NOW,
    );
    expect(request.method).toBe("POST");
    expect(request.url).toBe(target.endpoint);
    expect(request.headers.get("TTL")).toBe("86400");
    expect(request.headers.get("Urgency")).toBe("high");
    expect(request.headers.get("Topic")).toBe("c0123456789abcdef");
    expect(request.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(request.headers.get("Content-Type")).toBe("application/octet-stream");
    const plain = await buildPushRequest(target, text("{}"), { ttl: 5, urgency: "normal" }, vapid, NOW);
    expect(plain.headers.has("Topic")).toBe(false);
  });

  describe("sendWebPush results", () => {
    afterEach(() => vi.restoreAllMocks());
    const send = () => sendWebPush(target, text("{}"), { ttl: 60, urgency: "normal" }, vapid, NOW);

    it.each([
      [201, { kind: "ok" }],
      [202, { kind: "ok" }],
      [404, { kind: "gone" }],
      [410, { kind: "gone" }],
      [400, { kind: "error", status: 400, error: "http_400", transient: false }],
      [401, { kind: "error", status: 401, error: "http_401", transient: false }],
      [403, { kind: "error", status: 403, error: "http_403", transient: false }],
      [413, { kind: "error", status: 413, error: "http_413", transient: false }],
      [429, { kind: "error", status: 429, error: "http_429", transient: true }],
      [503, { kind: "error", status: 503, error: "http_503", transient: true }],
    ])("maps HTTP %i", async (status, expected) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
      expect(await send()).toEqual(expected);
    });

    it("does not follow redirects: a 307 is an error and the Authorization header goes nowhere else", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        if (request.url.startsWith("https://fcm.googleapis.com/")) {
          return new Response(null, { status: 307, headers: { Location: "https://evil.example/steal" } });
        }
        return new Response(null, { status: 201 });
      });
      expect(await send()).toEqual({ kind: "error", status: 307, error: "http_3xx", transient: false });
      expect(spy).toHaveBeenCalledOnce();
      const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.redirect).toBe("manual");
      const sent = spy.mock.calls[0]?.[0] as Request | undefined;
      expect(sent?.url).toBe(target.endpoint);
    });

    it("refuses to contact an endpoint outside the allowlist, even if a row holds one", async () => {
      const spy = vi.spyOn(globalThis, "fetch");
      const result = await sendWebPush(
        { ...target, endpoint: "https://evil.example/push" },
        text("{}"),
        { ttl: 60, urgency: "normal" },
        vapid,
        NOW,
      );
      expect(result).toEqual({
        kind: "error",
        status: null,
        error: "endpoint_not_allowed",
        transient: false,
      });
      expect(spy).not.toHaveBeenCalled();
    });

    it("reports an encryption failure without touching the network", async () => {
      const spy = vi.spyOn(globalThis, "fetch");
      const result = await sendWebPush(
        { ...target, p256dh: "AAAA" },
        text("{}"),
        { ttl: 60, urgency: "normal" },
        vapid,
        NOW,
      );
      expect(result).toEqual({ kind: "error", status: null, error: "encrypt_failed", transient: false });
      expect(spy).not.toHaveBeenCalled();
    });

    it("never throws on network failure or timeout and passes an abort signal", async () => {
      const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("boom"));
      expect(await send()).toEqual({ kind: "error", status: null, error: "network_error", transient: true });
      spy.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
      expect(await send()).toEqual({ kind: "error", status: null, error: "timeout", transient: true });
      const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });
  });
});
