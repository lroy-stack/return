/**
 * Conversation rules shared by the finder pages and the owner API. Every function takes a
 * conversation row that the caller already authorised (by capability token or by owner id),
 * so the rules live in one place and neither surface can bypass them.
 */
import type { z } from "zod";
import type {
  ConversationDetail,
  Message,
  Party,
  Proposal,
  proposalInputSchema,
  SharedLocation,
} from "../../shared/schemas";
import type { Language } from "../../shared/settings";
import { activityStatement } from "../db/activity";
import {
  type ConversationRow,
  loadConversationDetail,
  type ProposalRow,
  toMessage,
  toProposal,
  toSharedLocation,
} from "../db/conversations";
import { activeRecovery } from "../db/recoveries";
import { AppError, notFound } from "../lib/http";
import { newId, newSecretToken, sha256Hex } from "../lib/ids";
import { nowIso } from "../lib/time";

export type LocationData = {
  source: "gps" | "manual";
  label?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
};
export type ProposalData = z.output<typeof proposalInputSchema>;
export type ProposalAction = "accept" | "decline" | "cancel";

export const conversationClosed = () =>
  new AppError(409, "conversation_closed", "This conversation is closed");

function assertOpen(conv: ConversationRow): void {
  if (conv.status !== "open") throw conversationClosed();
}

const DAY_MS = 86_400_000;
/** Per-conversation daily ceilings for the finder side (the owner is never capped). */
export const FINDER_DAILY_CAPS = { messages: 50, proposals: 20, locations: 10 } as const;
/** New conversations: per client and per tag (distinct sources), per rolling day. */
export const MAX_NEW_PER_CLIENT_PER_DAY = 3;
export const MAX_SOURCES_PER_TAG_PER_DAY = 5;

export const capReached = () =>
  new AppError(429, "conversation_cap", "Daily limit for this conversation reached");

type CappedTable =
  | { table: "messages"; actor: "sender"; max: number }
  | {
      table: "shared_locations";
      actor: "shared_by";
      max: number;
    }
  | { table: "proposals"; actor: "proposed_by"; max: number };

const MESSAGES_CAP: CappedTable = { table: "messages", actor: "sender", max: FINDER_DAILY_CAPS.messages };
const LOCATIONS_CAP: CappedTable = {
  table: "shared_locations",
  actor: "shared_by",
  max: FINDER_DAILY_CAPS.locations,
};
const PROPOSALS_CAP: CappedTable = {
  table: "proposals",
  actor: "proposed_by",
  max: FINDER_DAILY_CAPS.proposals,
};

/** SQL predicate (and its binds) that is true for the owner and, for the finder, while under the daily cap. */
function underCap(cap: CappedTable, conversationId: string, by: Party): { sql: string; binds: unknown[] } {
  return {
    sql: `(? = 'owner' OR (SELECT COUNT(*) FROM ${cap.table} WHERE conversation_id = ? AND ${cap.actor} = 'finder' AND created_at > ?) < ?)`,
    binds: [by, conversationId, new Date(Date.now() - DAY_MS).toISOString(), cap.max],
  };
}

function locationInsert(
  db: D1Database,
  conversationId: string,
  sharedBy: Party,
  loc: LocationData,
  now: string,
  capped: boolean,
): { id: string; statement: D1PreparedStatement } {
  const id = newId();
  const cap = underCap(LOCATIONS_CAP, conversationId, sharedBy);
  const statement = db
    .prepare(
      `INSERT INTO shared_locations (id, conversation_id, shared_by, source, label, lat, lng, accuracy_m, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${capped ? cap.sql : "1"}`,
    )
    .bind(
      id,
      conversationId,
      sharedBy,
      loc.source,
      loc.label || null,
      loc.lat ?? null,
      loc.lng ?? null,
      loc.accuracyM ?? null,
      now,
      ...(capped ? cap.binds : []),
    );
  return { id, statement };
}

/** Bumps the activity clock (polled by the finder page) and stamps the actor's read marker, once `rowId` exists. */
function touch(
  db: D1Database,
  conv: ConversationRow,
  actor: Party,
  now: string,
  gate: { table: CappedTable["table"]; id: string },
): D1PreparedStatement {
  const column = actor === "finder" ? "finder_read_at" : "owner_read_at";
  return db
    .prepare(
      `UPDATE conversations SET last_message_at = ?, ${column} = ? WHERE id = ? AND EXISTS (SELECT 1 FROM ${gate.table} WHERE id = ?)`,
    )
    .bind(now, now, conv.id, gate.id);
}

export interface NewConversation {
  ownerId: string;
  tagId: string;
  itemId: string;
  subject: string;
  message: string;
  name: string | null;
  email: string | null;
  lang: Language;
  ipHmac: string | null;
  location: LocationData | null;
}

/**
 * Opens a conversation from a tag scan: conversation, first message, optional shared location
 * and activity events in one batch. If the item has an open recovery that is still "lost", it
 * moves to "found". Returns the raw finder token: it is shown once and only its hash is kept.
 */
export async function createConversation(
  db: D1Database,
  input: NewConversation,
): Promise<{ id: string; token: string }> {
  const token = newSecretToken();
  const tokenHash = await sha256Hex(token);
  const id = newId();
  const now = nowIso();
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const recovery = await activeRecovery(db, input.ownerId, input.itemId);

  // One conditional statement enforces both caps atomically: a client opens at most 3
  // conversations a day, and a tag hears from at most 5 distinct sources a day (a source that
  // already contacted this tag does not count twice, so one source cannot lock out the others).
  const created = await db
    .prepare(
      `INSERT INTO conversations (id, owner_id, item_id, tag_id, recovery_id, finder_token_hash, finder_name,
         finder_email, finder_lang, finder_ip_hmac, subject, status, finder_read_at, last_message_at, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?
        WHERE (? IS NULL OR (SELECT COUNT(*) FROM conversations WHERE finder_ip_hmac = ? AND created_at > ?) < ?)
          AND (? IS NULL OR (
                (SELECT COUNT(DISTINCT finder_ip_hmac) FROM conversations WHERE tag_id = ? AND created_at > ?)
                + (CASE WHEN EXISTS (SELECT 1 FROM conversations WHERE tag_id = ? AND finder_ip_hmac = ? AND created_at > ?)
                        THEN 0 ELSE 1 END)) <= ?)`,
    )
    .bind(
      id,
      input.ownerId,
      input.itemId,
      input.tagId,
      recovery?.id ?? null,
      tokenHash,
      input.name,
      input.email,
      input.lang,
      input.ipHmac,
      input.subject,
      now,
      now,
      now,
      input.ipHmac,
      input.ipHmac,
      since,
      MAX_NEW_PER_CLIENT_PER_DAY,
      input.ipHmac,
      input.tagId,
      since,
      input.tagId,
      input.ipHmac,
      since,
      MAX_SOURCES_PER_TAG_PER_DAY,
    )
    .run();
  if (!created.meta.changes) throw new AppError(429, "rate_limited", "Too many requests");

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES (?, ?, 'finder', ?, ?)",
      )
      .bind(newId(), id, input.message, now),
  ];
  if (input.location) statements.push(locationInsert(db, id, "finder", input.location, now, false).statement);
  statements.push(
    activityStatement(db, {
      ownerId: input.ownerId,
      type: "conversation.created",
      itemId: input.itemId,
      tagId: input.tagId,
      conversationId: id,
    }),
  );
  if (input.location) {
    statements.push(
      activityStatement(db, {
        ownerId: input.ownerId,
        type: "location.shared",
        itemId: input.itemId,
        tagId: input.tagId,
        conversationId: id,
        data: { by: "finder" },
      }),
    );
  }
  try {
    await db.batch(statements);
  } catch (err) {
    // Never leave an empty conversation behind if the first message could not be stored.
    await db.prepare("DELETE FROM conversations WHERE id = ?").bind(id).run();
    throw err;
  }
  return { id, token };
}

export async function addMessage(
  db: D1Database,
  conv: ConversationRow,
  sender: Party,
  body: string,
): Promise<Message> {
  assertOpen(conv);
  const now = nowIso();
  const id = newId();
  const cap = underCap(MESSAGES_CAP, conv.id, sender);
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO messages (id, conversation_id, sender, body, created_at) SELECT ?, ?, ?, ?, ? WHERE ${cap.sql}`,
      )
      .bind(id, conv.id, sender, body, now, ...cap.binds),
    touch(db, conv, sender, now, { table: "messages", id }),
  ]);
  if (!inserted?.meta.changes) throw capReached();
  return toMessage({ id, sender, body, created_at: now });
}

export async function shareLocation(
  db: D1Database,
  conv: ConversationRow,
  sharedBy: Party,
  loc: LocationData,
): Promise<SharedLocation> {
  assertOpen(conv);
  const now = nowIso();
  const { id, statement } = locationInsert(db, conv.id, sharedBy, loc, now, true);
  const [inserted] = await db.batch([
    statement,
    touch(db, conv, sharedBy, now, { table: "shared_locations", id }),
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "location.shared",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
      data: { by: sharedBy },
    }),
  ]);
  if (!inserted?.meta.changes) throw capReached();
  return toSharedLocation({
    id,
    shared_by: sharedBy,
    source: loc.source,
    label: loc.label || null,
    lat: loc.lat ?? null,
    lng: loc.lng ?? null,
    accuracy_m: loc.accuracyM ?? null,
    created_at: now,
  });
}

export async function createProposal(
  db: D1Database,
  conv: ConversationRow,
  by: Party,
  input: ProposalData,
): Promise<Proposal> {
  assertOpen(conv);
  const now = nowIso();
  const row: ProposalRow = {
    id: newId(),
    conversation_id: conv.id,
    proposed_by: by,
    kind: input.kind,
    place: input.place,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    meet_at: input.meetAt ?? null,
    instructions: input.instructions || null,
    status: "proposed",
    responded_at: null,
    created_at: now,
  };
  const cap = underCap(PROPOSALS_CAP, conv.id, by);
  const [inserted] = await db.batch([
    db
      .prepare(
        `INSERT INTO proposals (id, conversation_id, proposed_by, kind, place, lat, lng, meet_at, instructions, status, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ? WHERE ${cap.sql}`,
      )
      .bind(
        row.id,
        conv.id,
        by,
        row.kind,
        row.place,
        row.lat,
        row.lng,
        row.meet_at,
        row.instructions,
        now,
        ...cap.binds,
      ),
    touch(db, conv, by, now, { table: "proposals", id: row.id }),
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "proposal.created",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
      data: { by, kind: row.kind },
    }),
  ]);
  if (!inserted?.meta.changes) throw capReached();
  return toProposal(row);
}

const NEXT_STATUS = { accept: "accepted", decline: "declined", cancel: "cancelled" } as const;

/**
 * Only a pending proposal can change. The other party accepts or declines; only the proposer
 * cancels. Accepting supersedes an earlier accepted proposal and moves the recovery (if any)
 * to "returning". The status change runs first and everything after it is gated on it having
 * happened, so two concurrent accepts cannot leave the conversation with nothing accepted.
 */
export async function respondToProposal(
  db: D1Database,
  conv: ConversationRow,
  actor: Party,
  proposalId: string,
  action: ProposalAction,
): Promise<Proposal> {
  const row = await db
    .prepare("SELECT * FROM proposals WHERE id = ? AND conversation_id = ?")
    .bind(proposalId, conv.id)
    .first<ProposalRow>();
  if (!row) throw notFound("Proposal");
  assertOpen(conv);
  if (row.status !== "proposed") throw proposalNotPending();
  const isProposer = row.proposed_by === actor;
  if (action === "cancel" ? !isProposer : isProposer) {
    throw new AppError(403, "not_allowed", "This action is not available to you");
  }

  const now = nowIso();
  const status = NEXT_STATUS[action];
  const statements: D1PreparedStatement[] = [
    db
      .prepare("UPDATE proposals SET status = ?, responded_at = ? WHERE id = ? AND status = 'proposed'")
      .bind(status, now, row.id),
  ];
  if (action === "accept") {
    const accepted =
      "EXISTS (SELECT 1 FROM proposals WHERE id = ? AND status = 'accepted' AND responded_at = ?)";
    statements.push(
      db
        .prepare(
          `UPDATE proposals SET status = 'superseded', responded_at = ?
            WHERE conversation_id = ? AND status = 'accepted' AND id <> ? AND ${accepted}`,
        )
        .bind(now, conv.id, row.id, row.id, now),
    );
    if (conv.recovery_id) {
      statements.push(
        db
          .prepare(
            `UPDATE recoveries SET status = 'returning', updated_at = ?
              WHERE id = ? AND status IN ('lost', 'found') AND ${accepted}`,
          )
          .bind(now, conv.recovery_id, row.id, now),
      );
    }
  }
  statements.push(
    touch(db, conv, actor, now, { table: "proposals", id: row.id }),
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "proposal.updated",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
      data: { by: actor, action },
    }),
  );
  const [changed] = await db.batch(statements);
  if (!changed?.meta.changes) throw proposalNotPending();
  return toProposal({ ...row, status, responded_at: now });
}

const proposalNotPending = () =>
  new AppError(409, "proposal_not_pending", "This proposal has already been answered");

export async function closeConversation(db: D1Database, conv: ConversationRow): Promise<void> {
  if (conv.status !== "open") return;
  const now = nowIso();
  await db.batch([
    db
      .prepare("UPDATE conversations SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'")
      .bind(now, conv.id),
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "conversation.closed",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
    }),
  ]);
}

export async function reopenConversation(db: D1Database, conv: ConversationRow): Promise<void> {
  if (conv.status === "open") return;
  if (conv.status === "blocked") {
    throw new AppError(409, "conversation_blocked", "A blocked conversation cannot be reopened");
  }
  await db
    .prepare("UPDATE conversations SET status = 'open', closed_at = NULL WHERE id = ? AND status = 'closed'")
    .bind(conv.id)
    .run();
}

/** Blocks the conversation and the finder's (hashed) IP for this owner. */
export async function blockConversation(
  db: D1Database,
  conv: ConversationRow,
  reason: string | null,
): Promise<void> {
  const now = nowIso();
  const statements: D1PreparedStatement[] = [
    db
      .prepare("UPDATE conversations SET status = 'blocked', closed_at = COALESCE(closed_at, ?) WHERE id = ?")
      .bind(now, conv.id),
  ];
  if (conv.finder_ip_hmac) {
    statements.push(
      db
        .prepare(
          "INSERT INTO blocks (id, owner_id, ip_hmac, reason, expires_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)",
        )
        .bind(newId(), conv.owner_id, conv.finder_ip_hmac, reason, now),
    );
  }
  statements.push(
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "conversation.blocked",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
    }),
  );
  await db.batch(statements);
}

/** Hard delete; messages, locations and proposals go with it (ON DELETE CASCADE). */
export async function deleteConversation(db: D1Database, conv: ConversationRow): Promise<void> {
  await db.batch([
    // The notification log outlives the conversation; do not keep finder addresses in it.
    db.prepare("UPDATE notifications SET recipient = '[deleted]' WHERE conversation_id = ?").bind(conv.id),
    db.prepare("DELETE FROM conversations WHERE id = ? AND owner_id = ?").bind(conv.id, conv.owner_id),
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "conversation.deleted",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
    }),
  ]);
}

export async function markRead(db: D1Database, conv: ConversationRow, actor: Party): Promise<void> {
  const column = actor === "finder" ? "finder_read_at" : "owner_read_at";
  await db.prepare(`UPDATE conversations SET ${column} = ? WHERE id = ?`).bind(nowIso(), conv.id).run();
}

export function getConversationDetail(
  db: D1Database,
  conv: Pick<ConversationRow, "id" | "owner_id">,
): Promise<ConversationDetail> {
  return loadConversationDetail(db, conv.owner_id, conv.id);
}
