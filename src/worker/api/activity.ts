import { Hono } from "hono";
import { z } from "zod";
import type { ActivityEvent } from "../../shared/schemas";
import { decodeCursor, listActivity } from "../db/activity";
import type { AppEnv } from "../env";
import { AppError, parseWith } from "../lib/http";

export const activityApi = new Hono<AppEnv>();

const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // Opaque cursor: pass back the `nextBefore` of the previous page.
  before: z.string().max(200).optional(),
});

activityApi.get("/", async (c) => {
  const { limit, before } = parseWith(activityQuerySchema, c.req.query());
  const cursor = before === undefined ? undefined : decodeCursor(before);
  if (cursor === null) throw new AppError(422, "validation_failed", "Invalid cursor", [{ path: ["before"] }]);
  const page = await listActivity(c.env.DB, c.get("ownerId"), { limit, before: cursor });
  return c.json<{ events: ActivityEvent[]; nextBefore: string | null }>(page);
});
