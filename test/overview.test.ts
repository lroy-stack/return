import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Item, Overview, Recovery } from "../src/shared/schemas";
import { apiJson } from "./helpers/api";
import { seedForeignOwner } from "./helpers/files";

describe("overview", () => {
  it("summarises unread conversations, lost items, open recoveries and recent activity", async () => {
    await seedForeignOwner();
    const calm = await apiJson<Item>("POST", "/items", { name: "Calm item" });
    const lost = await apiJson<Item>("POST", "/items", { name: "Lost item" });
    const found = await apiJson<Item>("POST", "/items", { name: "Found item" });
    const done = await apiJson<Item>("POST", "/items", { name: "Done item" });
    await apiJson("POST", `/items/${lost.id}/lost`, {});
    const foundRecovery = await apiJson<Recovery>("POST", `/items/${found.id}/lost`, {});
    await apiJson("PATCH", `/recoveries/${foundRecovery.id}`, { status: "found" });
    await apiJson("POST", `/items/${done.id}/lost`, {});
    await apiJson("POST", `/items/${done.id}/recovered`, {});

    const owner = await env.DB.prepare("SELECT id FROM owners WHERE email = 'owner@example.test'").first<{
      id: string;
    }>();
    const t = "2026-03-01T10:00:00.000Z";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, item_id, finder_token_hash, subject, status, last_message_at, created_at)
         VALUES ('c-unread', ?1, ?2, 'h1', 'Found your bag', 'open', ?3, ?3)`,
      ).bind(owner?.id, lost.id, t),
      env.DB.prepare(
        "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('m1', 'c-unread', 'finder', 'Hi', ?)",
      ).bind(t),
      env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, item_id, finder_token_hash, subject, status, owner_read_at, last_message_at, created_at)
         VALUES ('c-read', ?1, ?2, 'h2', 'Already read', 'open', '2026-03-02T00:00:00.000Z', ?3, ?3)`,
      ).bind(owner?.id, lost.id, t),
      env.DB.prepare(
        "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('m2', 'c-read', 'finder', 'Hi', ?)",
      ).bind(t),
      env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, item_id, finder_token_hash, subject, status, last_message_at, created_at)
         VALUES ('c-closed', ?1, ?2, 'h3', 'Closed one', 'closed', ?3, ?3)`,
      ).bind(owner?.id, lost.id, t),
      env.DB.prepare(
        "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('m3', 'c-closed', 'finder', 'Hi', ?)",
      ).bind(t),
      env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, finder_token_hash, subject, status, last_message_at, created_at)
         VALUES ('c-foreign', 'foreign', 'h4', 'Foreign', 'open', ?1, ?1)`,
      ).bind(t),
      env.DB.prepare(
        "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('m4', 'c-foreign', 'finder', 'Hi', ?)",
      ).bind(t),
    ]);

    const overview = await apiJson<Overview>("GET", "/overview");
    expect(overview.unreadConversations.map((c) => c.id)).toEqual(["c-unread"]);
    expect(overview.lostItems.map((i) => i.name).sort()).toEqual(["Found item", "Lost item"]);
    expect(overview.lostItems.map((i) => i.id)).not.toContain(calm.id);
    expect(overview.openRecoveries.map((r) => r.itemName).sort()).toEqual(["Found item", "Lost item"]);
    expect(overview.recentActivity.length).toBeLessThanOrEqual(20);
    expect(overview.recentActivity.length).toBeGreaterThan(0);
    expect(overview.recentActivity.map((e) => e.id)).not.toContain("foreign-event");
  });

  it("drops an item from lost items and open recoveries once its search is closed", async () => {
    const item = await apiJson<Item>("POST", "/items", { name: "Abandoned search" });
    const recovery = await apiJson<Recovery>("POST", `/items/${item.id}/lost`, {});
    let overview = await apiJson<Overview>("GET", "/overview");
    expect(overview.lostItems.map((i) => i.id)).toContain(item.id);
    await apiJson("PATCH", `/recoveries/${recovery.id}`, { status: "closed" });
    overview = await apiJson<Overview>("GET", "/overview");
    expect(overview.lostItems.map((i) => i.id)).not.toContain(item.id);
    expect(overview.openRecoveries.map((r) => r.id)).not.toContain(recovery.id);
  });

  it("caps recent activity at 20", async () => {
    for (let i = 0; i < 22; i++) await apiJson("POST", "/items", { name: `Bulk ${i}` });
    const overview = await apiJson<Overview>("GET", "/overview");
    expect(overview.recentActivity).toHaveLength(20);
  });
});
