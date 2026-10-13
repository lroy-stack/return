import type { NfcStatus, Tag } from "../../shared/schemas";
import { tagUrl } from "../lib/urls";

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
  filter: { itemId?: string } = {},
): Promise<Tag[]> {
  const where = ["t.owner_id = ?"];
  const params: unknown[] = [ownerId];
  if (filter.itemId) {
    where.push("t.item_id = ?");
    params.push(filter.itemId);
  }
  const { results } = await db
    .prepare(`${TAG_SELECT} WHERE ${where.join(" AND ")} ORDER BY t.status = 'revoked', t.seq`)
    .bind(...params)
    .all<TagRow>();
  return results.map((r) => toTag(r, origin));
}
