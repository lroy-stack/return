import { Hono } from "hono";
import { z } from "zod";
import { RECOVERY_STATUSES, recoveryPatchSchema } from "../../shared/schemas";
import { listConversationSummaries } from "../db/conversations";
import { getOwnedRecoveryRow, listRecoveries, toRecovery, updateRecovery } from "../db/recoveries";
import type { AppEnv } from "../env";
import { parseJson, parseWith } from "../lib/http";

export const recoveriesApi = new Hono<AppEnv>();

const recoveryListQuerySchema = z.object({ status: z.enum(RECOVERY_STATUSES).optional() });

recoveriesApi.get("/", async (c) => {
  const { status } = parseWith(recoveryListQuerySchema, c.req.query());
  const recoveries = await listRecoveries(c.env.DB, c.get("ownerId"), { statuses: status ? [status] : [] });
  return c.json({ recoveries });
});

recoveriesApi.get("/:id", async (c) =>
  c.json(toRecovery(await getOwnedRecoveryRow(c.env.DB, c.get("ownerId"), c.req.param("id")))),
);

recoveriesApi.patch("/:id", async (c) => {
  const patch = await parseJson(c, recoveryPatchSchema);
  const ownerId = c.get("ownerId");
  const recovery = await updateRecovery(c.env.DB, ownerId, c.req.param("id"), patch);
  if (patch.status !== "recovered") return c.json(recovery);
  // Same hand-off as POST /items/:id/recovered: the open conversations the owner may thank and close.
  const openConversations = await listConversationSummaries(c.env.DB, ownerId, {
    itemId: recovery.itemId,
    status: "open",
  });
  return c.json({ ...recovery, openConversations });
});
