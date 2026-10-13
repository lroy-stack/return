import { Hono } from "hono";
import type { SystemStatus } from "../../shared/schemas";
import type { AppEnv } from "../env";
import { daysAgoIso } from "../lib/time";
import { emailConfigured } from "../services/notify";
import { APP_VERSION } from "../version";

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
            (SELECT COUNT(*) FROM notifications WHERE owner_id = ?1 AND status = 'failed' AND created_at > ?2) AS failures`,
  )
    .bind(ownerId, daysAgoIso(7))
    .first<{
      items: number;
      tags: number;
      open_conversations: number;
      last_backup: string | null;
      failures: number;
    }>();
  return c.json<SystemStatus>({
    version: APP_VERSION,
    environment: env.ENVIRONMENT,
    publicOrigin: env.PUBLIC_HOST ? `https://${env.PUBLIC_HOST}` : null,
    appOrigin: env.APP_HOST ? `https://${env.APP_HOST}` : null,
    checks: {
      database,
      storage,
      accessConfigured: Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD),
      turnstileConfigured: Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY),
      emailConfigured: emailConfigured(env),
      fallbackContactConfigured: Boolean(env.FALLBACK_CONTACT_EMAIL),
    },
    counts: {
      items: counts?.items ?? 0,
      tags: counts?.tags ?? 0,
      openConversations: counts?.open_conversations ?? 0,
    },
    lastBackupAt: counts?.last_backup ?? null,
    recentNotificationFailures: counts?.failures ?? 0,
  });
});
