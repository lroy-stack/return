/**
 * Push delivery to the owner's devices (ADR 0003). Strictly secondary like email: nothing here
 * throws into the caller, a failure never blocks the stored message, and every outcome is logged
 * in `notifications` (channel `push`, recipient = subscription id, never the endpoint URL).
 */
import type { PushEventKind, PushTestResult } from "../../../shared/schemas";
import type { Settings } from "../../../shared/settings";
import {
  failureStatements,
  goneStatement,
  listSendableSubscriptions,
  type PushSubscriptionRow,
  successStatement,
} from "../../db/push";
import { newId } from "../../lib/ids";
import { nowIso } from "../../lib/time";
import { buildPushPayload, type PushEventInput, pushOptionsFor } from "./payload";
import { loadVapid, sendWebPush, type VapidKeys } from "./webpush";

/**
 * Per-owner hourly ceilings, counted in events (an event goes to every device). Follow-ups stop at
 * the lower one so a flood can never use up the room reserved for first contact and lost-item scans.
 */
export const MAX_FOLLOW_UP_PUSHES_PER_HOUR = 40;
export const MAX_PUSHES_PER_HOUR = 60;
/** At most one follow-up push per conversation in this window (email keeps its own 10 minutes). */
export const PUSH_COOLDOWN_MS = 2 * 60_000;

type Outcome = PushTestResult["results"][number];

async function sentCount(db: D1Database, where: string, ...binds: unknown[]): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM notifications WHERE channel = 'push' AND status = 'sent' AND ${where}`,
    )
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Events delivered to at least one device since `since`. All rows of one event share `created_at`,
 * so distinct timestamps count events, not devices. Test pushes are not events.
 */
async function sentEvents(db: D1Database, ownerId: string, since: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT created_at) AS n FROM notifications
        WHERE owner_id = ? AND channel = 'push' AND status = 'sent' AND kind <> 'owner.test' AND created_at > ?`,
    )
    .bind(ownerId, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Sends the payload to each device in parallel and records every outcome in one batch. */
async function deliverTo(
  env: Env,
  ownerId: string,
  subs: PushSubscriptionRow[],
  vapid: VapidKeys,
  event: PushEventInput,
  prefs: { showItemName: boolean; lang: Settings["identity"]["panelLanguage"] },
): Promise<Outcome[]> {
  const payload = new TextEncoder().encode(JSON.stringify(buildPushPayload(env, event, prefs)));
  const options = pushOptionsFor(event);
  const results = await Promise.all(subs.map((sub) => sendWebPush(sub, payload, options, vapid)));

  const at = nowIso();
  const kind = `owner.${event.kind}`;
  const statements: D1PreparedStatement[] = [];
  const outcomes: Outcome[] = [];
  const log = (subId: string, status: "sent" | "failed" | "skipped", error: string | null) =>
    statements.push(
      env.DB.prepare(
        `INSERT INTO notifications (id, owner_id, channel, kind, recipient, conversation_id, status, error, created_at)
         VALUES (?, ?, 'push', ?, ?, ?, ?, ?, ?)`,
      ).bind(newId(), ownerId, kind, subId, event.conversationId ?? null, status, error, at),
    );

  subs.forEach((sub, i) => {
    const result = results[i];
    if (result?.kind === "ok") {
      statements.push(successStatement(env.DB, ownerId, sub.id, at));
      log(sub.id, "sent", null);
      outcomes.push({ id: sub.id, status: "sent", error: null });
    } else if (result?.kind === "gone") {
      statements.push(goneStatement(env.DB, ownerId, sub.id));
      log(sub.id, "skipped", "subscription_gone");
      outcomes.push({ id: sub.id, status: "gone", error: "subscription_gone" });
    } else {
      const error = result?.kind === "error" ? result.error : "unknown";
      // Only failures that may heal count toward dropping the device; a rejected request or a key
      // mismatch keeps the subscription and shows up in System status as a failed push.
      if (result?.kind === "error" && result.transient) {
        statements.push(...failureStatements(env.DB, ownerId, sub.id, at));
      }
      log(sub.id, "failed", error);
      outcomes.push({ id: sub.id, status: "failed", error });
    }
    const outcome = outcomes[outcomes.length - 1];
    console.log(
      JSON.stringify({
        level: result?.kind === "error" && !result.transient ? "error" : "info",
        msg: "push delivery",
        subscriptionId: sub.id,
        conversationId: event.conversationId ?? null,
        kind: event.kind,
        status: outcome?.status,
        error: outcome?.error ?? null,
      }),
    );
  });
  await env.DB.batch(statements);
  return outcomes;
}

/**
 * Pushes an owner event to every active device. Honours the push switch, mute, the follow-up
 * cooldown and the hourly cap; the per-event toggles are checked by the caller.
 */
export async function pushToOwner(
  env: Env,
  ownerId: string,
  settings: Settings,
  event: PushEventInput & { kind: Exclude<PushEventKind, "test"> },
): Promise<void> {
  const prefs = settings.notifications.push;
  if (!prefs.enabled) return;
  if (settings.notifications.mutedUntil && settings.notifications.mutedUntil > nowIso()) return;
  const vapid = await loadVapid(env);
  if (!vapid) return;
  const subs = await listSendableSubscriptions(env.DB, ownerId);
  if (subs.length === 0) return;

  const now = Date.now();
  const isFollowUp = event.kind !== "new_conversation" && event.kind !== "lost_item_scanned";
  if (
    isFollowUp &&
    event.conversationId &&
    (await sentCount(
      env.DB,
      "owner_id = ? AND conversation_id = ? AND kind <> 'owner.test' AND created_at > ?",
      ownerId,
      event.conversationId,
      new Date(now - PUSH_COOLDOWN_MS).toISOString(),
    )) > 0
  ) {
    return;
  }
  const recent = await sentEvents(env.DB, ownerId, new Date(now - 3_600_000).toISOString());
  if (recent >= (isFollowUp ? MAX_FOLLOW_UP_PUSHES_PER_HOUR : MAX_PUSHES_PER_HOUR)) {
    await env.DB.prepare(
      `INSERT INTO notifications (id, owner_id, channel, kind, recipient, conversation_id, status, error, created_at)
       VALUES (?, ?, 'push', ?, 'all', ?, 'skipped', 'hourly_cap', ?)`,
    )
      .bind(newId(), ownerId, `owner.${event.kind}`, event.conversationId ?? null, nowIso())
      .run();
    return;
  }
  await deliverTo(env, ownerId, subs, vapid, event, {
    showItemName: prefs.showItemName,
    lang: settings.identity.panelLanguage,
  });
}

/** "Send test push" from the panel: reports the outcome per device and ignores mute, cooldown and the event toggles. */
export async function sendTestPush(
  env: Env,
  ownerId: string,
  settings: Settings,
  subscriptionId?: string,
): Promise<PushTestResult> {
  const vapid = await loadVapid(env);
  if (!vapid) return { ok: false, code: "not_configured", results: [] };
  const subs = await listSendableSubscriptions(env.DB, ownerId, subscriptionId);
  if (subs.length === 0) return { ok: false, code: "no_subscriptions", results: [] };
  const results = await deliverTo(
    env,
    ownerId,
    subs,
    vapid,
    { kind: "test" },
    { showItemName: false, lang: settings.identity.panelLanguage },
  );
  const ok = results.every((r) => r.status === "sent");
  return { ok, code: ok ? "sent" : "failed", results };
}
