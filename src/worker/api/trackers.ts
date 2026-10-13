import { Hono } from "hono";
import { z } from "zod";
import { trackerInputSchema, trackerPatchSchema } from "../../shared/schemas";
import { getOwnedItemRow } from "../db/items";
import { createTracker, deleteTracker, listTrackers, updateTracker } from "../db/trackers";
import type { AppEnv } from "../env";
import { parseJson, parseWith } from "../lib/http";

export const trackersApi = new Hono<AppEnv>();

const trackerListQuerySchema = z.object({ itemId: z.string().max(64).optional() });

trackersApi.get("/", async (c) => {
  const query = parseWith(trackerListQuerySchema, c.req.query());
  return c.json({ trackers: await listTrackers(c.env.DB, c.get("ownerId"), query) });
});

trackersApi.post("/", async (c) => {
  const input = await parseJson(c, trackerInputSchema);
  const ownerId = c.get("ownerId");
  if (input.itemId) await getOwnedItemRow(c.env.DB, ownerId, input.itemId);
  return c.json(await createTracker(c.env.DB, ownerId, input), 201);
});

trackersApi.patch("/:id", async (c) => {
  const patch = await parseJson(c, trackerPatchSchema);
  const ownerId = c.get("ownerId");
  if (patch.itemId) await getOwnedItemRow(c.env.DB, ownerId, patch.itemId);
  return c.json(await updateTracker(c.env.DB, ownerId, c.req.param("id"), patch));
});

trackersApi.delete("/:id", async (c) => {
  await deleteTracker(c.env.DB, c.get("ownerId"), c.req.param("id"));
  return c.body(null, 204);
});
