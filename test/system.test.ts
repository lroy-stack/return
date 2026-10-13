import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnerAlert, SystemStatus } from "../src/shared/schemas";
import { runMaintenance } from "../src/worker/services/maintenance";
import { verifyTurnstile } from "../src/worker/services/turnstile";
import { APP_VERSION } from "../src/worker/version";
import { api, apiJson } from "./helpers/api";

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

describe("owner email reliability", () => {
  afterEach(() => vi.restoreAllMocks());

  const setRecipient = () =>
    apiJson("PUT", "/settings", { notifications: { emailAddress: "me@example.test" } });
  const clear = async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
  };

  it("starts without a delivery and without an alert", async () => {
    await clear();
    await setRecipient();
    const status = await apiJson<SystemStatus>("GET", "/system");
    expect(status.email).toMatchObject({ lastOwnerDelivery: null, recentFailures: 0 });
    expect((await apiJson<{ alerts: OwnerAlert[] }>("GET", "/alerts")).alerts).toEqual([]);
  });

  it("reports the last failed delivery and raises a persistent alert until an email succeeds", async () => {
    await clear();
    await setRecipient();
    vi.spyOn(env.EMAIL, "send").mockRejectedValue(
      new Error("could not find domain config of sending domain"),
    );
    await api("POST", "/settings/test-email", {});

    const status = await apiJson<SystemStatus>("GET", "/system");
    expect(status.email.lastOwnerDelivery).toMatchObject({
      status: "failed",
      code: "sender_not_verified",
      error: expect.stringContaining("domain config"),
    });
    expect(status.email.recentFailures).toBe(1);
    expect(status.recentNotificationFailures).toBe(1);
    const { alerts } = await apiJson<{ alerts: OwnerAlert[] }>("GET", "/alerts");
    expect(alerts).toEqual([
      expect.objectContaining({
        kind: "owner_email_failed",
        code: "sender_not_verified",
        since: expect.any(String),
      }),
    ]);

    vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "ok" } as never);
    await api("POST", "/settings/test-email", {});
    const healed = await apiJson<SystemStatus>("GET", "/system");
    expect(healed.email.lastOwnerDelivery).toMatchObject({ status: "sent", code: null, error: null });
    expect((await apiJson<{ alerts: OwnerAlert[] }>("GET", "/alerts")).alerts).toEqual([]);
  });

  it("does not treat muted or capped emails as delivery outcomes", async () => {
    await clear();
    await setRecipient();
    const owner = (await apiJson<{ ownerId: string }>("GET", "/me")).ownerId;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, error, created_at) VALUES ('d-ok', ?1, 'email', 'owner.new_message', 'a@b.test', 'sent', NULL, '2026-10-01T10:00:00.000Z')",
      ).bind(owner),
      env.DB.prepare(
        "INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, error, created_at) VALUES ('d-muted', ?1, 'email', 'owner.new_message', 'a@b.test', 'skipped', 'muted', '2026-10-02T10:00:00.000Z')",
      ).bind(owner),
      env.DB.prepare(
        "INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, error, created_at) VALUES ('d-trusted', ?1, 'email', 'trusted.alert', 'c@d.test', 'failed', 'boom', '2026-10-03T10:00:00.000Z')",
      ).bind(owner),
    ]);
    const status = await apiJson<SystemStatus>("GET", "/system");
    expect(status.email.lastOwnerDelivery).toMatchObject({ status: "sent", at: "2026-10-01T10:00:00.000Z" });
    expect((await apiJson<{ alerts: OwnerAlert[] }>("GET", "/alerts")).alerts).toEqual([]);
  });

  it("requires the owner for alerts", async () => {
    expect((await api("GET", "/alerts", undefined, { jwt: null })).status).toBe(401);
  });
});

describe("honest service checks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks Access verified when this request carried a valid token", async () => {
    const status = await apiJson<SystemStatus>("GET", "/system");
    expect(status.verified.access).toBe(true);
  });

  it("marks Turnstile verified only after a successful siteverify, for 30 days", async () => {
    await env.DB.prepare("DELETE FROM system_state WHERE key = 'turnstile.last_success'").run();
    const before = await apiJson<SystemStatus>("GET", "/system");
    expect(before.checks.turnstileConfigured).toBe(true);
    expect(before.verified).toMatchObject({ turnstile: false, turnstileLastSuccessAt: null });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: false }));
    await verifyTurnstile(env, "token", null, "return.test");
    expect((await apiJson<SystemStatus>("GET", "/system")).verified.turnstile).toBe(false);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, hostname: env.PUBLIC_HOST }),
    );
    expect(await verifyTurnstile(env, "token", null, "return.test")).toBe(true);
    const after = await apiJson<SystemStatus>("GET", "/system");
    expect(after.verified.turnstile).toBe(true);
    expect(after.verified.turnstileLastSuccessAt).not.toBeNull();

    await env.DB.prepare("UPDATE system_state SET updated_at = ? WHERE key = 'turnstile.last_success'")
      .bind(new Date(Date.now() - 31 * 86_400_000).toISOString())
      .run();
    expect((await apiJson<SystemStatus>("GET", "/system")).verified.turnstile).toBe(false);
  });

  it("does not record a success for a token solved on another hostname", async () => {
    await env.DB.prepare("DELETE FROM system_state WHERE key = 'turnstile.last_success'").run();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, hostname: "evil.example" }),
    );
    expect(await verifyTurnstile(env, "token", null, "return.test")).toBe(false);
    expect((await apiJson<SystemStatus>("GET", "/system")).verified.turnstileLastSuccessAt).toBeNull();
  });

  it("reports the last maintenance run (dead-man's switch) next to the last backup", async () => {
    await env.DB.prepare("DELETE FROM activity_events WHERE type = 'maintenance.ran'").run();
    expect((await apiJson<SystemStatus>("GET", "/system")).maintenance.lastRunAt).toBeNull();
    await runMaintenance(env, new Date());
    const { maintenance } = await apiJson<SystemStatus>("GET", "/system");
    expect(maintenance.lastRunAt).not.toBeNull();
    expect(maintenance.lastBackupAt).not.toBeNull();
  });
});
