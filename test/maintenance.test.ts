import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportDocumentSchema } from "../src/worker/db/export";
import { runMaintenance } from "../src/worker/services/maintenance";
import { apiJson } from "./helpers/api";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const count = async (sql: string, ...params: unknown[]) =>
  (
    await env.DB.prepare(sql)
      .bind(...params)
      .first<{ n: number }>()
  )?.n ?? -1;

async function ownerId(): Promise<string> {
  return (await apiJson<{ ownerId: string }>("GET", "/me")).ownerId;
}

async function listBackups(id: string): Promise<string[]> {
  const listed = await env.FILES.list({ prefix: `backups/${id}/` });
  return listed.objects.map((o) => o.key).sort();
}

afterEach(() => vi.restoreAllMocks());

describe("maintenance", () => {
  it("applies the retention settings and keeps recent rows", async () => {
    const id = await ownerId();
    await apiJson("PUT", "/settings", {
      privacy: { activityRetentionDays: 30, closedConversationRetentionDays: 30 },
    });
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO activity_events (id, owner_id, type, created_at) VALUES ('ev-old', ?, 'item.created', ?)",
      ).bind(id, ago(31)),
      env.DB.prepare(
        "INSERT INTO activity_events (id, owner_id, type, created_at) VALUES ('ev-new', ?, 'item.created', ?)",
      ).bind(id, ago(29)),
      env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, finder_token_hash, subject, status, closed_at, last_message_at, created_at)
         VALUES ('c-old-closed', ?1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 's', 'closed', ?2, ?2, ?2)`,
      ).bind(id, ago(31)),
      env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, finder_token_hash, subject, status, closed_at, last_message_at, created_at)
         VALUES ('c-old-blocked', ?1, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 's', 'blocked', ?2, ?2, ?2)`,
      ).bind(id, ago(40)),
      env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, finder_token_hash, subject, status, closed_at, last_message_at, created_at)
         VALUES ('c-new-closed', ?1, 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 's', 'closed', ?2, ?2, ?2)`,
      ).bind(id, ago(5)),
      env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, finder_token_hash, subject, status, last_message_at, created_at)
         VALUES ('c-old-open', ?1, 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 's', 'open', ?2, ?2)`,
      ).bind(id, ago(200)),
      env.DB.prepare(
        "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('m-old', 'c-old-closed', 'finder', 'hi', ?)",
      ).bind(ago(31)),
      env.DB.prepare(
        "INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, created_at) VALUES ('n-old', ?, 'email', 'k', 'r', 'sent', ?)",
      ).bind(id, ago(91)),
      env.DB.prepare(
        "INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, created_at) VALUES ('n-new', ?, 'email', 'k', 'r', 'sent', ?)",
      ).bind(id, ago(89)),
      env.DB.prepare(
        "INSERT INTO blocks (id, owner_id, ip_hmac, expires_at, created_at) VALUES ('b-expired', ?1, 'x', ?2, ?2)",
      ).bind(id, ago(1)),
      env.DB.prepare(
        "INSERT INTO blocks (id, owner_id, ip_hmac, expires_at, created_at) VALUES ('b-active', ?1, 'y', ?2, ?3)",
      ).bind(id, new Date(Date.now() + DAY).toISOString(), ago(1)),
      env.DB.prepare(
        "INSERT INTO blocks (id, owner_id, ip_hmac, expires_at, created_at) VALUES ('b-forever', ?1, 'z', NULL, ?2)",
      ).bind(id, ago(100)),
    ]);

    await runMaintenance(env, new Date());

    const ids = async (table: string) =>
      (
        await env.DB.prepare(`SELECT id FROM ${table} WHERE owner_id = ? ORDER BY id`)
          .bind(id)
          .all<{ id: string }>()
      ).results.map((r) => r.id);
    expect(await ids("activity_events")).toContain("ev-new");
    expect(await ids("activity_events")).not.toContain("ev-old");
    expect(await ids("conversations")).toEqual(["c-new-closed", "c-old-open"]);
    expect(await count("SELECT COUNT(*) AS n FROM messages WHERE id = 'm-old'")).toBe(0);
    expect(await ids("notifications")).toEqual(["n-new"]);
    expect(await ids("blocks")).toEqual(["b-active", "b-forever"]);
  });

  it("writes one valid backup per day and records it", async () => {
    const id = await ownerId();
    const now = new Date();
    await runMaintenance(env, now);
    await runMaintenance(env, now);
    const key = `backups/${id}/${now.toISOString().slice(0, 10)}.json`;
    expect(await listBackups(id)).toContain(key);
    const stored = await env.FILES.get(key);
    const parsed = exportDocumentSchema.safeParse(JSON.parse((await stored?.text()) ?? "null"));
    expect(parsed.success).toBe(true);
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM activity_events WHERE owner_id = ? AND type = 'backup.created'",
        id,
      ),
    ).toBe(1);
    const { lastBackupAt } = await apiJson<{ lastBackupAt: string | null }>("GET", "/system");
    expect(lastBackupAt).not.toBeNull();
  });

  it("keeps only the 30 newest backups of each owner", async () => {
    const id = await ownerId();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO owners (id, email, created_at) VALUES ('second', 'second@example.test', ?)",
    )
      .bind(ago(1))
      .run();
    // 35 distinct, sortable names in 2024, clearly older than any new backup.
    const names = Array.from(
      { length: 35 },
      (_, i) =>
        `2024-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    );
    for (const owner of [id, "second"]) {
      for (const name of names) await env.FILES.put(`backups/${owner}/${name}.json`, "{}");
    }
    const tomorrow = new Date(Date.now() + DAY);
    await runMaintenance(env, tomorrow);

    const mine = await listBackups(id);
    expect(mine).toHaveLength(30);
    expect(mine).toContain(`backups/${id}/${tomorrow.toISOString().slice(0, 10)}.json`);
    expect(mine).not.toContain(`backups/${id}/${names[0]}.json`);
    expect(mine).toContain(`backups/${id}/${names[names.length - 1]}.json`);
    expect(await listBackups("second")).toHaveLength(30);
  });

  it("logs a failure for one owner and still maintains the others", async () => {
    const id = await ownerId();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO owners (id, email, created_at) VALUES ('broken', 'broken@example.test', ?)",
    )
      .bind(ago(1))
      .run();
    await env.DB.prepare("INSERT INTO settings (owner_id, data, updated_at) VALUES ('broken', 'not json', ?)")
      .bind(ago(1))
      .run();
    await env.DB.prepare(
      "INSERT INTO activity_events (id, owner_id, type, created_at) VALUES ('ev-after-failure', ?, 'item.created', ?)",
    )
      .bind(id, ago(400))
      .run();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const dayAfter = new Date(Date.now() + 2 * DAY);

    await expect(runMaintenance(env, dayAfter)).resolves.toBeUndefined();

    const logged = errors.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
    expect(logged.some((l) => l.level === "error" && l.ownerId === "broken")).toBe(true);
    expect(await count("SELECT COUNT(*) AS n FROM activity_events WHERE id = 'ev-after-failure'")).toBe(0);
    expect(await listBackups(id)).toContain(`backups/${id}/${dayAfter.toISOString().slice(0, 10)}.json`);
    expect(await listBackups("broken")).toEqual([]);
  });

  it("prunes geocoder cache entries older than 90 days (they hold rounded finder coordinates)", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO geocode_cache (key, payload, created_at) VALUES ('rev:old', '{}', ?)").bind(
        ago(91),
      ),
      env.DB.prepare("INSERT INTO geocode_cache (key, payload, created_at) VALUES ('rev:new', '{}', ?)").bind(
        ago(5),
      ),
    ]);
    await runMaintenance(env, new Date());
    expect(await count("SELECT COUNT(*) AS n FROM geocode_cache WHERE key = 'rev:old'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM geocode_cache WHERE key = 'rev:new'")).toBe(1);
  });
});
