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
