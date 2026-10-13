import { Hono } from "hono";
import type { SystemStatus } from "../../shared/schemas";
import { type AppEnv, isDevelopment } from "../env";
import { daysAgoIso } from "../lib/time";
import { emailConfigured, lastOwnerDelivery } from "../services/notify";
import { loadVapid } from "../services/push/webpush";
import { TURNSTILE_STATE_KEY } from "../services/turnstile";
import { APP_VERSION } from "../version";

const TURNSTILE_VERIFIED_DAYS = 30;

export const systemApi = new Hono<AppEnv>();

async function check(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch {
    return false;
  }
}

/** Health and configuration summary. Reports whether things are configured, never their values. */
systemApi.get("/", async (c) => {
  const env = c.env;
  const ownerId = c.get("ownerId");
  const [database, storage] = await Promise.all([
    check(() => env.DB.prepare("SELECT 1").first()),
    check(() => env.FILES.list({ limit: 1 })),
  ]);
  const counts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM items WHERE owner_id = ?1) AS items,
            (SELECT COUNT(*) FROM tags WHERE owner_id = ?1) AS tags,
            (SELECT COUNT(*) FROM conversations WHERE owner_id = ?1 AND status = 'open') AS open_conversations,
            (SELECT MAX(created_at) FROM activity_events WHERE owner_id = ?1 AND type = 'backup.created') AS last_backup,
            (SELECT MAX(created_at) FROM activity_events WHERE owner_id = ?1 AND type = 'maintenance.ran') AS last_run,
            (SELECT updated_at FROM system_state WHERE key = ?3) AS turnstile_ok,
            (SELECT COUNT(*) FROM notifications WHERE owner_id = ?1 AND channel = 'email' AND status = 'failed' AND created_at > ?2) AS failures,
            (SELECT COUNT(*) FROM notifications WHERE owner_id = ?1 AND channel = 'push' AND status = 'failed' AND created_at > ?2) AS push_failures,
            (SELECT MAX(last_success_at) FROM push_subscriptions WHERE owner_id = ?1 AND audience = 'owner') AS push_last_success,
            (SELECT COUNT(*) FROM push_subscriptions WHERE owner_id = ?1 AND audience = 'owner') AS push_subscriptions`,
  )
    .bind(ownerId, daysAgoIso(7), TURNSTILE_STATE_KEY)
    .first<{
      items: number;
      tags: number;
      open_conversations: number;
      last_backup: string | null;
      last_run: string | null;
      turnstile_ok: string | null;
      failures: number;
      push_failures: number;
      push_last_success: string | null;
      push_subscriptions: number;
    }>();
  const accessConfigured = Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);
  const turnstileOk = counts?.turnstile_ok ?? null;
  const delivery = await lastOwnerDelivery(env.DB, ownerId);
  return c.json<SystemStatus>({
    version: APP_VERSION,
    environment: env.ENVIRONMENT,
    publicOrigin: env.PUBLIC_HOST ? `https://${env.PUBLIC_HOST}` : null,
    appOrigin: env.APP_HOST ? `https://${env.APP_HOST}` : null,
    checks: {
      database,
      storage,
      accessConfigured,
      turnstileConfigured: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
      emailConfigured: emailConfigured(env),
      fallbackContactConfigured: Boolean(env.FALLBACK_CONTACT_EMAIL),
    },
    verified: {
      // The auth middleware only lets a request through with a verified token, unless the dev bypass is on.
      access: accessConfigured && !isDevelopment(env) && Boolean(c.req.header("Cf-Access-Jwt-Assertion")),
      turnstile: turnstileOk !== null && turnstileOk > daysAgoIso(TURNSTILE_VERIFIED_DAYS),
      turnstileLastSuccessAt: turnstileOk,
    },
    email: {
      configured: emailConfigured(env),
      lastOwnerDelivery: delivery,
      recentFailures: counts?.failures ?? 0,
    },
    push: {
      configured: (await loadVapid(env)) !== null,
      subscriptions: counts?.push_subscriptions ?? 0,
      recentFailures: counts?.push_failures ?? 0,
      lastSuccessAt: counts?.push_last_success ?? null,
    },
    maintenance: { lastRunAt: counts?.last_run ?? null, lastBackupAt: counts?.last_backup ?? null },
    counts: {
      items: counts?.items ?? 0,
      tags: counts?.tags ?? 0,
      openConversations: counts?.open_conversations ?? 0,
    },
  });
});
