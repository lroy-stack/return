import type { NfcStatus, Tag } from "../../shared/schemas";
import type { Settings } from "../../shared/settings";
import { AppError, notFound } from "../lib/http";
import { newId, newTagToken } from "../lib/ids";
import { nowIso } from "../lib/time";
import { tagUrl } from "../lib/urls";
import { activityStatement, recordActivity } from "./activity";

export interface TagRow {
  id: string;
  owner_id: string;
  item_id: string | null;
  item_name: string | null;
  token: string;
  seq: number;
  label: string;
  status: string;
  nfc_status: string;
  replaced_by: string | null;
  note: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export const TAG_SELECT = "SELECT t.*, i.name AS item_name FROM tags t LEFT JOIN items i ON i.id = t.item_id";

export function toTag(r: TagRow, origin: string): Tag {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name,
    token: r.token,
    seq: r.seq,
    label: r.label,
    status: r.status as Tag["status"],
    nfcStatus: r.nfc_status as NfcStatus,
    replacedBy: r.replaced_by,
    note: r.note,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
    url: tagUrl(origin, r.token),
  };
}

export async function listTags(
  db: D1Database,
  ownerId: string,
  origin: string,
  filter: { itemId?: string; status?: Tag["status"] } = {},
): Promise<Tag[]> {
  const where = ["t.owner_id = ?"];
  const params: unknown[] = [ownerId];
  if (filter.itemId) {
    where.push("t.item_id = ?");
    params.push(filter.itemId);
  }
  if (filter.status) {
    where.push("t.status = ?");
    params.push(filter.status);
  }
  const { results } = await db
    .prepare(`${TAG_SELECT} WHERE ${where.join(" AND ")} ORDER BY t.status = 'revoked', t.seq`)
    .bind(...params)
    .all<TagRow>();
  return results.map((r) => toTag(r, origin));
}

/** Fetch a tag that belongs to the owner, or throw 404. */
export async function getOwnedTagRow(db: D1Database, ownerId: string, id: string): Promise<TagRow> {
  const row = await db
    .prepare(`${TAG_SELECT} WHERE t.id = ? AND t.owner_id = ?`)
    .bind(id, ownerId)
    .first<TagRow>();
  if (!row) throw notFound("Tag");
  return row;
}

export function tagLabel(settings: Settings, seq: number): string {
  return `${settings.tags.labelPrefix}${String(seq).padStart(settings.tags.labelDigits, "0")}`;
}

async function nextSeq(db: D1Database, ownerId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM tags WHERE owner_id = ?")
    .bind(ownerId)
    .first<{ max_seq: number }>();
  return (row?.max_seq ?? 0) + 1;
}

function isUniqueViolation(err: unknown): boolean {
  return String(err).includes("UNIQUE constraint failed");
}

const SEQ_CONFLICT = () =>
  new AppError(409, "conflict", "Another tag was created at the same time; please try again");

/**
 * Create `count` tags with consecutive sequence numbers: one multi-row INSERT (rows travel as a
 * JSON array, so the bound-parameter count stays at two) and one aggregated activity event.
 */
export async function createTags(
  db: D1Database,
  ownerId: string,
  settings: Settings,
  input: { itemId: string | null; note: string | null; count: number },
): Promise<string[]> {
  const first = await nextSeq(db, ownerId);
  const now = nowIso();
  const rows = Array.from({ length: input.count }, (_, i) => ({
    id: newId(),
    token: newTagToken(),
    seq: first + i,
    label: tagLabel(settings, first + i),
  }));
  const insert = db
    .prepare(
      `INSERT INTO tags (id, owner_id, item_id, token, seq, label, note, created_at)
       SELECT json_extract(value, '$.id'), ?1, ?2, json_extract(value, '$.token'),
              json_extract(value, '$.seq'), json_extract(value, '$.label'), ?3, ?4
         FROM json_each(?5)`,
    )
    .bind(ownerId, input.itemId, input.note, now, JSON.stringify(rows));
  const [firstRow] = rows;
  const lastRow = rows[rows.length - 1];
  try {
    await db.batch([
      insert,
      activityStatement(db, {
        ownerId,
        type: "tag.created",
        itemId: input.itemId,
        tagId: rows.length === 1 ? (firstRow?.id ?? null) : null,
        data: {
          count: rows.length,
          firstLabel: firstRow?.label ?? null,
          lastLabel: lastRow?.label ?? null,
          tagIds: rows.map((r) => r.id),
        },
      }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) throw SEQ_CONFLICT();
    throw err;
  }
  return rows.map((r) => r.id);
}

/**
 * Revoke `old` and create a fresh tag (new token) for the same item. Old tokens are never reused.
 * Both writes are guarded on the old tag still being active and unreplaced, so two concurrent
 * replaces cannot both succeed.
 */
export async function replaceTag(
  db: D1Database,
  ownerId: string,
  settings: Settings,
  old: TagRow,
): Promise<string> {
  const seq = await nextSeq(db, ownerId);
  const id = newId();
  const now = nowIso();
  const label = tagLabel(settings, seq);
  let results: D1Result[];
  try {
    results = await db.batch([
      db
        .prepare(
          `INSERT INTO tags (id, owner_id, item_id, token, seq, label, note, created_at)
           SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8 WHERE EXISTS (
             SELECT 1 FROM tags WHERE id = ?9 AND owner_id = ?2 AND status = 'active' AND replaced_by IS NULL)`,
        )
        .bind(id, ownerId, old.item_id, newTagToken(), seq, label, old.note, now, old.id),
      db
        .prepare(
          `UPDATE tags SET status = 'revoked', revoked_at = ?, replaced_by = ?
            WHERE id = ? AND owner_id = ? AND status = 'active' AND replaced_by IS NULL`,
        )
        .bind(now, id, old.id, ownerId),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) throw SEQ_CONFLICT();
    throw err;
  }
  if ((results[1]?.meta.changes ?? 0) === 0) {
    // The guard failed, so the INSERT matched nothing either: no cleanup needed.
    throw new AppError(409, "already_replaced", "This tag was already replaced or revoked");
  }
  await recordActivity(db, {
    ownerId,
    type: "tag.replaced",
    tagId: old.id,
    itemId: old.item_id,
    data: { oldLabel: old.label, newLabel: label, replacedBy: id },
  });
  return id;
}
