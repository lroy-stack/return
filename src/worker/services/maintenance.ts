/**
 * Nightly job (cron): retention, expired blocks and a JSON backup in R2.
 * Each owner and each step is isolated: one failure is logged and the rest still runs.
 */
import { activityStatement } from "../db/activity";
import { expireBlocksStatements } from "../db/blocks";
import { buildExport } from "../db/export";
import { getSettings } from "../db/settings";
import { daysAgoIso } from "../lib/time";
import { CACHE_TTL_DAYS, purgePlaceCacheStatement } from "./geocode";

const NOTIFICATION_RETENTION_DAYS = 90;
const BACKUPS_TO_KEEP = 30;

function logFailure(step: string, ownerId: string | null, err: unknown): void {
  console.error(
    JSON.stringify({ level: "error", msg: "maintenance step failed", step, ownerId, error: String(err) }),
  );
}

/** Runs one step in isolation; returns false when it failed. */
async function step(name: string, ownerId: string | null, run: () => Promise<void>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (err) {
    logFailure(name, ownerId, err);
    return false;
  }
}

async function applyRetention(env: Env, ownerId: string, now: Date): Promise<void> {
  const { privacy } = await getSettings(env.DB, ownerId);
  const nowMs = now.getTime();
  const db = env.DB;
  const expiredConversations = `SELECT id FROM conversations
        WHERE owner_id = ? AND status IN ('closed', 'blocked') AND closed_at IS NOT NULL AND closed_at < ?`;
  const expiredBinds = [ownerId, daysAgoIso(privacy.closedConversationRetentionDays, nowMs)];
  await env.DB.batch([
    env.DB.prepare("DELETE FROM activity_events WHERE owner_id = ? AND created_at < ?").bind(
      ownerId,
      daysAgoIso(privacy.activityRetentionDays, nowMs),
    ),
    // Cached place names of a conversation leave with it (and before its rows disappear).
    purgePlaceCacheStatement(db, expiredConversations, expiredBinds),
    env.DB.prepare(`DELETE FROM conversations WHERE id IN (${expiredConversations})`).bind(...expiredBinds),
    env.DB.prepare("DELETE FROM notifications WHERE owner_id = ? AND created_at < ?").bind(
      ownerId,
      daysAgoIso(NOTIFICATION_RETENTION_DAYS, nowMs),
    ),
    ...expireBlocksStatements(db, ownerId, now.toISOString()),
  ]);
}

/** Writes today's backup once, then keeps only the newest BACKUPS_TO_KEEP files. */
async function backup(env: Env, ownerId: string, now: Date): Promise<void> {
  const prefix = `backups/${ownerId}/`;
  const key = `${prefix}${now.toISOString().slice(0, 10)}.json`;
  if (!(await env.FILES.head(key))) {
    const doc = await buildExport(env.DB, ownerId);
    await env.FILES.put(key, JSON.stringify(doc), { httpMetadata: { contentType: "application/json" } });
    await activityStatement(env.DB, {
      ownerId,
      type: "backup.created",
      data: { key, items: doc.items.length, tags: doc.tags.length },
    }).run();
  }
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.FILES.list({ prefix, cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  // Names are ISO dates, so lexical order is chronological.
  const stale = keys.sort().slice(0, Math.max(0, keys.length - BACKUPS_TO_KEEP));
  if (stale.length > 0) await env.FILES.delete(stale);
}

export async function runMaintenance(env: Env, now: Date): Promise<void> {
  let owners: string[] = [];
  let failedSteps = 0;
  const run = async (name: string, ownerId: string | null, work: () => Promise<void>) => {
    if (!(await step(name, ownerId, work))) failedSteps += 1;
  };
  await run("list_owners", null, async () => {
    const { results } = await env.DB.prepare("SELECT id FROM owners").all<{ id: string }>();
    owners = results.map((r) => r.id);
  });
  for (const ownerId of owners) {
    await run("retention", ownerId, () => applyRetention(env, ownerId, now));
    await run("backup", ownerId, () => backup(env, ownerId, now));
  }
  // The place cache holds rounded coordinates that finders shared; it never outlives its TTL.
  await run("geocode_cache", null, async () => {
    await env.DB.prepare("DELETE FROM geocode_cache WHERE created_at < ?")
      .bind(daysAgoIso(CACHE_TTL_DAYS, now.getTime()).slice(0, 10))
      .run();
  });
  // Dead-man's-switch data: a run that reached its end, whatever the steps did.
  for (const ownerId of owners) {
    await run("record_run", ownerId, () =>
      activityStatement(env.DB, { ownerId, type: "maintenance.ran", data: { failedSteps } })
        .run()
        .then(() => undefined),
    );
  }
}
