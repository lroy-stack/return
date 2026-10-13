import { Hono } from "hono";
import type { ConversationSummary, ItemDetail } from "../../shared/schemas";
import {
  deleteItemSchema,
  itemInputSchema,
  itemListQuerySchema,
  itemPatchSchema,
  markFoundSchema,
  markLostSchema,
  publicPhotoSchema,
} from "../../shared/schemas";
import { recordActivity } from "../db/activity";
import { listConversationSummaries } from "../db/conversations";
import { deleteStoredObjects, listItemFiles } from "../db/files";
import {
  createItem,
  getOwnedItemRow,
  listItemSummaries,
  sameItemName,
  setArchived,
  toItem,
  updateItem,
} from "../db/items";
import {
  listRecoveryEvents,
  markLost,
  markRecovered,
  RECOVERY_SELECT,
  type RecoveryRow,
  toRecovery,
} from "../db/recoveries";
import { listTags } from "../db/tags";
import { listTrackers } from "../db/trackers";
import type { AppEnv } from "../env";
import { AppError, parseJson, parseWith } from "../lib/http";
import { nowIso } from "../lib/time";
import { fileApiPath, publicOrigin } from "../lib/urls";

export const itemsApi = new Hono<AppEnv>();

itemsApi.get("/", async (c) => {
  const query = parseWith(itemListQuerySchema, c.req.query());
  const items = await listItemSummaries(
    c.env.DB,
    c.get("ownerId"),
    { q: query.q, status: query.status, category: query.category, archived: query.archived === "true" },
    fileApiPath,
  );
  return c.json({ items });
});

itemsApi.post("/", async (c) => {
  const input = await parseJson(c, itemInputSchema);
  const ownerId = c.get("ownerId");
  const item = await createItem(c.env.DB, ownerId, input);
  await recordActivity(c.env.DB, { ownerId, type: "item.created", itemId: item.id });
  return c.json(item, 201);
});

itemsApi.get("/:id", async (c) => {
  const ownerId = c.get("ownerId");
  const db = c.env.DB;
  const item = toItem(await getOwnedItemRow(db, ownerId, c.req.param("id")));
  const [files, tags, trackers, children, recoveries, recoveryEvents, conversations] = await Promise.all([
    listItemFiles(db, ownerId, item.id),
    listTags(db, ownerId, publicOrigin(c.env, c.req.url), { itemId: item.id }),
    listTrackers(db, ownerId, { itemId: item.id }),
    listItemSummaries(db, ownerId, { parentId: item.id }, fileApiPath),
    db
      .prepare(`${RECOVERY_SELECT} WHERE r.owner_id = ? AND r.item_id = ? ORDER BY r.created_at DESC`)
      .bind(ownerId, item.id)
      .all<RecoveryRow>()
      .then((r) => r.results.map(toRecovery)),
    listRecoveryEvents(db, ownerId, item.id),
    listConversationSummaries(db, ownerId, { itemId: item.id }),
  ]);
  return c.json<ItemDetail>({
    item,
    files,
    tags,
    trackers,
    children,
    recoveries,
    recoveryEvents,
    conversations,
  });
});

itemsApi.patch("/:id", async (c) => {
  const patch = await parseJson(c, itemPatchSchema);
  const ownerId = c.get("ownerId");
  const item = await updateItem(c.env.DB, ownerId, c.req.param("id"), patch);
  await recordActivity(c.env.DB, { ownerId, type: "item.updated", itemId: item.id });
  return c.json(item);
});

itemsApi.post("/:id/archive", async (c) => {
  const ownerId = c.get("ownerId");
  const item = await setArchived(c.env.DB, ownerId, c.req.param("id"), true);
  await recordActivity(c.env.DB, { ownerId, type: "item.archived", itemId: item.id });
  return c.json(item);
});

itemsApi.post("/:id/unarchive", async (c) => {
  const ownerId = c.get("ownerId");
  const item = await setArchived(c.env.DB, ownerId, c.req.param("id"), false);
  await recordActivity(c.env.DB, { ownerId, type: "item.unarchived", itemId: item.id });
  return c.json(item);
});

/**
 * Permanent deletion is a two-step, typed confirmation: the item must already be archived
 * and the request must repeat its exact name. Stored files are removed from R2 as well.
 */
itemsApi.delete("/:id", async (c) => {
  const { confirmName } = await parseJson(c, deleteItemSchema);
  const ownerId = c.get("ownerId");
  const row = await getOwnedItemRow(c.env.DB, ownerId, c.req.param("id"));
  if (!row.archived_at) throw new AppError(409, "not_archived", "Archive the item before deleting it");
  if (!sameItemName(confirmName, row.name))
    throw new AppError(422, "confirmation_mismatch", "Type the item name to confirm");
  const { results: files } = await c.env.DB.prepare(
    "SELECT r2_key FROM item_files WHERE item_id = ? AND owner_id = ?",
  )
    .bind(row.id, ownerId)
    .all<{ r2_key: string }>();
  // Tags keep their row (tokens are never reused) but are revoked so the printed URL goes dark.
  const now = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE tags SET status = 'revoked', revoked_at = COALESCE(revoked_at, ?) WHERE item_id = ? AND owner_id = ?",
    ).bind(now, row.id, ownerId),
    c.env.DB.prepare("DELETE FROM items WHERE id = ? AND owner_id = ?").bind(row.id, ownerId),
  ]);
  await recordActivity(c.env.DB, { ownerId, type: "item.deleted", data: { name: row.name } });
  // Rows are gone; removing the objects is best-effort so a storage outage cannot block deletion.
  await deleteStoredObjects(
    c.env.FILES,
    files.map((f) => f.r2_key),
  );
  return c.body(null, 204);
});

itemsApi.post("/:id/lost", async (c) => {
  const input = await parseJson(c, markLostSchema);
  const recovery = await markLost(c.env.DB, c.get("ownerId"), c.req.param("id"), input);
  return c.json(recovery);
});

itemsApi.post("/:id/recovered", async (c) => {
  const { notes } = await parseJson(c, markFoundSchema);
  const ownerId = c.get("ownerId");
  const itemId = c.req.param("id");
  const recovery = await markRecovered(c.env.DB, ownerId, itemId, notes ?? null);
  // Conversations stay open on purpose: the owner decides whether to thank the finder and close them.
  const openConversations: ConversationSummary[] = await listConversationSummaries(c.env.DB, ownerId, {
    itemId,
    status: "open",
  });
  return c.json({ recovery, openConversations });
});

/** Choose which photo (if any) finders see. Only photos of this item qualify. */
itemsApi.put("/:id/public-photo", async (c) => {
  const { fileId } = await parseJson(c, publicPhotoSchema);
  const ownerId = c.get("ownerId");
  const row = await getOwnedItemRow(c.env.DB, ownerId, c.req.param("id"));
  if (fileId) {
    const file = await c.env.DB.prepare(
      "SELECT id FROM item_files WHERE id = ? AND item_id = ? AND owner_id = ? AND kind = 'photo'",
    )
      .bind(fileId, row.id, ownerId)
      .first();
    if (!file) throw new AppError(422, "invalid_photo", "Choose one of this item's photos");
  }
  const item = await updatePublicPhoto(c.env.DB, ownerId, row.id, fileId);
  return c.json(item);
});

async function updatePublicPhoto(db: D1Database, ownerId: string, itemId: string, fileId: string | null) {
  await db
    .prepare("UPDATE items SET public_photo_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(fileId, nowIso(), itemId, ownerId)
    .run();
  return toItem(await getOwnedItemRow(db, ownerId, itemId));
}
