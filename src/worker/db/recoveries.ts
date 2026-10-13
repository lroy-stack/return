import type { z } from "zod";
import type { Recovery, RecoveryEvent, RecoveryStatus, recoveryPatchSchema } from "../../shared/schemas";
import { AppError, notFound } from "../lib/http";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { activityStatement } from "./activity";
import { getOwnedItemRow } from "./items";

export interface RecoveryRow {
  id: string;
  owner_id: string;
  item_id: string;
  item_name: string;
  status: string;
  lost_at: string | null;
  lost_place: string | null;
  notes: string | null;
  recovered_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Allowed status changes. `closed` is terminal; `recovered` can only be closed. */
export const RECOVERY_TRANSITIONS: Record<RecoveryStatus, readonly RecoveryStatus[]> = {
  lost: ["found", "returning", "recovered", "closed"],
  found: ["returning", "recovered", "closed", "lost"],
  returning: ["recovered", "closed", "found"],
  recovered: ["closed"],
  closed: [],
};

const ACTIVE_STATUSES = ["lost", "found", "returning"] as const;
const isActive = (status: RecoveryStatus) => (ACTIVE_STATUSES as readonly string[]).includes(status);

/** A lost-at time slightly ahead of the server clock is tolerated (clock skew between phone and server). */
const LOST_AT_SKEW_MS = 10 * 60_000;

function assertLostAtNotFuture(lostAt: string | null | undefined) {
  if (lostAt && Date.parse(lostAt) > Date.now() + LOST_AT_SKEW_MS) {
    throw new AppError(422, "validation_failed", "Some fields are invalid", [
      { path: ["lostAt"], message: "The time it was lost cannot be in the future" },
    ]);
  }
}

/** Notes are an append-only log once a recovery moves on; the oldest entries give way past this size. */
const NOTES_MAX = 20_000;

export function appendNote(
  existing: string | null,
  note: string | null | undefined,
  at: string,
): string | null {
  if (!note) return existing;
  const entry = `[${at}] ${note}`;
  const joined = existing ? `${existing}\n${entry}` : entry;
  return joined.length > NOTES_MAX ? `…${joined.slice(-(NOTES_MAX - 1))}` : joined;
}

function eventStatement(
  db: D1Database,
  ownerId: string,
  recoveryId: string,
  status: RecoveryStatus,
  note: string | null,
  at: string,
): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO recovery_events (id, owner_id, recovery_id, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(newId(), ownerId, recoveryId, status, note, at);
}

/** The item goes back to "normal" only when no other recovery for it is still active. */
function releaseItemStatement(
  db: D1Database,
  ownerId: string,
  itemId: string,
  recoveryId: string,
  at: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE items SET status = 'normal', updated_at = ? WHERE id = ? AND owner_id = ?
         AND NOT EXISTS (SELECT 1 FROM recoveries WHERE item_id = ? AND id != ? AND status IN ('lost', 'found', 'returning'))`,
    )
    .bind(at, itemId, ownerId, itemId, recoveryId);
}

/** Timeline of every recovery of an item, oldest first. */
export async function listRecoveryEvents(
  db: D1Database,
  ownerId: string,
  itemId: string,
): Promise<RecoveryEvent[]> {
  const { results } = await db
    .prepare(
      `SELECT e.id, e.recovery_id, e.status, e.note, e.created_at FROM recovery_events e
         JOIN recoveries r ON r.id = e.recovery_id
        WHERE r.owner_id = ? AND r.item_id = ? ORDER BY e.created_at, e.rowid`,
    )
    .bind(ownerId, itemId)
    .all<{ id: string; recovery_id: string; status: string; note: string | null; created_at: string }>();
  return results.map((r) => ({
    id: r.id,
    recoveryId: r.recovery_id,
    status: r.status as RecoveryStatus,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export const RECOVERY_SELECT = `SELECT r.*, i.name AS item_name FROM recoveries r JOIN items i ON i.id = r.item_id`;

export function toRecovery(r: RecoveryRow): Recovery {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name,
    status: r.status as RecoveryStatus,
    lostAt: r.lost_at,
    lostPlace: r.lost_place,
    notes: r.notes,
    recoveredAt: r.recovered_at,
    closedAt: r.closed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    allowedTransitions: [...RECOVERY_TRANSITIONS[r.status as RecoveryStatus]],
  };
}

/** The recovery that is still in progress for an item, if any. */
export async function activeRecovery(
  db: D1Database,
  ownerId: string,
  itemId: string,
): Promise<RecoveryRow | null> {
  return db
    .prepare(
      `${RECOVERY_SELECT} WHERE r.owner_id = ? AND r.item_id = ? AND r.status IN ('lost', 'found', 'returning')
       ORDER BY r.created_at DESC LIMIT 1`,
    )
    .bind(ownerId, itemId)
    .first<RecoveryRow>();
}

/** Declare an item lost: flips its status and opens a recovery (or updates the open one). */
export async function markLost(
  db: D1Database,
  ownerId: string,
  itemId: string,
  input: { lostAt?: string | null; lostPlace?: string | null; notes?: string | null },
): Promise<Recovery> {
  const item = await getOwnedItemRow(db, ownerId, itemId);
  if (item.archived_at) {
    throw new AppError(409, "item_archived", "Restore the item before marking it as lost");
  }
  assertLostAtNotFuture(input.lostAt);
  const now = nowIso();
  const open = await activeRecovery(db, ownerId, itemId);
  const recoveryId = open?.id ?? newId();
  const recoveryStmt = open
    ? db
        .prepare(
          `UPDATE recoveries SET lost_at = COALESCE(?, lost_at), lost_place = COALESCE(?, lost_place),
             notes = COALESCE(?, notes), updated_at = ? WHERE id = ?`,
        )
        .bind(input.lostAt ?? null, input.lostPlace ?? null, input.notes ?? null, now, recoveryId)
    : db
        .prepare(
          `INSERT INTO recoveries (id, owner_id, item_id, status, lost_at, lost_place, notes, created_at, updated_at)
           VALUES (?, ?, ?, 'lost', ?, ?, ?, ?, ?)`,
        )
        .bind(
          recoveryId,
          ownerId,
          itemId,
          input.lostAt ?? now,
          input.lostPlace ?? null,
          input.notes ?? null,
          now,
          now,
        );
  await db.batch([
    recoveryStmt,
    ...(open ? [] : [eventStatement(db, ownerId, recoveryId, "lost", input.notes ?? null, now)]),
    db
      .prepare("UPDATE items SET status = 'lost', updated_at = ? WHERE id = ? AND owner_id = ?")
      .bind(now, itemId, ownerId),
    activityStatement(db, {
      ownerId,
      type: "item.lost",
      itemId,
      data: { lostPlace: input.lostPlace ?? null },
    }),
  ]);
  const row = await db.prepare(`${RECOVERY_SELECT} WHERE r.id = ?`).bind(recoveryId).first<RecoveryRow>();
  if (!row) throw new Error("recovery missing after write");
  return toRecovery(row);
}

/** The item is back with its owner: close the loop on the open recovery. Notes are appended, never overwritten. */
export async function markRecovered(
  db: D1Database,
  ownerId: string,
  itemId: string,
  notes: string | null,
): Promise<Recovery | null> {
  await getOwnedItemRow(db, ownerId, itemId);
  const now = nowIso();
  const open = await activeRecovery(db, ownerId, itemId);
  const statements = [
    db
      .prepare("UPDATE items SET status = 'normal', updated_at = ? WHERE id = ? AND owner_id = ?")
      .bind(now, itemId, ownerId),
    activityStatement(db, { ownerId, type: "item.recovered", itemId }),
  ];
  if (open) {
    statements.push(
      db
        .prepare(
          "UPDATE recoveries SET status = 'recovered', recovered_at = ?, notes = ?, updated_at = ? WHERE id = ?",
        )
        .bind(now, appendNote(open.notes, notes, now), now, open.id),
      eventStatement(db, ownerId, open.id, "recovered", notes, now),
    );
  }
  await db.batch(statements);
  if (!open) return null;
  const row = await db.prepare(`${RECOVERY_SELECT} WHERE r.id = ?`).bind(open.id).first<RecoveryRow>();
  return row ? toRecovery(row) : null;
}

export async function getOwnedRecoveryRow(db: D1Database, ownerId: string, id: string): Promise<RecoveryRow> {
  const row = await db
    .prepare(`${RECOVERY_SELECT} WHERE r.id = ? AND r.owner_id = ?`)
    .bind(id, ownerId)
    .first<RecoveryRow>();
  if (!row) throw notFound("Recovery");
  return row;
}

export async function listRecoveries(
  db: D1Database,
  ownerId: string,
  filter: { statuses?: readonly RecoveryStatus[] } = {},
): Promise<Recovery[]> {
  const where = ["r.owner_id = ?"];
  const params: unknown[] = [ownerId];
  if (filter.statuses?.length) {
    where.push(`r.status IN (${filter.statuses.map(() => "?").join(", ")})`);
    params.push(...filter.statuses);
  }
  const { results } = await db
    .prepare(`${RECOVERY_SELECT} WHERE ${where.join(" AND ")} ORDER BY r.updated_at DESC LIMIT 200`)
    .bind(...params)
    .all<RecoveryRow>();
  return results.map(toRecovery);
}

type RecoveryPatch = z.output<typeof recoveryPatchSchema>;

/**
 * Edit a recovery. A status change must follow RECOVERY_TRANSITIONS (else 409 invalid_transition) and
 * is recorded in the timeline; the note that comes with it is appended to the notes, while an edit
 * without a status change replaces them. recovered/closed return the item to "normal" unless another
 * recovery for it is still active; closed means the owner stopped searching.
 */
export async function updateRecovery(
  db: D1Database,
  ownerId: string,
  id: string,
  patch: RecoveryPatch,
): Promise<Recovery> {
  const current = await getOwnedRecoveryRow(db, ownerId, id);
  const from = current.status as RecoveryStatus;
  const to = patch.status ?? from;
  if (to !== from && !RECOVERY_TRANSITIONS[from].includes(to)) {
    throw new AppError(409, "invalid_transition", `Cannot move a recovery from ${from} to ${to}`, {
      from,
      to,
      allowed: RECOVERY_TRANSITIONS[from],
    });
  }
  assertLostAtNotFuture(patch.lostAt);
  const now = nowIso();
  const changed = to !== from;
  const sets = ["updated_at = ?"];
  const params: unknown[] = [now];
  if ("lostAt" in patch) {
    sets.push("lost_at = ?");
    params.push(patch.lostAt ?? null);
  }
  if ("lostPlace" in patch) {
    sets.push("lost_place = ?");
    params.push(patch.lostPlace ?? null);
  }
  if ("notes" in patch) {
    sets.push("notes = ?");
    params.push(changed ? appendNote(current.notes, patch.notes, now) : (patch.notes ?? null));
  }
  const statements: D1PreparedStatement[] = [];
  if (changed) {
    sets.push("status = ?");
    params.push(to);
    if (to === "recovered") {
      sets.push("recovered_at = ?");
      params.push(now);
    } else if (to === "closed") {
      sets.push("closed_at = ?");
      params.push(now);
    }
    statements.push(eventStatement(db, ownerId, id, to, patch.notes ?? null, now));
    if ((to === "recovered" || to === "closed") && isActive(from)) {
      statements.push(releaseItemStatement(db, ownerId, current.item_id, id, now));
    }
    if (to === "recovered") {
      statements.push(activityStatement(db, { ownerId, type: "item.recovered", itemId: current.item_id }));
    }
    statements.push(
      activityStatement(db, {
        ownerId,
        type: "recovery.updated",
        itemId: current.item_id,
        data: { recoveryId: id, from, to },
      }),
    );
  }
  await db.batch([
    db
      .prepare(`UPDATE recoveries SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`)
      .bind(...params, id, ownerId),
    ...statements,
  ]);
  return toRecovery(await getOwnedRecoveryRow(db, ownerId, id));
}
