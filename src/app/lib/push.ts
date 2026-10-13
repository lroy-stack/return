import { useCallback, useEffect, useState } from "react";
import {
  base64UrlToBytes,
  type DevicePushState,
  deviceLabel,
  devicePushState,
  type PushEnvironment,
  subscriptionBody,
} from "../../shared/push-client";
import type { PushConfig, PushSubscriptionView } from "../../shared/schemas";
import { api } from "./api";

/**
 * This device's Web Push registration (ADR 0003). The server never returns endpoints, so the id it gave this browser
 * is remembered locally next to the endpoint it belongs to; that is how the device list marks "this device".
 */
const STORAGE_KEY = "return.push.device";

interface StoredDevice {
  id: string;
  endpoint: string;
  /** The name last sent, so a silent re-registration never replaces what the owner typed. */
  label: string | null;
}

function readStored(): StoredDevice | null {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof v === "object" && v !== null && "id" in v && "endpoint" in v) {
      const { id, endpoint, label } = v as Record<string, unknown>;
      if (typeof id === "string" && typeof endpoint === "string")
        return { id, endpoint, label: typeof label === "string" ? label : null };
    }
  } catch {
    // Unreadable: treated as not registered.
  }
  return null;
}

function writeStored(device: StoredDevice | null): void {
  try {
    if (device) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(device));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the list simply cannot mark this device.
  }
}

export function readPushEnvironment(): PushEnvironment {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
    secureContext: window.isSecureContext,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : "default",
  };
}

/** The registration, allowing a few seconds for the first-ever registration (it starts on `load`). */
async function registrationSoon(): Promise<ServiceWorkerRegistration | undefined> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing || !import.meta.env.PROD) return existing;
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => window.setTimeout(resolve, 3000)),
  ]);
  return navigator.serviceWorker.getRegistration();
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Registers (or re-registers, the endpoint is the idempotency key) a browser subscription with the server. */
async function register(subscription: PushSubscription, label: string | null): Promise<StoredDevice> {
  const body = subscriptionBody(subscription.toJSON(), label);
  if (!body) throw new Error("incomplete subscription");
  const { id } = await api.post<{ id: string }>("/push/subscriptions", body);
  const device = { id, endpoint: subscription.endpoint, label };
  writeStored(device);
  return device;
}

export interface DevicePush {
  state: DevicePushState | "loading";
  /** True when the server has no VAPID key pair: enabling is impossible until it is set up. */
  serverReady: boolean;
  /** The id the server knows this browser by, once registered. */
  deviceId: string | null;
  busy: boolean;
  error: unknown;
  enable: (label: string) => Promise<void>;
  disable: () => Promise<void>;
  rename: (label: string) => Promise<void>;
}

/**
 * State machine for "Notifications on this device". `enable` must be called from a click (iOS and Chrome only
 * show the permission prompt for a user gesture). `onChanged` runs after the server-side list changed.
 */
export function useDevicePush(onChanged: () => void, devices: PushSubscriptionView[] | null): DevicePush {
  const [env, setEnv] = useState<PushEnvironment>(readPushEnvironment);
  const [subscribed, setSubscribed] = useState(false);
  const [ready, setReady] = useState(false);
  const [serverReady, setServerReady] = useState(true);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const refresh = useCallback(async () => {
    const next = readPushEnvironment();
    setEnv(next);
    if (!next.hasServiceWorker || !next.hasPushManager) {
      setReady(true);
      return;
    }
    try {
      // `/sw.js` exists only in production builds (and registers on load): without it there is nothing to subscribe.
      const registration = await registrationSoon();
      if (!registration) setEnv({ ...next, hasServiceWorker: false });
      const sub = (await registration?.pushManager.getSubscription()) ?? null;
      setSubscribed(sub !== null);
      const stored = readStored();
      setDeviceId(sub && stored?.endpoint === sub.endpoint ? stored.id : null);
    } catch {
      setSubscribed(false);
    }
    setReady(true);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    void refresh();
    api
      .get<PushConfig>("/push/config")
      .then((c) => setServerReady(c.vapidPublicKey !== null))
      .catch(() => undefined);
  }, []);

  // Heal after a browser-side change (pushsubscriptionchange) or a server-side removal: register again silently.
  useEffect(() => {
    if (!ready || !subscribed || devices === null || busy) return;
    if (deviceId && devices.some((d) => d.id === deviceId)) return;
    currentSubscription()
      .then((sub) => (sub ? register(sub, readStored()?.label ?? deviceLabel(readPushEnvironment())) : null))
      .then((device) => {
        if (device) {
          setDeviceId(device.id);
          onChanged();
        }
      })
      .catch(() => undefined);
  }, [ready, subscribed, devices, deviceId, busy, onChanged]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, []);

  const enable = useCallback(
    (label: string) =>
      run(async () => {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          await refresh();
          return;
        }
        const config = await api.get<PushConfig>("/push/config");
        if (!config.vapidPublicKey) {
          setServerReady(false);
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const sub =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToBytes(config.vapidPublicKey),
          }));
        const device = await register(sub, label.trim() || null);
        setSubscribed(true);
        setDeviceId(device.id);
        setEnv(readPushEnvironment());
        onChanged();
      }),
    [run, refresh, onChanged],
  );

  const disable = useCallback(
    () =>
      run(async () => {
        const stored = readStored();
        const sub = await currentSubscription();
        if (stored) await api.delete(`/push/subscriptions/${stored.id}`).catch(ignoreMissing);
        await sub?.unsubscribe();
        writeStored(null);
        setSubscribed(false);
        setDeviceId(null);
        onChanged();
      }),
    [run, onChanged],
  );

  const rename = useCallback(
    (label: string) =>
      run(async () => {
        const sub = await currentSubscription();
        if (!sub) return;
        await register(sub, label.trim() || null);
        onChanged();
      }),
    [run, onChanged],
  );

  const state: DevicePush["state"] = ready ? devicePushState(env, subscribed) : "loading";
  return { state, serverReady, deviceId, busy, error, enable, disable, rename };
}

/** A device the server already forgot (404) is the outcome we wanted. */
function ignoreMissing(e: unknown): void {
  if (!(typeof e === "object" && e !== null && "status" in e && e.status === 404)) throw e;
}

/**
 * Sign-out: forget this device on the server and in the browser, so a signed-out phone stops buzzing.
 * Best effort and bounded (an expired session or no network must not block signing out).
 */
export async function releaseThisDevice(timeoutMs = 4000): Promise<void> {
  const work = (async () => {
    try {
      const stored = readStored();
      const sub =
        "serviceWorker" in navigator && "PushManager" in window ? await currentSubscription() : null;
      if (stored) await api.delete(`/push/subscriptions/${stored.id}`).catch(() => undefined);
      await sub?.unsubscribe();
      writeStored(null);
    } catch {
      // Ignored on purpose.
    }
  })();
  await Promise.race([work, new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs))]);
}
