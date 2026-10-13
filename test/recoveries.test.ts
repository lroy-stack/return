import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ConversationSummary, Item, ItemDetail, Recovery, RecoveryStatus } from "../src/shared/schemas";
import { api, apiJson } from "./helpers/api";
import { seedForeignOwner } from "./helpers/files";

type Detail = ItemDetail & {
  recoveries: Recovery[];
  recoveryEvents: { recoveryId: string; status: RecoveryStatus; note: string | null; createdAt: string }[];
};
const detail = (id: string) => apiJson<Detail>("GET", `/items/${id}`);

async function lostItem(name: string): Promise<{ item: Item; recovery: Recovery }> {
  const item = await apiJson<Item>("POST", "/items", { name });
  const recovery = await apiJson<Recovery>("POST", `/items/${item.id}/lost`, { lostPlace: "Gate 4" });
  return { item, recovery };
}

const patchStatus = (id: string, status: RecoveryStatus) => api("PATCH", `/recoveries/${id}`, { status });
const itemStatus = async (id: string) => (await apiJson<{ item: Item }>("GET", `/items/${id}`)).item.status;

describe("recoveries", () => {
  it("lists, filters by status and reads one", async () => {
    const { recovery } = await lostItem("Tablet");
    const all = await apiJson<{ recoveries: Recovery[] }>("GET", "/recoveries");
    expect(all.recoveries.map((r) => r.id)).toContain(recovery.id);
    const lost = await apiJson<{ recoveries: Recovery[] }>("GET", "/recoveries?status=lost");
    expect(lost.recoveries.every((r) => r.status === "lost")).toBe(true);
    const closed = await apiJson<{ recoveries: Recovery[] }>("GET", "/recoveries?status=closed");
    expect(closed.recoveries.map((r) => r.id)).not.toContain(recovery.id);
    expect(await apiJson<Recovery>("GET", `/recoveries/${recovery.id}`)).toMatchObject({
      id: recovery.id,
      itemName: "Tablet",
    });
    expect((await api("GET", "/recoveries?status=weird")).status).toBe(422);
  });

  it("walks the happy path lost -> found -> returning -> recovered -> closed", async () => {
    const { item, recovery } = await lostItem("Jacket");
    expect((await patchStatus(recovery.id, "found")).status).toBe(200);
    expect(await itemStatus(item.id)).toBe("lost");
    expect((await patchStatus(recovery.id, "returning")).status).toBe(200);
    const recovered = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, {
      status: "recovered",
      notes: "Handed over at reception",
    });
    expect(recovered).toMatchObject({ status: "recovered" });
    expect(recovered.notes).toMatch(/^\[\d{4}-.*Z\] Handed over at reception$/);
    expect(recovered.recoveredAt).not.toBeNull();
    expect(await itemStatus(item.id)).toBe("normal");
    const closed = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, { status: "closed" });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.recoveredAt).toBe(recovered.recoveredAt);
  });

  it("closing a recovery means the search stopped: the item goes back to normal", async () => {
    const { item, recovery } = await lostItem("Umbrella");
    const closed = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, { status: "closed" });
    expect(closed).toMatchObject({ status: "closed", recoveredAt: null });
    expect(closed.closedAt).not.toBeNull();
    expect(await itemStatus(item.id)).toBe("normal");
    // The item can be archived again and the owner may start a new search later.
    expect((await api("POST", `/items/${item.id}/archive`)).status).toBe(200);
  });

  it("closing a finished recovery does not touch an item that was lost again since", async () => {
    const { item, recovery } = await lostItem("Passport wallet");
    await patchStatus(recovery.id, "recovered");
    const again = await apiJson<Recovery>("POST", `/items/${item.id}/lost`, {});
    expect(again.id).not.toBe(recovery.id);
    await patchStatus(recovery.id, "closed");
    expect(await itemStatus(item.id)).toBe("lost");
  });

  it("lists the statuses a recovery may move to on every recovery", async () => {
    const { item, recovery } = await lostItem("Charger");
    expect(recovery.allowedTransitions).toEqual(["found", "returning", "recovered", "closed"]);
    const found = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, { status: "found" });
    expect(found.allowedTransitions).toEqual(["returning", "recovered", "closed", "lost"]);
    expect((await detail(item.id)).recoveries[0]?.allowedTransitions).toEqual(found.allowedTransitions);
    const { recoveries } = await apiJson<{ recoveries: Recovery[] }>("GET", "/recoveries");
    expect(recoveries.find((r) => r.id === recovery.id)?.allowedTransitions).toEqual(
      found.allowedTransitions,
    );
    const closed = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, { status: "closed" });
    expect(closed.allowedTransitions).toEqual([]);
  });

  it("appends timestamped notes on status changes and replaces them on plain edits", async () => {
    const item = await apiJson<Item>("POST", "/items", { name: "Notebook" });
    const recovery = await apiJson<Recovery>("POST", `/items/${item.id}/lost`, { notes: "Left on the bus" });
    const found = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, {
      status: "found",
      notes: "Driver has it",
    });
    expect(found.notes).toMatch(/^Left on the bus\n\[.*Z\] Driver has it$/);
    const done = await apiJson<{ recovery: Recovery }>("POST", `/items/${item.id}/recovered`, {
      notes: "Picked up",
    });
    expect(done.recovery.notes).toMatch(/^Left on the bus\n\[.*Z\] Driver has it\n\[.*Z\] Picked up$/);
    const edited = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, { notes: "Rewritten" });
    expect(edited.notes).toBe("Rewritten");
  });

  it("records every status change in an ordered timeline on the item detail", async () => {
    const item = await apiJson<Item>("POST", "/items", { name: "Binoculars" });
    const recovery = await apiJson<Recovery>("POST", `/items/${item.id}/lost`, { notes: "Hostel" });
    await patchStatus(recovery.id, "found");
    await apiJson("PATCH", `/recoveries/${recovery.id}`, { status: "returning", notes: "On its way" });
    await apiJson("POST", `/items/${item.id}/recovered`, {});
    await patchStatus(recovery.id, "closed");
    const { recoveryEvents } = await detail(item.id);
    expect(recoveryEvents.map((e) => e.status)).toEqual([
      "lost",
      "found",
      "returning",
      "recovered",
      "closed",
    ]);
    expect(recoveryEvents.every((e) => e.recoveryId === recovery.id)).toBe(true);
    expect(recoveryEvents[0]?.note).toBe("Hostel");
    expect(recoveryEvents[2]?.note).toBe("On its way");
    const times = recoveryEvents.map((e) => e.createdAt);
    expect([...times].sort()).toEqual(times);
  });

  it("hands over the open conversations once an item is recovered", async () => {
    const { item } = await lostItem("Sunglasses");
    const now = new Date().toISOString();
    for (const [id, status] of [
      ["conv-open", "open"],
      ["conv-closed", "closed"],
    ] as const) {
      await env.DB.prepare(
        `INSERT INTO conversations (id, owner_id, item_id, finder_token_hash, subject, status, last_message_at, created_at)
         SELECT ?1, owner_id, ?2, ?1, 'Found it', ?3, ?4, ?4 FROM items WHERE id = ?2`,
      )
        .bind(`${id}-${item.id}`, item.id, status, now)
        .run();
    }
    const done = await apiJson<{ recovery: Recovery; openConversations: ConversationSummary[] }>(
      "POST",
      `/items/${item.id}/recovered`,
      {},
    );
    expect(done.openConversations.map((c) => c.id)).toEqual([`conv-open-${item.id}`]);

    const other = await lostItem("Hat");
    const patched = await apiJson<Recovery & { openConversations: ConversationSummary[] }>(
      "PATCH",
      `/recoveries/${other.recovery.id}`,
      { status: "recovered" },
    );
    expect(patched.openConversations).toEqual([]);
  });

  it("rejects a lost time in the future but tolerates a few minutes of clock skew", async () => {
    const item = await apiJson<Item>("POST", "/items", { name: "Drone" });
    const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
    expect((await api("POST", `/items/${item.id}/lost`, { lostAt: at(60 * 24) })).status).toBe(422);
    const ok = await api("POST", `/items/${item.id}/lost`, { lostAt: at(5) });
    expect(ok.status).toBe(200);
    const { id } = (await ok.json()) as Recovery;
    expect((await api("PATCH", `/recoveries/${id}`, { lostAt: at(60 * 24) })).status).toBe(422);
  });

  it("will not mark an archived item as lost", async () => {
    const item = await apiJson<Item>("POST", "/items", { name: "Old phone" });
    await apiJson("POST", `/items/${item.id}/archive`);
    const res = await api("POST", `/items/${item.id}/lost`, {});
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("item_archived");
  });

  it("allows stepping back found -> lost and returning -> found", async () => {
    const { recovery } = await lostItem("Scarf");
    await patchStatus(recovery.id, "found");
    expect((await patchStatus(recovery.id, "lost")).status).toBe(200);
    await patchStatus(recovery.id, "found");
    await patchStatus(recovery.id, "returning");
    expect((await patchStatus(recovery.id, "found")).status).toBe(200);
  });

  it("rejects illegal transitions with 409 invalid_transition", async () => {
    const { recovery } = await lostItem("Keys");
    await patchStatus(recovery.id, "returning");
    // returning -> lost is not allowed.
    const res = await patchStatus(recovery.id, "lost");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_transition");

    await patchStatus(recovery.id, "recovered");
    expect((await patchStatus(recovery.id, "found")).status).toBe(409);
    expect((await patchStatus(recovery.id, "returning")).status).toBe(409);
    await patchStatus(recovery.id, "closed");
    for (const status of ["lost", "found", "returning", "recovered"] as const) {
      expect((await patchStatus(recovery.id, status)).status, `closed -> ${status}`).toBe(409);
    }
  });

  it("edits details without changing status and validates input", async () => {
    const { recovery } = await lostItem("Camera");
    const edited = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, {
      lostPlace: "Train to Porto",
      notes: "Asked the conductor",
    });
    expect(edited).toMatchObject({
      status: "lost",
      lostPlace: "Train to Porto",
      notes: "Asked the conductor",
    });
    expect((await api("PATCH", `/recoveries/${recovery.id}`, { status: "teleported" })).status).toBe(422);
    expect((await api("PATCH", `/recoveries/${recovery.id}`, { lostAt: "yesterday" })).status).toBe(422);
  });

  it("is invisible to other owners (IDOR)", async () => {
    await seedForeignOwner();
    expect(
      (await apiJson<{ recoveries: Recovery[] }>("GET", "/recoveries")).recoveries.map((r) => r.id),
    ).not.toContain("foreign-recovery");
    expect((await api("GET", "/recoveries/foreign-recovery")).status).toBe(404);
    expect((await patchStatus("foreign-recovery", "closed")).status).toBe(404);
  });
});
