/**
 * Read model for the finder pages. These queries deliberately select only the columns that
 * may appear on a public page (plus the ids and the item name needed for owner notifications),
 * so a rendering bug cannot leak serial numbers, notes, values or documents.
 */
import { type ContactVisibility, contactVisibilitySchema } from "../../shared/settings";

export interface PublicTag {
  tagId: string;
  ownerId: string;
  itemId: string;
  /** Private item name: used for owner notifications only, never rendered to finders. */
  itemName: string;
  category: string;
  itemStatus: "normal" | "lost";
  publicTitle: string | null;
  publicMessage: string | null;
  rewardText: string | null;
  publicPhotoId: string | null;
  contactVisibility: ContactVisibility | null;
}

interface PublicTagRow {
  tag_id: string;
  owner_id: string;
  item_id: string;
  item_name: string;
  category: string;
  status: string;
  public_title: string | null;
  public_message: string | null;
  reward_text: string | null;
  public_photo_id: string | null;
  contact_visibility: string | null;
}

function parseVisibility(raw: string | null): ContactVisibility | null {
  if (!raw) return null;
  try {
    const parsed = contactVisibilitySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** An active tag assigned to a non-archived item, or null (unknown, revoked, unassigned, archived). */
export async function findActiveTag(db: D1Database, token: string): Promise<PublicTag | null> {
  const row = await db
    .prepare(
      `SELECT t.id AS tag_id, t.owner_id, i.id AS item_id, i.name AS item_name, i.category, i.status,
              i.public_title, i.public_message, i.reward_text, i.public_photo_id, i.contact_visibility
         FROM tags t JOIN items i ON i.id = t.item_id
        WHERE t.token = ? AND t.status = 'active' AND i.archived_at IS NULL`,
    )
    .bind(token)
    .first<PublicTagRow>();
  if (!row) return null;
  return {
    tagId: row.tag_id,
    ownerId: row.owner_id,
    itemId: row.item_id,
    itemName: row.item_name,
    category: row.category,
    itemStatus: row.status === "lost" ? "lost" : "normal",
    publicTitle: row.public_title,
    publicMessage: row.public_message,
    rewardText: row.reward_text,
    publicPhotoId: row.public_photo_id,
    contactVisibility: parseVisibility(row.contact_visibility),
  };
}

export interface PublicTrustedContact {
  name: string;
  email: string | null;
  phone: string | null;
}

export async function listPublicTrustedContacts(
  db: D1Database,
  ownerId: string,
): Promise<PublicTrustedContact[]> {
  const { results } = await db
    .prepare(
      "SELECT name, email, phone FROM trusted_contacts WHERE owner_id = ? AND show_public = 1 ORDER BY name",
    )
    .bind(ownerId)
    .all<PublicTrustedContact>();
  return results;
}

export async function findPublicPhoto(
  db: D1Database,
  tag: Pick<PublicTag, "ownerId" | "itemId" | "publicPhotoId">,
): Promise<{ r2Key: string; contentType: string } | null> {
  if (!tag.publicPhotoId) return null;
  const row = await db
    .prepare(
      "SELECT r2_key, content_type FROM item_files WHERE id = ? AND owner_id = ? AND item_id = ? AND kind = 'photo'",
    )
    .bind(tag.publicPhotoId, tag.ownerId, tag.itemId)
    .first<{ r2_key: string; content_type: string }>();
  return row ? { r2Key: row.r2_key, contentType: row.content_type } : null;
}

export async function isIpBlocked(
  db: D1Database,
  ownerId: string,
  ipHmac: string,
  now: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 AS hit FROM blocks WHERE owner_id = ? AND ip_hmac = ? AND (expires_at IS NULL OR expires_at > ?) LIMIT 1",
    )
    .bind(ownerId, ipHmac, now)
    .first<{ hit: number }>();
  return row !== null;
}
