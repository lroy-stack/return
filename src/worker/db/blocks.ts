import type { BlockDuration, BlockEntry } from "../../shared/schemas";
import { notFound } from "../lib/http";

const DAY_MS = 86_400_000;
const DURATION_DAYS: Record<Exclude<BlockDuration, "permanent">, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function blockExpiry(duration: BlockDuration, now: Date): string | null {
  return duration === "permanent"
    ? null
    : new Date(now.getTime() + DURATION_DAYS[duration] * DAY_MS).toISOString();
}

interface BlockRow {
  id: string;
  created_at: string;
  reason: string | null;
  expires_at: string | null;
  conversation_id: string | null;
  subject: string | null;
  item_name: string | null;
}

/** Active blocks of the owner, newest first. The finder's address hash is never returned. */
export async function listBlocks(db: D1Database, ownerId: string, now: string): Promise<BlockEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT b.id, b.created_at, b.reason, b.expires_at, c.id AS conversation_id, c.subject, i.name AS item_name
         FROM blocks b
         LEFT JOIN conversations c ON c.id = (
           SELECT id FROM conversations
            WHERE owner_id = b.owner_id AND finder_ip_hmac = b.ip_hmac
            ORDER BY (status = 'blocked') DESC, created_at DESC LIMIT 1)
         LEFT JOIN items i ON i.id = c.item_id
        WHERE b.owner_id = ? AND (b.expires_at IS NULL OR b.expires_at > ?)
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT 200`,
    )
    .bind(ownerId, now)
    .all<BlockRow>();
  return results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    reason: r.reason,
    expiresAt: r.expires_at,
    conversation: r.conversation_id
      ? { id: r.conversation_id, subject: r.subject ?? "", itemName: r.item_name }
      : null,
    orphaned: r.conversation_id === null,
  }));
}

/**
 * Lifts one block. Conversations that were blocked through this address become plain "closed"
 * (they can be reopened), so nothing stays in a "blocked" state that no longer blocks anyone.
 */
export async function removeBlock(db: D1Database, ownerId: string, id: string): Promise<void> {
  const block = await db
    .prepare("SELECT ip_hmac FROM blocks WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId)
    .first<{ ip_hmac: string }>();
  if (!block) throw notFound("Block");
  await db.batch([
    db
      .prepare(
        "UPDATE conversations SET status = 'closed' WHERE owner_id = ? AND finder_ip_hmac = ? AND status = 'blocked'",
      )
      .bind(ownerId, block.ip_hmac),
    db.prepare("DELETE FROM blocks WHERE id = ? AND owner_id = ?").bind(id, ownerId),
  ]);
}

/**
 * Statements that end the blocks whose time is up: the expired rows go away and conversations
 * blocked through an address that no longer has an active block become "closed" — the same
 * state `removeBlock` leaves. Safe to repeat.
 */
export function expireBlocksStatements(
  db: D1Database,
  ownerId: string,
  nowIso: string,
): D1PreparedStatement[] {
  return [
    db
      .prepare("DELETE FROM blocks WHERE owner_id = ? AND expires_at IS NOT NULL AND expires_at < ?")
      .bind(ownerId, nowIso),
    db
      .prepare(
        `UPDATE conversations SET status = 'closed'
          WHERE owner_id = ?1 AND status = 'blocked' AND finder_ip_hmac IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.owner_id = ?1 AND b.ip_hmac = conversations.finder_ip_hmac
                              AND (b.expires_at IS NULL OR b.expires_at >= ?2))`,
      )
      .bind(ownerId, nowIso),
  ];
}
