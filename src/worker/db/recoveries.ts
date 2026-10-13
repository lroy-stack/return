import type { Recovery, RecoveryStatus } from "../../shared/schemas";
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
