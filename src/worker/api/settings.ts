import { Hono } from "hono";
import { z } from "zod";
import { deepMerge, settingsSchema } from "../../shared/settings";
import { recordActivity } from "../db/activity";
import { getSettings, saveSettings } from "../db/settings";
import type { AppEnv } from "../env";
import { parseJson, parseWith } from "../lib/http";
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

/** Partial update: the body is deep-merged onto the stored document and the merged result is validated. */
settingsApi.patch("/", async (c) => {
  const ownerId = c.get("ownerId");
  const patch = await parseJson(c, z.record(z.string(), z.unknown()));
  const settings = parseWith(settingsSchema, deepMerge(await getSettings(c.env.DB, ownerId), patch));
  await saveSettings(c.env.DB, ownerId, settings);
  await recordActivity(c.env.DB, { ownerId, type: "settings.updated" });
  return c.json(settings);
});

settingsApi.post("/test-email", async (c) => c.json(await sendTestEmail(c.env, c.get("ownerId"))));
