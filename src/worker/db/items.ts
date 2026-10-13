import type { Item, ItemCategory, ItemInput, ItemPatch, ItemStatus, ItemSummary } from "../../shared/schemas";
import { itemInputSchema, itemPatchSchema } from "../../shared/schemas";
import type { ContactVisibility } from "../../shared/settings";
import { AppError, notFound } from "../lib/http";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

export interface ItemRow {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  category: string;
  description: string | null;
  serial_number: string | null;
  estimated_value_cents: number | null;
  currency: string | null;
  acquired_on: string | null;
  private_notes: string | null;
  last_known_location: string | null;
  last_known_at: string | null;
  status: string;
  public_title: string | null;
  public_message: string | null;
  reward_text: string | null;
  public_photo_id: string | null;
  contact_visibility: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toItem(r: ItemRow): Item {
  return {
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    brand: r.brand,
    model: r.model,
    category: r.category as ItemCategory,
    description: r.description,
    serialNumber: r.serial_number,
    estimatedValueCents: r.estimated_value_cents,
    currency: r.currency,
    acquiredOn: r.acquired_on,
    privateNotes: r.private_notes,
    lastKnownLocation: r.last_known_location,
    lastKnownAt: r.last_known_at,
    status: r.status as ItemStatus,
    publicTitle: r.public_title,
    publicMessage: r.public_message,
    rewardText: r.reward_text,
    publicPhotoId: r.public_photo_id,
    contactVisibility: r.contact_visibility ? (JSON.parse(r.contact_visibility) as ContactVisibility) : null,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Fetch an item that belongs to the owner, or throw 404 (never 403: do not confirm existence). */
export async function getOwnedItemRow(db: D1Database, ownerId: string, id: string): Promise<ItemRow> {
  const row = await db
    .prepare("SELECT * FROM items WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId)
    .first<ItemRow>();
  if (!row) throw notFound("Item");
  return row;
}

export interface ItemListFilter {
  q?: string;
  status?: ItemStatus;
  category?: ItemCategory;
  archived?: boolean;
  parentId?: string;
}

export async function listItemSummaries(
  db: D1Database,
  ownerId: string,
  filter: ItemListFilter,
  fileUrl: (fileId: string) => string,
): Promise<ItemSummary[]> {
  const where = ["i.owner_id = ?"];
  const params: unknown[] = [ownerId];
  where.push(filter.archived ? "i.archived_at IS NOT NULL" : "i.archived_at IS NULL");
  if (filter.status) {
    where.push("i.status = ?");
    params.push(filter.status);
  }
  if (filter.parentId) {
    where.push("i.parent_id = ?");
    params.push(filter.parentId);
  }
  if (filter.category) {
    where.push("i.category = ?");
    params.push(filter.category);
  }
  if (filter.q) {
    const like = `%${filter.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const columns = ["i.name", "i.brand", "i.model", "i.description", "i.serial_number"];
    where.push(`(${columns.map((col) => `${col} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    params.push(...columns.map(() => like));
  }
  const { results } = await db
    .prepare(
      `SELECT i.id, i.name, i.brand, i.model, i.category, i.status, i.parent_id, i.archived_at, i.updated_at,
              COALESCE(i.public_photo_id,
                (SELECT f.id FROM item_files f WHERE f.item_id = i.id AND f.kind = 'photo' ORDER BY f.created_at LIMIT 1)
              ) AS cover_id,
              (SELECT COUNT(*) FROM tags t WHERE t.item_id = i.id AND t.status = 'active') AS tag_count,
              (SELECT COUNT(*) FROM conversations c WHERE c.item_id = i.id AND c.status = 'open') AS open_conv
         FROM items i
        WHERE ${where.join(" AND ")}
        ORDER BY (i.status = 'lost') DESC, i.updated_at DESC
        LIMIT 500`,
    )
    .bind(...params)
    .all<{
      id: string;
      name: string;
      brand: string | null;
      model: string | null;
      category: string;
      status: string;
      parent_id: string | null;
      archived_at: string | null;
      updated_at: string;
      cover_id: string | null;
      tag_count: number;
      open_conv: number;
    }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    model: r.model,
    category: r.category as ItemCategory,
    status: r.status as ItemStatus,
    parentId: r.parent_id,
    archivedAt: r.archived_at,
    coverPhotoUrl: r.cover_id ? fileUrl(r.cover_id) : null,
    tagCount: r.tag_count,
    openConversationCount: r.open_conv,
    updatedAt: r.updated_at,
  }));
}

async function assertValidParent(db: D1Database, ownerId: string, itemId: string | null, parentId: string) {
  if (parentId === itemId) throw new AppError(422, "invalid_parent", "An item cannot contain itself");
  // Walk up the parent chain to reject cycles (chains are short: bag > pouch > cable).
  let cursor: string | null = parentId;
  for (let depth = 0; cursor; depth++) {
    if (depth > 20) throw new AppError(422, "invalid_parent", "Nesting is too deep");
    const row: { parent_id: string | null } | null = await db
      .prepare("SELECT parent_id FROM items WHERE id = ? AND owner_id = ?")
      .bind(cursor, ownerId)
      .first<{ parent_id: string | null }>();
    if (!row) throw new AppError(422, "invalid_parent", "Parent item not found");
    if (row.parent_id === itemId && itemId)
      throw new AppError(422, "invalid_parent", "That would create a loop");
    cursor = row.parent_id;
  }
}

export async function createItem(db: D1Database, ownerId: string, raw: ItemInput): Promise<Item> {
  const input = itemInputSchema.parse(raw);
  if (input.parentId) await assertValidParent(db, ownerId, null, input.parentId);
  const id = newId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO items (id, owner_id, parent_id, name, brand, model, category, description, serial_number,
         estimated_value_cents, currency, acquired_on, private_notes, last_known_location, last_known_at,
         public_title, public_message, reward_text, contact_visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ownerId,
      input.parentId ?? null,
      input.name,
      input.brand ?? null,
      input.model ?? null,
      input.category,
      input.description ?? null,
      input.serialNumber ?? null,
      input.estimatedValueCents ?? null,
      input.currency ?? null,
      input.acquiredOn ?? null,
      input.privateNotes ?? null,
      input.lastKnownLocation ?? null,
      input.lastKnownLocation ? now : null,
      input.publicTitle ?? null,
      input.publicMessage ?? null,
      input.rewardText ?? null,
      input.contactVisibility ? JSON.stringify(input.contactVisibility) : null,
      now,
      now,
    )
    .run();
  return toItem(await getOwnedItemRow(db, ownerId, id));
}

const PATCH_COLUMNS: Record<keyof ItemPatch, string> = {
  name: "name",
  brand: "brand",
  model: "model",
  category: "category",
  description: "description",
  serialNumber: "serial_number",
  estimatedValueCents: "estimated_value_cents",
  currency: "currency",
  acquiredOn: "acquired_on",
  privateNotes: "private_notes",
  lastKnownLocation: "last_known_location",
  parentId: "parent_id",
  publicTitle: "public_title",
  publicMessage: "public_message",
  rewardText: "reward_text",
  contactVisibility: "contact_visibility",
};

export async function updateItem(db: D1Database, ownerId: string, id: string, raw: ItemPatch): Promise<Item> {
  const current = await getOwnedItemRow(db, ownerId, id);
  const patch = itemPatchSchema.parse(raw);
  if (patch.parentId) await assertValidParent(db, ownerId, id, patch.parentId);

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof ItemPatch, string][]) {
    if (!(key in patch)) continue;
    const value = patch[key];
    sets.push(`${column} = ?`);
    if (key === "contactVisibility") params.push(value ? JSON.stringify(value) : null);
    else params.push(value ?? null);
  }
  if ("lastKnownLocation" in patch && patch.lastKnownLocation !== current.last_known_location) {
    sets.push("last_known_at = ?");
    params.push(patch.lastKnownLocation ? nowIso() : null);
  }
  if (sets.length === 0) return toItem(current);
  sets.push("updated_at = ?");
  params.push(nowIso());
  await db
    .prepare(`UPDATE items SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`)
    .bind(...params, id, ownerId)
    .run();
  return toItem(await getOwnedItemRow(db, ownerId, id));
}

export async function setArchived(
  db: D1Database,
  ownerId: string,
  id: string,
  archived: boolean,
): Promise<Item> {
  await getOwnedItemRow(db, ownerId, id);
  const now = nowIso();
  await db
    .prepare("UPDATE items SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(archived ? now : null, now, id, ownerId)
    .run();
  return toItem(await getOwnedItemRow(db, ownerId, id));
}
