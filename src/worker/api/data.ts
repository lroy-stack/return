import { Hono } from "hono";
import { recordActivity } from "../db/activity";
import { buildExport, importExport, importRequestSchema, ownerIsEmpty } from "../db/export";
import type { AppEnv } from "../env";
import { AppError, parseJson } from "../lib/http";
import { attachmentDisposition } from "./files";

export const dataApi = new Hono<AppEnv>();

dataApi.get("/export", async (c) => {
  const ownerId = c.get("ownerId");
  const doc = await buildExport(c.env.DB, ownerId);
  await recordActivity(c.env.DB, { ownerId, type: "data.exported" });
  return new Response(JSON.stringify(doc), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": attachmentDisposition(`return-export-${doc.exportedAt.slice(0, 10)}.json`),
      "Cache-Control": "no-store",
    },
  });
});

/** Disaster recovery only: refuses to run when the owner already has items or tags. */
dataApi.post("/import", async (c) => {
  const { data } = await parseJson(c, importRequestSchema);
  const ownerId = c.get("ownerId");
  if (!(await ownerIsEmpty(c.env.DB, ownerId))) {
    throw new AppError(409, "not_empty", "Restore is only possible into an empty account");
  }
  const imported = await importExport(c.env.DB, ownerId, data);
  await recordActivity(c.env.DB, { ownerId, type: "data.imported", data: { ...imported } });
  return c.json({ imported });
});
