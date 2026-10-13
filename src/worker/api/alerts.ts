import { Hono } from "hono";
import type { OwnerAlert } from "../../shared/schemas";
import { getSettings } from "../db/settings";
import type { AppEnv } from "../env";
import { emailConfigured, failureMessage, lastOwnerDelivery } from "../services/notify";

export const alertsApi = new Hono<AppEnv>();

/**
 * Conditions the owner must see on every screen (the shell shows a persistent banner). Today: the
 * latest email meant for the owner failed, so a finder's message may have gone unannounced.
 * A successful email, including a test email, clears the alert.
 */
alertsApi.get("/", async (c) => {
  const ownerId = c.get("ownerId");
  const alerts: OwnerAlert[] = [];
  const delivery = await lastOwnerDelivery(c.env.DB, ownerId);
  if (delivery?.code) {
    alerts.push({
      kind: "owner_email_failed",
      code: delivery.code,
      message: failureMessage(delivery.code),
      since: delivery.at,
    });
  } else if (!emailConfigured(c.env) && (await getSettings(c.env.DB, ownerId)).notifications.emailEnabled) {
    alerts.push({
      kind: "owner_email_failed",
      code: "email_not_configured",
      message: failureMessage("email_not_configured"),
      since: null,
    });
  }
  return c.json({ alerts });
});
