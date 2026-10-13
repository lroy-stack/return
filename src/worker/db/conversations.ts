import type { ConversationStatus, ConversationSummary } from "../../shared/schemas";

export interface ConversationSummaryRow {
  id: string;
  item_id: string | null;
  item_name: string | null;
  tag_label: string | null;
  subject: string;
  finder_name: string | null;
  status: string;
  owner_read_at: string | null;
  last_message_at: string;
  last_preview: string | null;
  last_sender: string | null;
  created_at: string;
}

export const CONVERSATION_SUMMARY_SELECT = `
  SELECT c.id, c.item_id, i.name AS item_name, t.label AS tag_label, c.subject, c.finder_name, c.status,
         c.owner_read_at, c.last_message_at, c.created_at,
         (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_preview,
         (SELECT m.sender FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_sender
    FROM conversations c
    LEFT JOIN items i ON i.id = c.item_id
    LEFT JOIN tags t ON t.id = c.tag_id`;

export function toConversationSummary(r: ConversationSummaryRow): ConversationSummary {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name,
    tagLabel: r.tag_label,
    subject: r.subject,
    finderName: r.finder_name,
    status: r.status as ConversationStatus,
    // Unread for the owner: the finder wrote after the owner last opened the thread.
    unread: r.last_sender === "finder" && (!r.owner_read_at || r.owner_read_at < r.last_message_at),
    lastMessageAt: r.last_message_at,
    lastMessagePreview: r.last_preview ? r.last_preview.slice(0, 160) : null,
    createdAt: r.created_at,
  };
}

export async function listConversationSummaries(
  db: D1Database,
  ownerId: string,
  filter: { itemId?: string; status?: ConversationStatus } = {},
): Promise<ConversationSummary[]> {
  const where = ["c.owner_id = ?"];
  const params: unknown[] = [ownerId];
  if (filter.itemId) {
    where.push("c.item_id = ?");
    params.push(filter.itemId);
  }
  if (filter.status) {
    where.push("c.status = ?");
    params.push(filter.status);
  }
  const { results } = await db
    .prepare(
      `${CONVERSATION_SUMMARY_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.last_message_at DESC LIMIT 200`,
    )
    .bind(...params)
    .all<ConversationSummaryRow>();
  return results.map(toConversationSummary);
}
