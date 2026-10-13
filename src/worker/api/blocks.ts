import { Hono } from "hono";
import type { BlockEntry } from "../../shared/schemas";
import { recordActivity } from "../db/activity";
import { listBlocks, removeBlock } from "../db/blocks";
import type { AppEnv } from "../env";
import { nowIso } from "../lib/time";

export const blocksApi = new Hono<AppEnv>();

blocksApi.get("/", async (c) => {
  const blocks: BlockEntry[] = await listBlocks(c.env.DB, c.get("ownerId"), nowIso());
  return c.json({ blocks });
});

blocksApi.delete("/:id", async (c) => {
  const ownerId = c.get("ownerId");
  await removeBlock(c.env.DB, ownerId, c.req.param("id"));
  await recordActivity(c.env.DB, { ownerId, type: "block.removed" });
  return c.body(null, 204);
});
