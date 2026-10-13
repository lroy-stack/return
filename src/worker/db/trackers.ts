import type { z } from "zod";
import type { Tracker, trackerInputSchema, trackerPatchSchema } from "../../shared/schemas";
import { notFound } from "../lib/http";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

export interface TrackerRow {
  id: string;
  owner_id: string;
  item_id: string | null;
  kind: string;
  name: string;
  notes: string | null;
  last_location_text: string | null;
  last_location_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TrackerUpdate = z.output<typeof trackerPatchSchema>;
export type TrackerCreate = z.output<typeof trackerInputSchema>;

export function toTracker(r: TrackerRow): Tracker {
  return {
    id: r.id,
    itemId: r.item_id,
    kind: r.kind as Tracker["kind"],
    name: r.name,
    notes: r.notes,
    lastLocationText: r.last_location_text,
    lastLocationAt: r.last_location_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listTrackers(
  db: D1Database,
  ownerId: string,
  filter: { itemId?: string } = {},
): Promise<Tracker[]> {
  const where = ["owner_id = ?"];
  const params: unknown[] = [ownerId];
  if (filter.itemId) {
    where.push("item_id = ?");
    params.push(filter.itemId);
  }
  const { results } = await db
    .prepare(`SELECT * FROM trackers WHERE ${where.join(" AND ")} ORDER BY name`)
    .bind(...params)
    .all<TrackerRow>();
  return results.map(toTracker);
}

export async function getOwnedTrackerRow(db: D1Database, ownerId: string, id: string): Promise<TrackerRow> {
  const row = await db
    .prepare("SELECT * FROM trackers WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId)
    .first<TrackerRow>();
  if (!row) throw notFound("Tracker");
  return row;
}

export async function createTracker(db: D1Database, ownerId: string, input: TrackerCreate): Promise<Tracker> {
  const id = newId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO trackers (id, owner_id, item_id, kind, name, notes, last_location_text, last_location_at,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ownerId,
      input.itemId ?? null,
      input.kind,
      input.name,
      input.notes ?? null,
      input.lastLocationText ?? null,
      input.lastLocationAt ?? null,
      now,
      now,
    )
    .run();
  return toTracker(await getOwnedTrackerRow(db, ownerId, id));
}

const TRACKER_COLUMNS: Record<keyof TrackerUpdate, string> = {
  itemId: "item_id",
  kind: "kind",
  name: "name",
  notes: "notes",
  lastLocationText: "last_location_text",
  lastLocationAt: "last_location_at",
};

export async function updateTracker(
  db: D1Database,
  ownerId: string,
  id: string,
  patch: TrackerUpdate,
): Promise<Tracker> {
  const current = await getOwnedTrackerRow(db, ownerId, id);
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(TRACKER_COLUMNS) as [keyof TrackerUpdate, string][]) {
    if (!(key in patch)) continue;
    sets.push(`${column} = ?`);
    params.push(patch[key] ?? null);
  }
  if (sets.length === 0) return toTracker(current);
  sets.push("updated_at = ?");
  params.push(nowIso());
  await db
    .prepare(`UPDATE trackers SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`)
    .bind(...params, id, ownerId)
    .run();
  return toTracker(await getOwnedTrackerRow(db, ownerId, id));
}

export async function deleteTracker(db: D1Database, ownerId: string, id: string): Promise<void> {
  await getOwnedTrackerRow(db, ownerId, id);
  await db.prepare("DELETE FROM trackers WHERE id = ? AND owner_id = ?").bind(id, ownerId).run();
}
