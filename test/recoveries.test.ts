import { describe, expect, it } from "vitest";
import type { Item, Recovery, RecoveryStatus } from "../src/shared/schemas";
import { api, apiJson } from "./helpers/api";
import { seedForeignOwner } from "./helpers/files";

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
    expect(recovered).toMatchObject({ status: "recovered", notes: "Handed over at reception" });
    expect(recovered.recoveredAt).not.toBeNull();
    expect(await itemStatus(item.id)).toBe("normal");
    const closed = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, { status: "closed" });
    expect(closed.closedAt).not.toBeNull();
    expect(closed.recoveredAt).toBe(recovered.recoveredAt);
  });

  it("closing a lost recovery leaves the item lost", async () => {
    const { item, recovery } = await lostItem("Umbrella");
    const closed = await apiJson<Recovery>("PATCH", `/recoveries/${recovery.id}`, { status: "closed" });
    expect(closed).toMatchObject({ status: "closed", recoveredAt: null });
    expect(closed.closedAt).not.toBeNull();
    expect(await itemStatus(item.id)).toBe("lost");
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
