import type { Tracker } from "../../shared/schemas";

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
