import { Hono } from "hono";
import { settingsSchema } from "../../shared/settings";
import { recordActivity } from "../db/activity";
import { getSettings, saveSettings } from "../db/settings";
import type { AppEnv } from "../env";
import { parseJson } from "../lib/http";
import { sendTestEmail } from "../services/notify";

export const settingsApi = new Hono<AppEnv>();

settingsApi.get("/", async (c) => c.json(await getSettings(c.env.DB, c.get("ownerId"))));

settingsApi.put("/", async (c) => {
  const settings = await parseJson(c, settingsSchema);
  const ownerId = c.get("ownerId");
  await saveSettings(c.env.DB, ownerId, settings);
  await recordActivity(c.env.DB, { ownerId, type: "settings.updated" });
  return c.json(settings);
});

settingsApi.post("/test-email", async (c) => c.json(await sendTestEmail(c.env, c.get("ownerId"))));
