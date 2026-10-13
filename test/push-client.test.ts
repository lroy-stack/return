import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  deviceLabel,
  devicePushState,
  GENERIC_PUSH,
  isIosDevice,
  type PushEnvironment,
  parsePushPayload,
  safePanelPath,
  subscriptionBody,
} from "../src/shared/push-client";
import { pushPayloadSchema } from "../src/shared/schemas";

const ORIGIN = "https://app.return.test";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
  winEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
};

const env = (over: Partial<PushEnvironment> = {}): PushEnvironment => ({
  userAgent: UA.macChrome,
  maxTouchPoints: 0,
  standalone: false,
  secureContext: true,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: "default",
  ...over,
});

describe("deviceLabel", () => {
  it.each([
    [UA.iphoneSafari, 5, false, "iPhone · Safari"],
    [UA.iphoneSafari, 5, true, "iPhone · Home Screen"],
    [UA.iphoneChrome, 5, false, "iPhone · Chrome"],
    [UA.ipadDesktopMode, 5, false, "iPad · Safari"],
    [UA.androidChrome, 5, false, "Android · Chrome"],
    [UA.macChrome, 0, false, "Mac · Chrome"],
    [UA.macFirefox, 0, false, "Mac · Firefox"],
    [UA.winEdge, 0, false, "Windows · Edge"],
    ["", 0, false, "Device · Browser"],
  ])("%#: %s", (userAgent, maxTouchPoints, standalone, expected) => {
    expect(deviceLabel({ userAgent, maxTouchPoints, standalone })).toBe(expected);
  });
});

describe("devicePushState", () => {
  it("iOS outside the Home Screen must install first, even though PushManager is missing there", () => {
    expect(devicePushState(env({ userAgent: UA.iphoneSafari, hasPushManager: false }), false)).toBe(
      "ios-install",
    );
    expect(devicePushState(env({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 }), false)).toBe(
      "ios-install",
    );
  });
  it("iOS installed to the Home Screen can subscribe", () => {
    expect(devicePushState(env({ userAgent: UA.iphoneSafari, standalone: true }), false)).toBe("off");
  });
  it.each([
    { secureContext: false },
    { hasServiceWorker: false },
    { hasPushManager: false },
    { hasNotification: false },
  ])("%o is unsupported", (over) => {
    expect(devicePushState(env(over), false)).toBe("unsupported");
  });
  it("denied beats subscribed", () => {
    expect(devicePushState(env({ permission: "denied" }), true)).toBe("denied");
  });
  it("on needs both a subscription and granted permission", () => {
    expect(devicePushState(env({ permission: "granted" }), true)).toBe("on");
    expect(devicePushState(env({ permission: "granted" }), false)).toBe("off");
    expect(devicePushState(env({ permission: "default" }), true)).toBe("off");
  });
  it("isIosDevice", () => {
    expect(isIosDevice({ userAgent: UA.macChrome, maxTouchPoints: 0 })).toBe(false);
    expect(isIosDevice({ userAgent: UA.macChrome, maxTouchPoints: 5 })).toBe(true);
  });
});

describe("safePanelPath", () => {
  it.each([
    [`${ORIGIN}/conversations/abc`, "/conversations/abc"],
    [`${ORIGIN}/conversations/abc?x=1#y`, "/conversations/abc?x=1#y"],
    ["/conversations/abc", "/conversations/abc"],
    [`${ORIGIN}`, "/"],
  ])("keeps %s", (raw, expected) => expect(safePanelPath(raw, ORIGIN)).toBe(expected));

  it.each([
    "https://evil.test/conversations/abc",
    "http://app.return.test/conversations/abc",
    "//evil.test/x",
    "javascript:alert(1)",
    `${ORIGIN}/api/export`,
    `${ORIGIN}/API/export`,
    `${ORIGIN}//api/export`,
    `${ORIGIN}/cdn-cgi/access/logout`,
    "",
    null,
    undefined,
    42,
    {},
  ])("falls back to / for %j", (raw) => expect(safePanelPath(raw, ORIGIN)).toBe("/"));
});

describe("parsePushPayload", () => {
  it("reads exactly what the server's content-free payload contains", () => {
    const payload = pushPayloadSchema.parse({
      web_push: 8030,
      notification: {
        title: "RETURN",
        body: "New message about an item",
        navigate: `${ORIGIN}/conversations/c1`,
        lang: "es",
        tag: "c-c1",
      },
      return: { v: 1, kind: "new_message", conversationId: "c1" },
    });
    expect(parsePushPayload(payload, ORIGIN)).toEqual({
      title: "RETURN",
      body: "New message about an item",
      tag: "c-c1",
      lang: "es",
      url: "/conversations/c1",
    });
  });

  it.each([
    null,
    undefined,
    "text",
    5,
    [],
    {},
    { notification: null },
    { notification: "x" },
    { notification: {} },
  ])("shows the generic notification for %j", (raw) => {
    expect(parsePushPayload(raw, ORIGIN)).toEqual({
      title: GENERIC_PUSH.title,
      body: GENERIC_PUSH.body,
      tag: undefined,
      lang: undefined,
      url: "/",
    });
  });

  it("ignores everything outside notification, bounds lengths and neutralises a hostile target", () => {
    const view = parsePushPayload(
      {
        message: "secret text",
        data: { text: "secret text" },
        notification: {
          title: "T".repeat(500),
          body: 7,
          tag: "t".repeat(500),
          navigate: "https://evil.test/phish",
        },
      },
      ORIGIN,
    );
    expect(view.title).toHaveLength(60);
    expect(view.body).toBe("");
    expect(view.tag).toHaveLength(64);
    expect(view.url).toBe("/");
    expect(JSON.stringify(view)).not.toContain("secret text");
  });
});

describe("subscriptionBody", () => {
  const keys = { p256dh: "p".repeat(87), auth: "a".repeat(22) };
  it("keeps only what the API accepts", () => {
    expect(
      subscriptionBody(
        { endpoint: "https://fcm.googleapis.com/x", keys: { ...keys, extra: "no" } },
        "Mac · Chrome",
      ),
    ).toEqual({ endpoint: "https://fcm.googleapis.com/x", keys, label: "Mac · Chrome" });
  });
  it.each([{}, { endpoint: "https://x" }, { endpoint: "https://x", keys: { p256dh: "p" } }])(
    "rejects an incomplete subscription %j",
    (json) => expect(subscriptionBody(json, null)).toBeNull(),
  );
});

describe("base64UrlToBytes", () => {
  it("decodes unpadded base64url", () => {
    expect([...base64UrlToBytes("AQID")]).toEqual([1, 2, 3]);
    expect([...base64UrlToBytes("-_8")]).toEqual([251, 255]);
  });
  it("decodes the VAPID public key to a 65-byte uncompressed point", () => {
    const bytes = base64UrlToBytes(
      "<vapid-public-key>",
    );
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(4);
  });
});
