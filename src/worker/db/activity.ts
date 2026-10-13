import type { ActivityEvent } from "../../shared/schemas";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

export type ActivityType =
  | "item.created"
  | "item.updated"
  | "item.archived"
  | "item.unarchived"
  | "item.deleted"
  | "item.lost"
  | "item.recovered"
  | "recovery.updated"
  | "tag.created"
  | "tag.revoked"
  | "tag.replaced"
  | "tag.scanned"
  | "conversation.created"
  | "conversation.closed"
  | "conversation.blocked"
  | "conversation.deleted"
  | "location.shared"
  | "proposal.created"
  | "proposal.updated"
  | "settings.updated"
  | "data.exported"
  | "data.imported"
  | "backup.created"
  | "notification.failed";

export interface ActivityInput {
  ownerId: string;
  type: ActivityType;
  itemId?: string | null;
  tagId?: string | null;
  conversationId?: string | null;
  country?: string | null;
  data?: Record<string, unknown> | null;
}

export function activityStatement(db: D1Database, e: ActivityInput): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO activity_events (id, owner_id, type, item_id, tag_id, conversation_id, country, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      e.ownerId,
      e.type,
      e.itemId ?? null,
      e.tagId ?? null,
      e.conversationId ?? null,
      e.country ?? null,
      e.data ? JSON.stringify(e.data) : null,
      nowIso(),
    );
}

export async function recordActivity(db: D1Database, e: ActivityInput): Promise<void> {
  await activityStatement(db, e).run();
}

interface ActivityRow {
  id: string;
  type: string;
  item_id: string | null;
  tag_id: string | null;
  conversation_id: string | null;
  country: string | null;
  data: string | null;
  created_at: string;
}

function parseEventData(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function toActivityEvent(r: ActivityRow): ActivityEvent {
  return {
    id: r.id,
    type: r.type,
    itemId: r.item_id,
    tagId: r.tag_id,
    conversationId: r.conversation_id,
    country: r.country,
    data: parseEventData(r.data),
    createdAt: r.created_at,
  };
}

function encodeCursor(createdAt: string, id: string): string {
  return btoa(`${createdAt}|${id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Opaque cursors are `(created_at, id)` pairs; returns null for anything malformed. */
export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const [createdAt, ...rest] = atob(padded).split("|");
    const id = rest.join("|");
    if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Newest first, ordered by (created_at, id). `before` is an opaque cursor taken from the previous
 * page's `nextBefore`; events that share a timestamp are never skipped or repeated.
 */
export async function listActivity(
  db: D1Database,
  ownerId: string,
  opts: { limit: number; before?: { createdAt: string; id: string } },
): Promise<{ events: ActivityEvent[]; nextBefore: string | null }> {
  const where = ["owner_id = ?"];
  const params: unknown[] = [ownerId];
  if (opts.before) {
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    params.push(opts.before.createdAt, opts.before.createdAt, opts.before.id);
  }
  // One extra row tells us whether another page exists.
  const { results } = await db
    .prepare(
      `SELECT * FROM activity_events WHERE ${where.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...params, opts.limit + 1)
    .all<ActivityRow>();
  const page = results.slice(0, opts.limit);
  const last = page[page.length - 1];
  return {
    events: page.map(toActivityEvent),
    nextBefore: results.length > opts.limit && last ? encodeCursor(last.created_at, last.id) : null,
  };
}
