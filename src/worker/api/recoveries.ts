import { Hono } from "hono";
import { z } from "zod";
import { RECOVERY_STATUSES, recoveryPatchSchema } from "../../shared/schemas";
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
  return c.json(await updateRecovery(c.env.DB, c.get("ownerId"), c.req.param("id"), patch));
});
