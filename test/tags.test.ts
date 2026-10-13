import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { Item, Tag, TagVerification } from "../src/shared/schemas";
import type { Settings } from "../src/shared/settings";
import { api, apiJson } from "./helpers/api";
import { seedForeignOwner } from "./helpers/files";

const newItem = (name: string) => apiJson<Item>("POST", "/items", { name });
const newTags = (body: Record<string, unknown> = {}) => apiJson<{ tags: Tag[] }>("POST", "/tags", body);

describe("tags", () => {
  it("creates 50 unique, well-formed tokens with sequential labels", async () => {
    const { tags } = await newTags({ count: 50 });
    expect(tags).toHaveLength(50);
    const tokens = new Set(tags.map((t) => t.token));
    expect(tokens.size).toBe(50);
    for (const t of tags) expect(t.token).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
    expect(tags.map((t) => t.label)).toEqual(
      Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(3, "0")),
    );
    expect(tags[0]?.url).toBe(`https://return.test/t/${tags[0]?.token}`);
    expect(tags.every((t) => t.status === "active" && t.itemId === null)).toBe(true);
  });

  it("validates the count", async () => {
    expect((await api("POST", "/tags", { count: 0 })).status).toBe(422);
    expect((await api("POST", "/tags", { count: 51 })).status).toBe(422);
    expect((await api("POST", "/tags", { count: 1.5 })).status).toBe(422);
  });

  it("assigns a tag to an owned item at creation and lists by item and status", async () => {
    const item = await newItem("Passport pouch");
    const { tags } = await newTags({ itemId: item.id, note: "inside flap" });
    expect(tags[0]).toMatchObject({ itemId: item.id, itemName: "Passport pouch", note: "inside flap" });
    const byItem = await apiJson<{ tags: Tag[] }>("GET", `/tags?itemId=${item.id}`);
    expect(byItem.tags.map((t) => t.id)).toEqual([tags[0]?.id]);
    const revoked = await apiJson<{ tags: Tag[] }>("GET", "/tags?status=revoked");
    expect(revoked.tags.every((t) => t.status === "revoked")).toBe(true);
    expect((await api("GET", "/tags?status=bogus")).status).toBe(422);
  });

  it("assigns and unassigns an item with PATCH", async () => {
    const item = await newItem("Camera");
    const [tag] = (await newTags()).tags;
    const assigned = await apiJson<Tag>("PATCH", `/tags/${tag?.id}`, {
      itemId: item.id,
      nfcStatus: "programmed",
    });
    expect(assigned).toMatchObject({ itemId: item.id, nfcStatus: "programmed" });
    const cleared = await apiJson<Tag>("PATCH", `/tags/${tag?.id}`, { itemId: null });
    expect(cleared.itemId).toBeNull();
    expect(cleared.nfcStatus).toBe("programmed");
  });

  it("revokes idempotently and keeps revoked tags frozen except for the note", async () => {
    const item = await newItem("Laptop sleeve");
    const [tag] = (await newTags({ itemId: item.id })).tags;
    const first = await apiJson<Tag>("POST", `/tags/${tag?.id}/revoke`);
    expect(first.status).toBe("revoked");
    expect(first.revokedAt).not.toBeNull();
    const second = await apiJson<Tag>("POST", `/tags/${tag?.id}/revoke`);
    expect(second.revokedAt).toBe(first.revokedAt);

    expect((await api("PATCH", `/tags/${tag?.id}`, { itemId: null })).status).toBe(409);
    expect((await api("PATCH", `/tags/${tag?.id}`, { nfcStatus: "verified" })).status).toBe(409);
    const noted = await apiJson<Tag>("PATCH", `/tags/${tag?.id}`, { note: "lost in Lisbon" });
    expect(noted).toMatchObject({ note: "lost in Lisbon", status: "revoked" });
    const { activityTypes } = await activityFor(tag?.id ?? "");
    expect(activityTypes.filter((type) => type === "tag.revoked")).toHaveLength(1);
  });

  it("replaces a tag with a new token for the same item and never reuses the old one", async () => {
    const item = await newItem("Duffel");
    const [old] = (await newTags({ itemId: item.id })).tags;
    const { tag: fresh } = await apiJson<{ tag: Tag }>("POST", `/tags/${old?.id}/replace`);
    expect(fresh.itemId).toBe(item.id);
    expect(fresh.status).toBe("active");
    expect(fresh.token).not.toBe(old?.token);
    expect(fresh.seq).toBeGreaterThan(old?.seq ?? 0);

    const { tags } = await apiJson<{ tags: Tag[] }>("GET", `/tags?itemId=${item.id}`);
    const oldNow = tags.find((t) => t.id === old?.id);
    expect(oldNow).toMatchObject({ status: "revoked", replacedBy: fresh.id, token: old?.token });
    expect((await api("POST", `/tags/${old?.id}/replace`)).status).toBe(409);
  });

  it("exports an NFC list with RFC 4180 quoting and a formula-injection guard", async () => {
    const evil = await newItem('=HYPERLINK("http://evil.test","x")');
    const comma = await newItem('Bag, "large"');
    const dash = await newItem("-2+3");
    await newTags({ itemId: evil.id });
    await newTags({ itemId: comma.id });
    await newTags({ itemId: dash.id });
    const res = await api("GET", "/tags/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const csv = await res.text();
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("label,item,url,status,nfc_status");
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.test"",""x"")"`);
    expect(csv).toContain(`"Bag, ""large"""`);
    expect(csv).toContain(",'-2+3,");
    for (const line of lines.slice(1)) expect(line).toMatch(/https:\/\/return\.test\/t\/[0-9a-z]{26}/);
  });

  it("serves a QR code as an SVG attachment", async () => {
    const [tag] = (await newTags()).tags;
    const res = await api("GET", `/tags/${tag?.id}/qr.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Disposition")).toContain(`${tag?.label}.svg`);
    expect(await res.text()).toMatch(/^<svg[^>]*>.*<\/svg>$/s);
  });

  it("verifies a tag and lists concrete problems", async () => {
    const item = await newItem("Wallet");
    const [tag] = (await newTags({ itemId: item.id })).tags;
    const [loose] = (await newTags()).tags;
    const settings = await apiJson<Settings>("GET", "/settings");

    const noEmail = await apiJson<TagVerification>("GET", `/tags/${tag?.id}/verify`);
    expect(noEmail).toMatchObject({ ok: false, problems: ["no_contact_method"], url: tag?.url });

    await apiJson("PUT", "/settings", {
      ...settings,
      contact: { ...settings.contact, email: "me@example.test" },
    });
    expect(await apiJson<TagVerification>("GET", `/tags/${tag?.id}/verify`)).toMatchObject({
      ok: true,
      problems: [],
    });
    expect((await apiJson<TagVerification>("GET", `/tags/${loose?.id}/verify`)).problems).toEqual([
      "unassigned",
    ]);

    await apiJson("POST", `/items/${item.id}/archive`);
    await apiJson("POST", `/tags/${tag?.id}/revoke`);
    const bad = await apiJson<TagVerification>("GET", `/tags/${tag?.id}/verify`);
    expect(bad.ok).toBe(false);
    expect(bad.problems).toEqual(["revoked", "item_archived"]);
  });

  it("numbers labels with the configured prefix and digits", async () => {
    const settings = await apiJson<Settings>("GET", "/settings");
    await apiJson("PUT", "/settings", {
      ...settings,
      tags: { ...settings.tags, labelPrefix: "RT-", labelDigits: 5 },
    });
    const [tag] = (await newTags()).tags;
    expect(tag?.label).toBe(`RT-${String(tag?.seq).padStart(5, "0")}`);
  });

  it("hides another owner's tags and refuses foreign items (IDOR)", async () => {
    await seedForeignOwner();
    const mine = await newItem("Mine");
    expect((await apiJson<{ tags: Tag[] }>("GET", "/tags")).tags.map((t) => t.id)).not.toContain(
      "foreign-tag",
    );
    for (const [method, path] of [
      ["PATCH", "/tags/foreign-tag"],
      ["POST", "/tags/foreign-tag/revoke"],
      ["POST", "/tags/foreign-tag/replace"],
      ["GET", "/tags/foreign-tag/qr.svg"],
      ["GET", "/tags/foreign-tag/verify"],
    ] as const) {
      const res = await api(method, path, method === "GET" ? undefined : {});
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    expect((await api("POST", "/tags", { itemId: "foreign-item" })).status).toBe(404);
    expect(
      (await api("PATCH", `/tags/${(await newTags()).tags[0]?.id}`, { itemId: "foreign-item" })).status,
    ).toBe(404);
    const csv = await (await api("GET", "/tags/export.csv")).text();
    expect(csv).not.toContain("zzzzzzzzzzzzzzzzzzzzzzzzzz");
    expect(mine.id).toBeTruthy();
  });

  it("records one aggregated tag.created event per request", async () => {
    const before = await apiJson<{ events: { type: string }[] }>("GET", "/activity?limit=100");
    const createdBefore = before.events.filter((e) => e.type === "tag.created").length;
    const { tags } = await newTags({ count: 7 });
    const after = await apiJson<{
      events: { type: string; data: { count?: number; tagIds?: string[] } | null }[];
    }>("GET", "/activity?limit=100");
    const created = after.events.filter((e) => e.type === "tag.created");
    expect(created).toHaveLength(createdBefore + 1);
    expect(created[0]?.data).toMatchObject({ count: 7, tagIds: tags.map((t) => t.id) });
  });

  it("refuses to replace a revoked or already replaced tag", async () => {
    const [revoked] = (await newTags()).tags;
    await apiJson("POST", `/tags/${revoked?.id}/revoke`);
    const res = await api("POST", `/tags/${revoked?.id}/replace`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("tag_revoked");
    const [live] = (await newTags()).tags;
    await apiJson("POST", `/tags/${live?.id}/replace`);
    expect((await api("POST", `/tags/${live?.id}/replace`)).status).toBe(409);
  });

  it("turns a UNIQUE(owner_id, seq) conflict into 409 conflict", async () => {
    const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
    await env.DB.prepare(
      `INSERT INTO tags (id, owner_id, token, seq, label, created_at) VALUES ('seq-high', ?, 'seqhighseqhighseqhighseqhi0', 9998, '9998', '2026-01-01T00:00:00.000Z')`,
    )
      .bind(ownerId)
      .run();
    await env.DB.exec(
      "CREATE TRIGGER tags_force_conflict BEFORE INSERT ON tags WHEN NEW.seq = 9999 BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: tags.owner_id, tags.seq'); END",
    );
    try {
      const res = await api("POST", "/tags", { count: 1 });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("conflict");
    } finally {
      await env.DB.exec("DROP TRIGGER tags_force_conflict");
    }
  });
});

async function activityFor(tagId: string): Promise<{ activityTypes: string[] }> {
  const { events } = await apiJson<{ events: { type: string; tagId: string | null }[] }>(
    "GET",
    "/activity?limit=100",
  );
  return { activityTypes: events.filter((e) => e.tagId === tagId).map((e) => e.type) };
}
