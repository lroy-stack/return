import { describe, expect, it } from "vitest";
import type { Item, Tracker } from "../src/shared/schemas";
import { api, apiJson } from "./helpers/api";
import { seedForeignOwner } from "./helpers/files";

const newItem = (name: string) => apiJson<Item>("POST", "/items", { name });

describe("trackers", () => {
  it("creates, lists by item, patches without resetting omitted fields, and deletes", async () => {
    const item = await newItem("Suitcase");
    const tracker = await apiJson<Tracker>("POST", "/trackers", {
      itemId: item.id,
      kind: "smarttag",
      name: "Samsung tag",
    });
    expect(tracker).toMatchObject({ itemId: item.id, kind: "smarttag", name: "Samsung tag" });

    const patched = await apiJson<Tracker>("PATCH", `/trackers/${tracker.id}`, {
      lastLocationText: "Gate 12",
      notes: "",
    });
    expect(patched).toMatchObject({
      kind: "smarttag",
      name: "Samsung tag",
      lastLocationText: "Gate 12",
      notes: null,
    });

    const detached = await apiJson<Tracker>("PATCH", `/trackers/${tracker.id}`, { itemId: null });
    expect(detached.itemId).toBeNull();

    await apiJson("PATCH", `/trackers/${tracker.id}`, { itemId: item.id });
    const list = await apiJson<{ trackers: Tracker[] }>("GET", `/trackers?itemId=${item.id}`);
    expect(list.trackers.map((t) => t.id)).toEqual([tracker.id]);

    expect((await api("DELETE", `/trackers/${tracker.id}`)).status).toBe(204);
    expect((await api("DELETE", `/trackers/${tracker.id}`)).status).toBe(404);
  });

  it("defaults the kind to airtag and validates input", async () => {
    const tracker = await apiJson<Tracker>("POST", "/trackers", { name: "Loose tag" });
    expect(tracker.kind).toBe("airtag");
    expect((await api("POST", "/trackers", { name: "" })).status).toBe(422);
    expect((await api("POST", "/trackers", { name: "x", kind: "gps-brick" })).status).toBe(422);
    expect((await api("PATCH", `/trackers/${tracker.id}`, { kind: "gps-brick" })).status).toBe(422);
  });

  it("is invisible to other owners and refuses foreign items (IDOR)", async () => {
    await seedForeignOwner();
    const mine = await newItem("Mine");
    const own = await apiJson<Tracker>("POST", "/trackers", { name: "Own", itemId: mine.id });
    expect(
      (await apiJson<{ trackers: Tracker[] }>("GET", "/trackers")).trackers.map((t) => t.id),
    ).not.toContain("foreign-tracker");
    expect((await api("PATCH", "/trackers/foreign-tracker", { name: "Hijack" })).status).toBe(404);
    expect((await api("DELETE", "/trackers/foreign-tracker")).status).toBe(404);
    expect((await api("POST", "/trackers", { name: "x", itemId: "foreign-item" })).status).toBe(404);
    expect((await api("PATCH", `/trackers/${own.id}`, { itemId: "foreign-item" })).status).toBe(404);
  });
});
