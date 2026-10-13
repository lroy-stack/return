import { Hono } from "hono";
import {
  type PushConfig,
  type PushSubscriptionView,
  pushSubscribeSchema,
  pushTestSchema,
} from "../../shared/schemas";
import {
  deleteOwnerSubscription,
  listOwnerSubscriptions,
  MAX_OWNER_SUBSCRIPTIONS,
  upsertWebPushSubscription,
} from "../db/push";
import { getSettings } from "../db/settings";
import type { AppEnv } from "../env";
import { base64urlDecode } from "../lib/base64url";
import { AppError, notFound, parseJson } from "../lib/http";
import { sendTestPush } from "../services/push/owner-push";
import { loadVapid } from "../services/push/webpush";

export const pushApi = new Hono<AppEnv>();

/** The key the browser needs for `pushManager.subscribe`; null while push is not set up. */
pushApi.get("/config", async (c) =>
  c.json<PushConfig>({ vapidPublicKey: (await loadVapid(c.env))?.publicKey ?? null }),
);

pushApi.get("/subscriptions", async (c) =>
  c.json<{ subscriptions: PushSubscriptionView[] }>({
    subscriptions: await listOwnerSubscriptions(c.env.DB, c.get("ownerId")),
  }),
);

/** Idempotent on the endpoint: the browser may call it again after every app start. */
pushApi.post("/subscriptions", async (c) => {
  const input = await parseJson(c, pushSubscribeSchema);
  // A point that is not on the curve would only fail later, at the first push.
  try {
    await crypto.subtle.importKey(
      "raw",
      base64urlDecode(input.keys.p256dh),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );
  } catch {
    throw new AppError(422, "validation_failed", "keys.p256dh is not a valid P-256 public key");
  }
  const result = await upsertWebPushSubscription(c.env.DB, c.get("ownerId"), {
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    label: input.label ?? null,
  });
  if (result === "limit_reached") {
    throw new AppError(
      409,
      "too_many_subscriptions",
      `At most ${MAX_OWNER_SUBSCRIPTIONS} devices can receive push. Remove one first.`,
    );
  }
  if (result === "endpoint_in_use") {
    throw new AppError(409, "endpoint_in_use", "This device is registered to another account");
  }
  return c.json({ id: result.id }, 201);
});

pushApi.delete("/subscriptions/:id", async (c) => {
  if (!(await deleteOwnerSubscription(c.env.DB, c.get("ownerId"), c.req.param("id"))))
    throw notFound("Device");
  return c.body(null, 204);
});

/** Sends a test push to every device (or to `subscriptionId`) and reports each outcome. */
pushApi.post("/test", async (c) => {
  const ownerId = c.get("ownerId");
  const hasBody = (c.req.header("Content-Type") ?? "").includes("json");
  const { subscriptionId } = hasBody ? await parseJson(c, pushTestSchema) : { subscriptionId: undefined };
  const result = await sendTestPush(c.env, ownerId, await getSettings(c.env.DB, ownerId), subscriptionId);
  if (subscriptionId && result.code === "no_subscriptions") throw notFound("Device");
  return c.json(result);
});
