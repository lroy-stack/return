import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { SystemStatus } from "../src/shared/schemas";
import { APP_VERSION } from "../src/worker/version";
import { apiJson } from "./helpers/api";

describe("system status", () => {
  it("reports checks, counts and origins", async () => {
    const owner = await apiJson<{ ownerId: string }>("GET", "/me");
    await apiJson("POST", "/items", { name: "Counted" });
    await apiJson("POST", "/tags", { count: 2 });
    const day = 86_400_000;
    const recent = new Date(Date.now() - day).toISOString();
    const old = new Date(Date.now() - 10 * day).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, error, created_at) VALUES ('n-recent', ?1, 'email', 'owner.test', 'a@b.test', 'failed', 'boom', ?2)",
      ).bind(owner.ownerId, recent),
      env.DB.prepare(
        "INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, error, created_at) VALUES ('n-old', ?1, 'email', 'owner.test', 'a@b.test', 'failed', 'boom', ?2)",
      ).bind(owner.ownerId, old),
      env.DB.prepare(
        "INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, created_at) VALUES ('n-ok', ?1, 'email', 'owner.test', 'a@b.test', 'sent', ?2)",
      ).bind(owner.ownerId, recent),
      env.DB.prepare(
        "INSERT INTO activity_events (id, owner_id, type, created_at) VALUES ('b1', ?1, 'backup.created', '2026-04-01T03:17:00.000Z')",
      ).bind(owner.ownerId),
    ]);

    const status = await apiJson<SystemStatus>("GET", "/system");
    expect(status).toMatchObject({
      version: APP_VERSION,
      environment: "test",
      publicOrigin: "https://return.test",
      appOrigin: "https://app.return.test",
      lastBackupAt: "2026-04-01T03:17:00.000Z",
      recentNotificationFailures: 1,
    });
    expect(status.checks).toMatchObject({
      database: true,
      storage: true,
      accessConfigured: true,
      turnstileConfigured: true,
      fallbackContactConfigured: true,
    });
    expect(typeof status.checks.emailConfigured).toBe("boolean");
    expect(status.counts.items).toBeGreaterThanOrEqual(1);
    expect(status.counts.tags).toBe(2);
  });

  it("never exposes secret or identifying configuration values", async () => {
    const raw = JSON.stringify(await apiJson<SystemStatus>("GET", "/system"));
    for (const secret of [
      env.TURNSTILE_SECRET_KEY,
      env.TURNSTILE_SITE_KEY,
      env.IP_HMAC_SECRET,
      env.ACCESS_AUD,
      env.ACCESS_TEAM_DOMAIN,
      env.OWNER_EMAILS,
      env.FALLBACK_CONTACT_EMAIL,
      env.NOTIFY_FROM,
    ]) {
      expect(secret).toBeTruthy();
      expect(raw).not.toContain(secret);
    }
  });
});
