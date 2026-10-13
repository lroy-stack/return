import type { z } from "zod";
import type { Recovery, RecoveryStatus, recoveryPatchSchema } from "../../shared/schemas";
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
  await getOwnedItemRow(db, ownerId, itemId);
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

/** The item is back with its owner: close the loop on the open recovery. */
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
          `UPDATE recoveries SET status = 'recovered', recovered_at = ?, notes = COALESCE(?, notes), updated_at = ?
           WHERE id = ?`,
        )
        .bind(now, notes, now, open.id),
    );
  }
  await db.batch(statements);
  if (!open) return null;
  const row = await db.prepare(`${RECOVERY_SELECT} WHERE r.id = ?`).bind(open.id).first<RecoveryRow>();
  return row ? toRecovery(row) : null;
}

/** Allowed status changes. `closed` is terminal; `recovered` can only be closed. */
export const RECOVERY_TRANSITIONS: Record<RecoveryStatus, readonly RecoveryStatus[]> = {
  lost: ["found", "returning", "recovered", "closed"],
  found: ["returning", "recovered", "closed", "lost"],
  returning: ["recovered", "closed", "found"],
  recovered: ["closed"],
  closed: [],
};

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
 * Edit a recovery. A status change must follow RECOVERY_TRANSITIONS (else 409 invalid_transition).
 * recovered: stamps recovered_at and returns the item to "normal"; closed: stamps closed_at only.
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
  const now = nowIso();
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
    params.push(patch.notes ?? null);
  }
  const statements: D1PreparedStatement[] = [];
  if (to !== from) {
    sets.push("status = ?");
    params.push(to);
    if (to === "recovered") {
      sets.push("recovered_at = ?");
      params.push(now);
      statements.push(
        db
          .prepare("UPDATE items SET status = 'normal', updated_at = ? WHERE id = ? AND owner_id = ?")
          .bind(now, current.item_id, ownerId),
        activityStatement(db, { ownerId, type: "item.recovered", itemId: current.item_id }),
      );
    } else if (to === "closed") {
      sets.push("closed_at = ?");
      params.push(now);
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
