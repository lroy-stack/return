import { type PushSubscriptionView, pushServiceOf } from "../../shared/schemas";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

/** Subscriptions an owner may register; bounds the fan-out of one event. */
export const MAX_OWNER_SUBSCRIPTIONS = 10;
/** A subscription is dropped after this many consecutive failures spanning at least `FAILURE_SPAN_MS`. */
export const MAX_FAILURES = 5;
export const FAILURE_SPAN_MS = 24 * 3_600_000;

/** Full row including the device secrets; only the sender reads it. */
export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface ViewRow {
  id: string;
  endpoint: string;
  label: string | null;
  created_at: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  failures: number;
}

export function toView(row: ViewRow): PushSubscriptionView {
  return {
    id: row.id,
    service: pushServiceOf(row.endpoint),
    label: row.label,
    createdAt: row.created_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    failures: row.failures,
  };
}

export async function listOwnerSubscriptions(
  db: D1Database,
  ownerId: string,
): Promise<PushSubscriptionView[]> {
  const { results } = await db
    .prepare(
      `SELECT id, endpoint, label, created_at, last_success_at, last_failure_at, failures
         FROM push_subscriptions WHERE owner_id = ? AND audience = 'owner'
        ORDER BY created_at, id`,
    )
    .bind(ownerId)
    .all<ViewRow>();
  return results.map(toView);
}

/** Web Push devices of the owner that can receive a push now; optionally just one of them. */
export async function listSendableSubscriptions(
  db: D1Database,
  ownerId: string,
  onlyId?: string,
): Promise<PushSubscriptionRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
        WHERE owner_id = ?1 AND audience = 'owner' AND channel = 'webpush'
          AND p256dh IS NOT NULL AND auth IS NOT NULL AND (?2 IS NULL OR id = ?2)
        ORDER BY created_at, id LIMIT ?3`,
    )
    .bind(ownerId, onlyId ?? null, MAX_OWNER_SUBSCRIPTIONS)
    .all<PushSubscriptionRow>();
  return results;
}

export type UpsertResult = { id: string } | "endpoint_in_use" | "limit_reached";

/**
 * Registers (or refreshes) a Web Push device, idempotent on the endpoint. A re-registration
 * resets the failure counters. An endpoint already stored for another owner is never taken over.
 */
export async function upsertWebPushSubscription(
  db: D1Database,
  ownerId: string,
  input: { endpoint: string; p256dh: string; auth: string; label: string | null },
): Promise<UpsertResult> {
  const known = await db
    .prepare("SELECT owner_id FROM push_subscriptions WHERE endpoint = ?")
    .bind(input.endpoint)
    .first<{ owner_id: string }>();
  if (known && known.owner_id !== ownerId) return "endpoint_in_use";
  if (!known) {
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE owner_id = ? AND audience = 'owner'")
      .bind(ownerId)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_OWNER_SUBSCRIPTIONS) return "limit_reached";
  }
  const row = await db
    .prepare(
      `INSERT INTO push_subscriptions (id, owner_id, audience, channel, endpoint, p256dh, auth, label, created_at)
       VALUES (?, ?, 'owner', 'webpush', ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh, auth = excluded.auth,
         label = COALESCE(excluded.label, push_subscriptions.label),
         failures = 0, first_failure_at = NULL, last_failure_at = NULL
       WHERE push_subscriptions.owner_id = excluded.owner_id AND push_subscriptions.audience = 'owner'
       RETURNING id`,
    )
    .bind(newId(), ownerId, input.endpoint, input.p256dh, input.auth, input.label, nowIso())
    .first<{ id: string }>();
  return row ? { id: row.id } : "endpoint_in_use";
}

export async function deleteOwnerSubscription(db: D1Database, ownerId: string, id: string): Promise<boolean> {
  const res = await db
    .prepare("DELETE FROM push_subscriptions WHERE id = ? AND owner_id = ? AND audience = 'owner'")
    .bind(id, ownerId)
    .run();
  return res.meta.changes > 0;
}

export function successStatement(
  db: D1Database,
  ownerId: string,
  id: string,
  at: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE push_subscriptions
          SET last_success_at = ?, failures = 0, first_failure_at = NULL, last_failure_at = NULL
        WHERE id = ? AND owner_id = ?`,
    )
    .bind(at, id, ownerId);
}

export function goneStatement(db: D1Database, ownerId: string, id: string): D1PreparedStatement {
  return db.prepare("DELETE FROM push_subscriptions WHERE id = ? AND owner_id = ?").bind(id, ownerId);
}

/** Counts the failure; the follow-up statement drops a subscription that failed for good. */
export function failureStatements(
  db: D1Database,
  ownerId: string,
  id: string,
  at: string,
): D1PreparedStatement[] {
  const cutoff = new Date(Date.parse(at) - FAILURE_SPAN_MS).toISOString();
  return [
    db
      .prepare(
        `UPDATE push_subscriptions
            SET failures = failures + 1, first_failure_at = COALESCE(first_failure_at, ?1), last_failure_at = ?1
          WHERE id = ?2 AND owner_id = ?3`,
      )
      .bind(at, id, ownerId),
    db
      .prepare(
        `DELETE FROM push_subscriptions
          WHERE id = ? AND owner_id = ? AND failures >= ? AND first_failure_at <= ?`,
      )
      .bind(id, ownerId, MAX_FAILURES, cutoff),
  ];
}
