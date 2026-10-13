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
