import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Item, ItemDetail, ItemSummary, Recovery } from "../src/shared/schemas";
import { api, apiJson } from "./helpers/api";

const newItem = (name: string, extra: Record<string, unknown> = {}) =>
  apiJson<Item>("POST", "/items", { name, category: "backpack", ...extra });

describe("inventory", () => {
  it("creates, reads, updates and lists items", async () => {
    const item = await newItem("Grey backpack", {
      brand: "Osprey",
      serialNumber: "SN-123",
      estimatedValueCents: 18900,
    });
    expect(item).toMatchObject({
      name: "Grey backpack",
      brand: "Osprey",
      status: "normal",
      serialNumber: "SN-123",
    });

    const updated = await apiJson<Item>("PATCH", `/items/${item.id}`, { model: "Farpoint 40", brand: "" });
    expect(updated.model).toBe("Farpoint 40");
    expect(updated.brand).toBeNull();

    const detail = await apiJson<ItemDetail>("GET", `/items/${item.id}`);
    expect(detail.item.id).toBe(item.id);
    expect(detail.tags).toEqual([]);

    const { items } = await apiJson<{ items: ItemSummary[] }>("GET", "/items?q=farpoint");
    expect(items.map((i) => i.id)).toContain(item.id);
  });

  it("keeps fields that a PATCH does not mention (no schema defaults on update)", async () => {
    const item = await newItem("Camera bag", { category: "camera" });
    const updated = await apiJson<Item>("PATCH", `/items/${item.id}`, { description: "Black, padded" });
    expect(updated.category).toBe("camera");
  });

  it("validates input", async () => {
    const res = await api("POST", "/items", { name: "", category: "spaceship" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_failed");
  });

  it("treats LIKE wildcards in search literally", async () => {
    await newItem("Wildcard test 100%");
    const { items } = await apiJson<{ items: ItemSummary[] }>("GET", "/items?q=%25");
    expect(items.every((i) => i.name.includes("%"))).toBe(true);
  });

  it("nests contents and rejects cycles", async () => {
    const bag = await newItem("Suitcase");
    const pouch = await newItem("Cable pouch", { parentId: bag.id });
    const detail = await apiJson<ItemDetail>("GET", `/items/${bag.id}`);
    expect(detail.children.map((c) => c.id)).toEqual([pouch.id]);
    const res = await api("PATCH", `/items/${bag.id}`, { parentId: pouch.id });
    expect(res.status).toBe(422);
  });

  it("archives, then deletes only with typed confirmation", async () => {
    const item = await newItem("Old headphones");
    expect((await api("DELETE", `/items/${item.id}`, { confirmName: "Old headphones" })).status).toBe(409);
    await apiJson("POST", `/items/${item.id}/archive`);
    const { items } = await apiJson<{ items: ItemSummary[] }>("GET", "/items");
    expect(items.map((i) => i.id)).not.toContain(item.id);
    expect((await api("DELETE", `/items/${item.id}`, { confirmName: "wrong" })).status).toBe(422);
    expect((await api("DELETE", `/items/${item.id}`, { confirmName: "Old headphones" })).status).toBe(204);
    expect((await api("GET", `/items/${item.id}`)).status).toBe(404);
  });

  it("takes an item out of its container with parentId null", async () => {
    const bag = await newItem("Duffel");
    const pouch = await newItem("Toiletries", { parentId: bag.id });
    const moved = await apiJson<Item>("PATCH", `/items/${pouch.id}`, { parentId: null });
    expect(moved.parentId).toBeNull();
    expect((await apiJson<ItemDetail>("GET", `/items/${bag.id}`)).children).toEqual([]);
  });

  it("searches without regard to case or accents", async () => {
    const scarf = await newItem("Écharpe", { description: "Laine mérinos", serialNumber: "Ñandú-7" });
    const german = await newItem("Münchner Schlüssel", { brand: "Straße" });
    const find = async (q: string) =>
      (await apiJson<{ items: ItemSummary[] }>("GET", `/items?q=${encodeURIComponent(q)}`)).items.map(
        (i) => i.id,
      );
    for (const q of ["écharpe", "ÉCHARPE", "echarpe", "ECHARPE", "merinos", "nandu-7", "ÑANDÚ"]) {
      expect(await find(q), q).toContain(scarf.id);
    }
    expect(await find("munchner schlussel")).toContain(german.id);
    expect(await find("STRASSE")).toContain(german.id);
    // Transliterations are not folded: "ue" is not "ü".
    expect(await find("muenchner")).not.toContain(german.id);
    // A query never matches across two fields.
    expect(await find("echarpe laine")).not.toContain(scarf.id);
  });

  it("keeps the search index in step with edits", async () => {
    const item = await newItem("Parapluie");
    await apiJson("PATCH", `/items/${item.id}`, { name: "Ceinture", brand: "Hermès" });
    const find = async (q: string) =>
      (await apiJson<{ items: ItemSummary[] }>("GET", `/items?q=${q}`)).items.map((i) => i.id);
    expect(await find("parapluie")).not.toContain(item.id);
    expect(await find("hermes")).toContain(item.id);
    await apiJson("PATCH", `/items/${item.id}`, { brand: null });
    expect(await find("hermes")).not.toContain(item.id);
    expect(await find("ceinture")).toContain(item.id);
  });

  it("fills in the search text of rows that predate it, a bounded batch per search", async () => {
    const item = await newItem("Sacoche");
    await env.DB.prepare("UPDATE items SET search_text = NULL WHERE id = ?").bind(item.id).run();
    const { items } = await apiJson<{ items: ItemSummary[] }>("GET", "/items?q=SACOCHE");
    expect(items.map((i) => i.id)).toContain(item.id);
    const row = await env.DB.prepare("SELECT search_text FROM items WHERE id = ?")
      .bind(item.id)
      .first<{ search_text: string }>();
    expect(row?.search_text).toBe("sacoche");
  });

  it("rejects acquisition dates in the future", async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    expect((await api("POST", "/items", { name: "Time capsule", acquiredOn: tomorrow })).status).toBe(422);
    const item = await newItem("Fresh buy", { acquiredOn: today });
    expect(item.acquiredOn).toBe(today);
    expect((await api("PATCH", `/items/${item.id}`, { acquiredOn: "2099-01-01" })).status).toBe(422);
  });

  it("refuses to archive a lost item, with a way out", async () => {
    const item = await newItem("Lost wallet", { category: "wallet" });
    const recovery = await apiJson<Recovery>("POST", `/items/${item.id}/lost`, {});
    const res = await api("POST", `/items/${item.id}/archive`);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("item_lost");
    expect(body.error.message).toContain("Mark it as recovered or close the search first");
    expect((await apiJson<ItemDetail>("GET", `/items/${item.id}`)).item.archivedAt).toBeNull();

    await apiJson("PATCH", `/recoveries/${recovery.id}`, { status: "closed" });
    const archived = await apiJson<Item>("POST", `/items/${item.id}/archive`);
    expect(archived.archivedAt).not.toBeNull();
    expect((await apiJson<Item>("POST", `/items/${item.id}/unarchive`)).archivedAt).toBeNull();
  });

  it("compares the typed delete confirmation with whitespace collapsed on both sides", async () => {
    const item = await newItem("Zoë  double  space");
    await apiJson("POST", `/items/${item.id}/archive`);
    expect((await api("DELETE", `/items/${item.id}`, { confirmName: "zoë double space" })).status).toBe(422);
    expect((await api("DELETE", `/items/${item.id}`, { confirmName: "  Zoë double space \n" })).status).toBe(
      204,
    );
  });

  it("declares an item lost and recovered", async () => {
    const item = await newItem("Laptop", { category: "laptop" });
    const recovery = await apiJson<Recovery>("POST", `/items/${item.id}/lost`, {
      lostPlace: "Lisbon airport",
    });
    expect(recovery).toMatchObject({ status: "lost", lostPlace: "Lisbon airport", itemId: item.id });
    expect((await apiJson<ItemDetail>("GET", `/items/${item.id}`)).item.status).toBe("lost");

    const { recovery: done } = await apiJson<{ recovery: Recovery }>(
      "POST",
      `/items/${item.id}/recovered`,
      {},
    );
    expect(done.status).toBe("recovered");
    expect((await apiJson<ItemDetail>("GET", `/items/${item.id}`)).item.status).toBe("normal");
  });

  it("never returns another owner's item (IDOR)", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO owners (id, email, created_at) VALUES ('other', 'other@example.test', '2026-01-01')",
      ),
      env.DB.prepare(
        `INSERT INTO items (id, owner_id, name, created_at, updated_at)
         VALUES ('foreign-item', 'other', 'Not yours', '2026-01-01', '2026-01-01')`,
      ),
    ]);
    expect((await api("GET", "/items/foreign-item")).status).toBe(404);
    expect((await api("PATCH", "/items/foreign-item", { name: "Mine now" })).status).toBe(404);
    expect((await api("POST", "/items/foreign-item/lost", {})).status).toBe(404);
    const { items } = await apiJson<{ items: ItemSummary[] }>("GET", "/items?q=Not yours");
    expect(items).toEqual([]);
  });
});
