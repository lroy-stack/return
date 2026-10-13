/**
 * Pure helpers for the owner's push client (ADR 0003): used by the panel (Settings > Notifications) and by the
 * service worker (`src/sw/sw.ts`), so everything here is plain TypeScript with no DOM, worker or zod dependency.
 */

export const GENERIC_PUSH = { title: "RETURN", body: "Something new in RETURN" } as const;

export interface PushNotificationView {
  title: string;
  body: string;
  /** Deduplication key: a newer notification with the same tag replaces the older one. */
  tag: string | undefined;
  lang: string | undefined;
  /** Same-origin path (never a full URL) the click opens. */
  url: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const text = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

/**
 * The only way a click target is derived: a same-origin path of the panel. Anything else (other origin, `/api`,
 * `/cdn-cgi`, unparsable) becomes "/". Defends the worker against a malformed or hostile payload.
 */
export function safePanelPath(raw: unknown, origin: string): string {
  if (typeof raw !== "string") return "/";
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin) return "/";
    if (/^\/(?:api|cdn-cgi)(?:\/|$)/i.test(url.pathname.replace(/\/{2,}/g, "/"))) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/**
 * Reads the declarative payload the server sends (`pushPayloadSchema`: `notification.{title,body,navigate,lang,tag}`).
 * Defensive on purpose: any missing or invalid part falls back to the generic notification, because a push must
 * always show something (`userVisibleOnly`). Only `notification` is read; nothing else can reach the screen.
 */
export function parsePushPayload(raw: unknown, origin: string): PushNotificationView {
  const n = isRecord(raw) && isRecord(raw.notification) ? raw.notification : null;
  const title = text(n?.title, 60);
  const body = text(n?.body, 160);
  return {
    title: title ?? GENERIC_PUSH.title,
    body: body ?? (title ? "" : GENERIC_PUSH.body),
    tag: text(n?.tag, 64),
    lang: text(n?.lang, 8),
    url: safePanelPath(n?.navigate, origin),
  };
}

/** `PushSubscription.toJSON()` reduced to what `POST /api/push/subscriptions` accepts, or null if incomplete. */
export function subscriptionBody(
  json: { endpoint?: string; keys?: Record<string, string> },
  label: string | null,
): { endpoint: string; keys: { p256dh: string; auth: string }; label: string | null } | null {
  const { endpoint, keys } = json;
  if (!endpoint || !keys?.p256dh || !keys.auth) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, label };
}

/** VAPID public key (unpadded base64url) to the bytes `pushManager.subscribe` wants as `applicationServerKey`. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface PushEnvironment {
  userAgent: string;
  /** `navigator.maxTouchPoints`: iPadOS 13+ reports a Mac user agent. */
  maxTouchPoints: number;
  /** Launched from the Home Screen / installed (display-mode standalone or `navigator.standalone`). */
  standalone: boolean;
  secureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: "default" | "granted" | "denied";
}

export function isIosDevice(env: Pick<PushEnvironment, "userAgent" | "maxTouchPoints">): boolean {
  return (
    /iPhone|iPad|iPod/.test(env.userAgent) || (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1)
  );
}

/**
 * What the "this device" block can do:
 * - `unsupported`: no service worker / Push API / Notifications, or not a secure context;
 * - `ios-install`: iOS only delivers web push to Home Screen apps, so the panel must be added first;
 * - `denied`: the browser blocked notifications, only the browser settings can undo that;
 * - `off`: possible, not subscribed;  `on`: subscribed on this device.
 */
export type DevicePushState = "unsupported" | "ios-install" | "denied" | "off" | "on";

export function devicePushState(env: PushEnvironment, subscribed: boolean): DevicePushState {
  if (isIosDevice(env) && !env.standalone) return "ios-install";
  if (!env.secureContext || !env.hasServiceWorker || !env.hasPushManager || !env.hasNotification)
    return "unsupported";
  if (env.permission === "denied") return "denied";
  return subscribed && env.permission === "granted" ? "on" : "off";
}

/** Default device name, e.g. "iPhone · Safari" or "Mac · Chrome"; the owner can edit it. */
export function deviceLabel(
  env: Pick<PushEnvironment, "userAgent" | "maxTouchPoints" | "standalone">,
): string {
  const ua = env.userAgent;
  const device = /iPhone|iPod/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : "Device";
  const browser =
    isIosDevice({ userAgent: ua, maxTouchPoints: env.maxTouchPoints }) && env.standalone
      ? "Home Screen"
      : /Edg\//.test(ua)
        ? "Edge"
        : /OPR\/|Opera/.test(ua)
          ? "Opera"
          : /Firefox\/|FxiOS\//.test(ua)
            ? "Firefox"
            : /CriOS\/|Chrome\//.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : "Browser";
  return `${device} · ${browser}`;
}
