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

function locationInsert(
  db: D1Database,
  conversationId: string,
  sharedBy: Party,
  loc: LocationData,
  now: string,
): { id: string; statement: D1PreparedStatement } {
  const id = newId();
  const statement = db
    .prepare(
      `INSERT INTO shared_locations (id, conversation_id, shared_by, source, label, lat, lng, accuracy_m, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
  return { id, statement };
}

/** Bumps the activity clock (polled by the finder page) and stamps the actor's read marker. */
function touch(db: D1Database, conv: ConversationRow, actor: Party, now: string): D1PreparedStatement {
  const column = actor === "finder" ? "finder_read_at" : "owner_read_at";
  return db
    .prepare(`UPDATE conversations SET last_message_at = ?, ${column} = ? WHERE id = ?`)
    .bind(now, now, conv.id);
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
  const recovery = await activeRecovery(db, input.ownerId, input.itemId);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO conversations (id, owner_id, item_id, tag_id, recovery_id, finder_token_hash, finder_name,
           finder_email, finder_lang, finder_ip_hmac, subject, status, finder_read_at, last_message_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
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
      ),
    db
      .prepare(
        "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES (?, ?, 'finder', ?, ?)",
      )
      .bind(newId(), id, input.message, now),
  ];
  if (input.location) statements.push(locationInsert(db, id, "finder", input.location, now).statement);
  if (recovery?.status === "lost") {
    statements.push(
      db
        .prepare("UPDATE recoveries SET status = 'found', updated_at = ? WHERE id = ? AND status = 'lost'")
        .bind(now, recovery.id),
    );
  }
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
  await db.batch(statements);
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
  await db.batch([
    db
      .prepare("INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, conv.id, sender, body, now),
    touch(db, conv, sender, now),
  ]);
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
  const { id, statement } = locationInsert(db, conv.id, sharedBy, loc, now);
  await db.batch([
    statement,
    touch(db, conv, sharedBy, now),
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "location.shared",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
      data: { by: sharedBy },
    }),
  ]);
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
  await db.batch([
    db
      .prepare(
        `INSERT INTO proposals (id, conversation_id, proposed_by, kind, place, lat, lng, meet_at, instructions, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?)`,
      )
      .bind(row.id, conv.id, by, row.kind, row.place, row.lat, row.lng, row.meet_at, row.instructions, now),
    touch(db, conv, by, now),
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "proposal.created",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
      data: { by, kind: row.kind },
    }),
  ]);
  return toProposal(row);
}

const NEXT_STATUS = { accept: "accepted", decline: "declined", cancel: "cancelled" } as const;

/**
 * Only a pending proposal can change. The other party accepts or declines; only the proposer
 * cancels. Accepting supersedes an earlier accepted proposal and moves the recovery (if any)
 * to "returning".
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
  if (row.status !== "proposed") {
    throw new AppError(409, "proposal_not_pending", "This proposal has already been answered");
  }
  const isProposer = row.proposed_by === actor;
  if (action === "cancel" ? !isProposer : isProposer) {
    throw new AppError(403, "not_allowed", "This action is not available to you");
  }

  const now = nowIso();
  const status = NEXT_STATUS[action];
  const statements: D1PreparedStatement[] = [];
  if (action === "accept") {
    statements.push(
      db
        .prepare(
          "UPDATE proposals SET status = 'superseded', responded_at = ? WHERE conversation_id = ? AND status = 'accepted'",
        )
        .bind(now, conv.id),
    );
  }
  statements.push(
    db
      .prepare("UPDATE proposals SET status = ?, responded_at = ? WHERE id = ? AND status = 'proposed'")
      .bind(status, now, row.id),
  );
  if (action === "accept" && conv.recovery_id) {
    statements.push(
      db
        .prepare(
          "UPDATE recoveries SET status = 'returning', updated_at = ? WHERE id = ? AND status IN ('lost', 'found')",
        )
        .bind(now, conv.recovery_id),
    );
  }
  statements.push(
    touch(db, conv, actor, now),
    activityStatement(db, {
      ownerId: conv.owner_id,
      type: "proposal.updated",
      itemId: conv.item_id,
      tagId: conv.tag_id,
      conversationId: conv.id,
      data: { by: actor, action },
    }),
  );
  await db.batch(statements);
  return toProposal({ ...row, status, responded_at: now });
}

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
