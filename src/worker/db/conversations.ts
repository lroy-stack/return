import { mapLinks } from "../../shared/maps";
import type {
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  Message,
  Party,
  Proposal,
  ProposalKind,
  ProposalStatus,
  SharedLocation,
} from "../../shared/schemas";
import { notFound } from "../lib/http";

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

export interface ConversationRow {
  id: string;
  owner_id: string;
  item_id: string | null;
  tag_id: string | null;
  recovery_id: string | null;
  finder_token_hash: string;
  finder_name: string | null;
  finder_email: string | null;
  finder_lang: string;
  finder_ip_hmac: string | null;
  subject: string;
  status: string;
  owner_read_at: string | null;
  finder_read_at: string | null;
  last_message_at: string;
  closed_at: string | null;
  created_at: string;
  item_name: string | null;
}

const ROW_SELECT = `SELECT c.*, i.name AS item_name FROM conversations c LEFT JOIN items i ON i.id = c.item_id`;

/** Owner-side lookup: a conversation of someone else is indistinguishable from a missing one. */
export async function getOwnedConversationRow(
  db: D1Database,
  ownerId: string,
  id: string,
): Promise<ConversationRow> {
  const row = await db
    .prepare(`${ROW_SELECT} WHERE c.id = ? AND c.owner_id = ?`)
    .bind(id, ownerId)
    .first<ConversationRow>();
  if (!row) throw notFound("Conversation");
  return row;
}

/** Finder-side lookup by the SHA-256 of the capability token. */
export async function findConversationByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<ConversationRow | null> {
  return db.prepare(`${ROW_SELECT} WHERE c.finder_token_hash = ?`).bind(tokenHash).first<ConversationRow>();
}

interface MessageRow {
  id: string;
  sender: string;
  body: string;
  created_at: string;
}

interface LocationRow {
  id: string;
  shared_by: string;
  source: string;
  label: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  created_at: string;
}

export interface ProposalRow {
  id: string;
  conversation_id: string;
  proposed_by: string;
  kind: string;
  place: string;
  lat: number | null;
  lng: number | null;
  meet_at: string | null;
  instructions: string | null;
  status: string;
  responded_at: string | null;
  created_at: string;
}

export function toMessage(r: MessageRow): Message {
  return { id: r.id, sender: r.sender as Message["sender"], body: r.body, createdAt: r.created_at };
}

export function toSharedLocation(r: LocationRow): SharedLocation {
  return {
    id: r.id,
    sharedBy: r.shared_by as Party,
    source: r.source as SharedLocation["source"],
    label: r.label,
    lat: r.lat,
    lng: r.lng,
    accuracyM: r.accuracy_m,
    createdAt: r.created_at,
    maps: mapLinks({ lat: r.lat, lng: r.lng, label: r.label }),
  };
}

export function toProposal(r: ProposalRow): Proposal {
  return {
    id: r.id,
    proposedBy: r.proposed_by as Party,
    kind: r.kind as ProposalKind,
    place: r.place,
    lat: r.lat,
    lng: r.lng,
    meetAt: r.meet_at,
    instructions: r.instructions,
    status: r.status as ProposalStatus,
    respondedAt: r.responded_at,
    createdAt: r.created_at,
    maps: mapLinks({ lat: r.lat, lng: r.lng, label: r.place }),
  };
}

/** Full thread (messages, shared locations, proposals) of a conversation the caller owns. */
export async function loadConversationDetail(
  db: D1Database,
  ownerId: string,
  id: string,
): Promise<ConversationDetail> {
  const [summary, extra, messages, locations, proposals] = await db.batch([
    db.prepare(`${CONVERSATION_SUMMARY_SELECT} WHERE c.id = ? AND c.owner_id = ?`).bind(id, ownerId),
    db
      .prepare(
        "SELECT finder_email, finder_lang, recovery_id FROM conversations WHERE id = ? AND owner_id = ?",
      )
      .bind(id, ownerId),
    db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid").bind(id),
    db
      .prepare("SELECT * FROM shared_locations WHERE conversation_id = ? ORDER BY created_at, rowid")
      .bind(id),
    db.prepare("SELECT * FROM proposals WHERE conversation_id = ? ORDER BY created_at, rowid").bind(id),
  ]);
  const summaryRow = (summary?.results as ConversationSummaryRow[] | undefined)?.[0];
  const extraRow = (
    extra?.results as
      | { finder_email: string | null; finder_lang: string; recovery_id: string | null }[]
      | undefined
  )?.[0];
  if (!summaryRow || !extraRow) throw notFound("Conversation");
  return {
    conversation: {
      ...toConversationSummary(summaryRow),
      finderEmail: extraRow.finder_email,
      finderLang: extraRow.finder_lang,
      recoveryId: extraRow.recovery_id,
    },
    messages: ((messages?.results ?? []) as MessageRow[]).map(toMessage),
    locations: ((locations?.results ?? []) as LocationRow[]).map(toSharedLocation),
    proposals: ((proposals?.results ?? []) as ProposalRow[]).map(toProposal),
  };
}
