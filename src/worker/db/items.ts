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
  last_known_lat: number | null;
  last_known_lng: number | null;
  last_known_accuracy_m: number | null;
  last_known_at: string | null;
  status: string;
  public_title: string | null;
  public_message: string | null;
  reward_text: string | null;
  public_photo_id: string | null;
  contact_visibility: string | null;
  archived_at: string | null;
  search_text: string | null;
  created_at: string;
  updated_at: string;
}

const LETTER_FOLDS: Record<string, string> = { ß: "ss", ø: "o", đ: "d", ł: "l", æ: "ae", œ: "oe" };

/**
 * Accent- and case-insensitive form used for search: NFKD, combining marks removed, lowercase, plus the
 * few letters that do not decompose (ß ø đ ł æ œ). "Écharpe", "echarpe" and "ÉCHARPE" match each other;
 * "München" matches "munchen" but not "muenchen" (transliterations are not folded).
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßøđłæœ]/g, (ch) => LETTER_FOLDS[ch] ?? ch);
}

/** Fields searched by `q`, joined with newlines so a query never matches across two fields. */
function buildSearchText(f: {
  name: string;
  brand: string | null;
  model: string | null;
  description: string | null;
  serial_number: string | null;
}): string {
  return normalizeSearchText(
    [f.name, f.brand, f.model, f.description, f.serial_number].filter(Boolean).join("\n"),
  );
}

const BACKFILL_LIMIT = 200;

/** Rows without `search_text` (created before migration 0004, or restored) get it now: bounded per call. */
async function backfillSearchText(db: D1Database, ownerId: string): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT id, name, brand, model, description, serial_number FROM items
        WHERE owner_id = ? AND search_text IS NULL LIMIT ${BACKFILL_LIMIT}`,
    )
    .bind(ownerId)
    .all<Pick<ItemRow, "id" | "name" | "brand" | "model" | "description" | "serial_number">>();
  if (results.length === 0) return;
  await db.batch(
    results.map((r) =>
      db
        .prepare("UPDATE items SET search_text = ? WHERE id = ? AND owner_id = ? AND search_text IS NULL")
        .bind(buildSearchText(r), r.id, ownerId),
    ),
  );
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
    lastKnownLat: r.last_known_lat,
    lastKnownLng: r.last_known_lng,
    lastKnownAccuracyM: r.last_known_accuracy_m,
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
    await backfillSearchText(db, ownerId);
    where.push("i.search_text LIKE ? ESCAPE '\\'");
    params.push(`%${normalizeSearchText(filter.q).replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
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

/** Latest calendar date that exists anywhere on Earth right now (UTC+14), so a traveller's "today" is never refused. */
function latestAcquiredOn(now = Date.now()): string {
  return new Date(now + 14 * 3_600_000).toISOString().slice(0, 10);
}

function assertAcquiredOnNotFuture(acquiredOn: string | null | undefined) {
  if (acquiredOn && acquiredOn > latestAcquiredOn()) {
    throw new AppError(422, "validation_failed", "Some fields are invalid", [
      { path: ["acquiredOn"], message: "The acquisition date cannot be in the future" },
    ]);
  }
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

/** lat and lng go together; a position needs a description to be shown next to it. */
function assertPositionPair(lat: number | null | undefined, lng: number | null | undefined): void {
  if ((lat == null) !== (lng == null)) {
    throw new AppError(422, "validation_failed", "lastKnownLat and lastKnownLng go together", [
      { code: "custom", path: ["lastKnownLat"], message: "lat and lng go together" },
    ]);
  }
}

export async function createItem(db: D1Database, ownerId: string, raw: ItemInput): Promise<Item> {
  const input = itemInputSchema.parse(raw);
  assertAcquiredOnNotFuture(input.acquiredOn);
  assertPositionPair(input.lastKnownLat, input.lastKnownLng);
  if (input.parentId) await assertValidParent(db, ownerId, null, input.parentId);
  const id = newId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO items (id, owner_id, parent_id, name, brand, model, category, description, serial_number,
         estimated_value_cents, currency, acquired_on, private_notes, last_known_location,
         last_known_lat, last_known_lng, last_known_accuracy_m, last_known_at,
         public_title, public_message, reward_text, contact_visibility, search_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.lastKnownLat ?? null,
      input.lastKnownLng ?? null,
      input.lastKnownLat == null ? null : (input.lastKnownAccuracyM ?? null),
      input.lastKnownLocation ? now : null,
      input.publicTitle ?? null,
      input.publicMessage ?? null,
      input.rewardText ?? null,
      input.contactVisibility ? JSON.stringify(input.contactVisibility) : null,
      buildSearchText({
        name: input.name,
        brand: input.brand ?? null,
        model: input.model ?? null,
        description: input.description ?? null,
        serial_number: input.serialNumber ?? null,
      }),
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
  lastKnownLat: "last_known_lat",
  lastKnownLng: "last_known_lng",
  lastKnownAccuracyM: "last_known_accuracy_m",
  parentId: "parent_id",
  publicTitle: "public_title",
  publicMessage: "public_message",
  rewardText: "reward_text",
  contactVisibility: "contact_visibility",
};

const SEARCH_KEYS: (keyof ItemPatch)[] = ["name", "brand", "model", "description", "serialNumber"];

export async function updateItem(db: D1Database, ownerId: string, id: string, raw: ItemPatch): Promise<Item> {
  const current = await getOwnedItemRow(db, ownerId, id);
  const patch = itemPatchSchema.parse(raw);
  assertAcquiredOnNotFuture(patch.acquiredOn);
  assertPositionPair(patch.lastKnownLat, patch.lastKnownLng);
  // Coordinates belong to the text they were set with: changing the text alone drops them.
  if (
    "lastKnownLocation" in patch &&
    patch.lastKnownLocation !== current.last_known_location &&
    !("lastKnownLat" in patch)
  ) {
    Object.assign(patch, { lastKnownLat: null, lastKnownLng: null, lastKnownAccuracyM: null });
  }
  if ("lastKnownLat" in patch && patch.lastKnownLat == null) patch.lastKnownAccuracyM = null;
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
  if (SEARCH_KEYS.some((key) => key in patch)) {
    sets.push("search_text = ?");
    params.push(
      buildSearchText({
        name: patch.name ?? current.name,
        brand: "brand" in patch ? (patch.brand ?? null) : current.brand,
        model: "model" in patch ? (patch.model ?? null) : current.model,
        description: "description" in patch ? (patch.description ?? null) : current.description,
        serial_number: "serialNumber" in patch ? (patch.serialNumber ?? null) : current.serial_number,
      }),
    );
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
  const row = await getOwnedItemRow(db, ownerId, id);
  if (archived && row.status === "lost") {
    throw new AppError(
      409,
      "item_lost",
      "This item is marked as lost, and archiving it would hide its tag page from anyone who finds it. Mark it as recovered or close the search first",
    );
  }
  const now = nowIso();
  await db
    .prepare("UPDATE items SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(archived ? now : null, now, id, ownerId)
    .run();
  return toItem(await getOwnedItemRow(db, ownerId, id));
}

/** Names compare equal when they only differ in surrounding or repeated whitespace (HTML collapses it). */
export function sameItemName(a: string, b: string): boolean {
  const collapse = (v: string) => v.trim().replace(/\s+/g, " ");
  return collapse(a) === collapse(b);
}
