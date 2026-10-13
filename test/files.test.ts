import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { FileMeta, Item } from "../src/shared/schemas";
import { api, apiJson } from "./helpers/api";
import { JPEG_BYTES, PDF_BYTES, PNG_BYTES, seedForeignOwner, upload, WEBP_BYTES } from "./helpers/files";

const newItem = (name = "Backpack") => apiJson<Item>("POST", "/items", { name });

async function uploadOk(
  itemId: string,
  kind: string,
  bytes: Uint8Array,
  filename = "f.bin",
): Promise<FileMeta> {
  const res = await upload({ itemId, kind, bytes, filename });
  if (res.status !== 201) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as FileMeta;
}

describe("files", () => {
  it("stores a photo in R2 under the owner/item prefix and streams it back", async () => {
    const item = await newItem();
    const meta = await uploadOk(item.id, "photo", PNG_BYTES, "../../my pic.png");
    expect(meta).toMatchObject({
      itemId: item.id,
      kind: "photo",
      contentType: "image/png",
      filename: "my pic.png",
    });
    expect(meta.url).toBe(`/api/files/${meta.id}`);

    const row = await env.DB.prepare("SELECT r2_key FROM item_files WHERE id = ?")
      .bind(meta.id)
      .first<{ r2_key: string }>();
    expect(row?.r2_key).toMatch(new RegExp(`^owners/[^/]+/items/${item.id}/${meta.id}$`));
    expect(await env.FILES.head(row?.r2_key ?? "")).not.toBeNull();

    const res = await api("GET", `/files/${meta.id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG_BYTES);
  });

  it("serves documents as attachments with a UTF-8 filename", async () => {
    const item = await newItem();
    const meta = await uploadOk(item.id, "document", PDF_BYTES, "Rechnung Größe.pdf");
    expect(meta.contentType).toBe("application/pdf");
    const res = await api("GET", `/files/${meta.id}`);
    expect(res.headers.get("Content-Disposition")).toContain("attachment; ");
    expect(res.headers.get("Content-Disposition")).toContain(
      "filename*=UTF-8''Rechnung%20Gr%C3%B6%C3%9Fe.pdf",
    );
    await res.arrayBuffer();
  });

  it("detects the real type: webp and jpeg photos pass, the client content-type is ignored", async () => {
    const item = await newItem();
    const res = await upload({
      itemId: item.id,
      kind: "photo",
      bytes: JPEG_BYTES,
      type: "image/png",
      filename: "a.png",
    });
    expect(((await res.json()) as FileMeta).contentType).toBe("image/jpeg");
    expect((await uploadOk(item.id, "photo", WEBP_BYTES)).contentType).toBe("image/webp");
  });

  it("rejects content that is not what the client claims (magic bytes)", async () => {
    const item = await newItem();
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const spoofed = await upload({
      itemId: item.id,
      kind: "photo",
      bytes: html,
      type: "image/png",
      filename: "x.png",
    });
    expect(spoofed.status).toBe(415);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(
      (await upload({ itemId: item.id, kind: "document", bytes: svg, type: "application/pdf" })).status,
    ).toBe(415);
    // A PDF is a document format, not a photo; webp is not an accepted document format.
    expect(
      (await upload({ itemId: item.id, kind: "photo", bytes: PDF_BYTES, type: "image/jpeg" })).status,
    ).toBe(415);
    expect((await upload({ itemId: item.id, kind: "document", bytes: WEBP_BYTES })).status).toBe(415);
    const { count } = (await env.DB.prepare("SELECT COUNT(*) AS count FROM item_files WHERE item_id = ?")
      .bind(item.id)
      .first<{ count: number }>()) ?? { count: -1 };
    expect(count).toBe(0);
  });

  it("enforces size limits per kind", async () => {
    const item = await newItem();
    const bigPhoto = new Uint8Array(8 * 1024 * 1024 + 1);
    bigPhoto.set(PNG_BYTES);
    expect((await upload({ itemId: item.id, kind: "photo", bytes: bigPhoto })).status).toBe(413);
    const bigDoc = new Uint8Array(20 * 1024 * 1024 + 1);
    bigDoc.set(PDF_BYTES);
    expect((await upload({ itemId: item.id, kind: "document", bytes: bigDoc })).status).toBe(413);
    // A 9 MB PDF is fine as a document (limit 20 MB).
    const okDoc = new Uint8Array(9 * 1024 * 1024);
    okDoc.set(PDF_BYTES);
    expect((await upload({ itemId: item.id, kind: "document", bytes: okDoc })).status).toBe(201);
  });

  it("validates the form fields", async () => {
    const item = await newItem();
    expect((await upload({ kind: "photo", bytes: PNG_BYTES })).status).toBe(422);
    expect((await upload({ itemId: item.id, kind: "video", bytes: PNG_BYTES })).status).toBe(422);
    expect((await upload({ itemId: item.id, kind: "photo" })).status).toBe(422);
    expect((await upload({ itemId: item.id, kind: "photo", bytes: new Uint8Array(0) })).status).toBe(422);
  });

  it("deletes the object and row, and clears the public photo", async () => {
    const item = await newItem();
    const meta = await uploadOk(item.id, "photo", PNG_BYTES);
    await apiJson("PUT", `/items/${item.id}/public-photo`, { fileId: meta.id });
    const key = (
      await env.DB.prepare("SELECT r2_key FROM item_files WHERE id = ?")
        .bind(meta.id)
        .first<{ r2_key: string }>()
    )?.r2_key;
    expect((await api("DELETE", `/files/${meta.id}`)).status).toBe(204);
    expect(await env.FILES.head(key ?? "")).toBeNull();
    expect((await api("GET", `/files/${meta.id}`)).status).toBe(404);
    const refreshed = await apiJson<{ item: Item }>("GET", `/items/${item.id}`);
    expect(refreshed.item.publicPhotoId).toBeNull();
  });

  it("is invisible to other owners (IDOR)", async () => {
    await seedForeignOwner();
    expect((await api("GET", "/files/foreign-file")).status).toBe(404);
    expect((await api("DELETE", "/files/foreign-file")).status).toBe(404);
    expect(await env.FILES.head("owners/foreign/items/foreign-item/foreign-file")).not.toBeNull();
    expect((await upload({ itemId: "foreign-item", kind: "photo", bytes: PNG_BYTES })).status).toBe(404);
    expect((await upload({ itemId: "missing", kind: "photo", bytes: PNG_BYTES })).status).toBe(404);
  });

  it("rejects uploads without a same-origin Origin header", async () => {
    const res = await api("POST", "/files", undefined, { origin: "https://evil.test" });
    expect(res.status).toBe(403);
  });

  it("requires Content-Length (411) and refuses oversized declarations (413) before parsing", async () => {
    const item = await newItem();
    expect(
      (await upload({ itemId: item.id, kind: "photo", bytes: PNG_BYTES, contentLength: null })).status,
    ).toBe(411);
    const tooBig = 20 * 1024 * 1024 + 64 * 1024 + 1;
    expect(
      (await upload({ itemId: item.id, kind: "photo", bytes: PNG_BYTES, contentLength: tooBig })).status,
    ).toBe(413);
    // The declared size must also fit the kind: photos allow 8 MB + 64 KB.
    const photoTooBig = 8 * 1024 * 1024 + 64 * 1024 + 1;
    expect(
      (await upload({ itemId: item.id, kind: "photo", bytes: PNG_BYTES, contentLength: photoTooBig })).status,
    ).toBe(413);
  });

  it("never serves an unlisted content type inline and never serves keys outside the owner prefix", async () => {
    const item = await newItem();
    const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
    const t = "2026-01-01T00:00:00.000Z";
    const own = `owners/${ownerId}/items/${item.id}/evil`;
    await env.FILES.put(own, "<script>alert(1)</script>");
    await env.FILES.put("backups/someone-else/2026-01-01.json", "{}");
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO item_files (id, owner_id, item_id, kind, r2_key, filename, content_type, size_bytes, created_at)
         VALUES ('evil', ?1, ?2, 'photo', ?3, 'x.html', 'text/html', 25, ?4)`,
      ).bind(ownerId, item.id, own, t),
      env.DB.prepare(
        `INSERT INTO item_files (id, owner_id, item_id, kind, r2_key, filename, content_type, size_bytes, created_at)
         VALUES ('stolen', ?1, ?2, 'document', 'backups/someone-else/2026-01-01.json', 'b.json', 'application/pdf', 2, ?3)`,
      ).bind(ownerId, item.id, t),
    ]);
    const res = await api("GET", "/files/evil");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    await res.arrayBuffer();
    expect((await api("GET", "/files/stolen")).status).toBe(404);
    expect((await api("DELETE", "/files/stolen")).status).toBe(204);
    expect(await env.FILES.head("backups/someone-else/2026-01-01.json")).not.toBeNull();
  });

  it("removes database rows even when R2 deletion fails (file and item deletes)", async () => {
    const item = await newItem("Doomed");
    const meta = await uploadOk(item.id, "photo", PNG_BYTES);
    const failing = vi.spyOn(env.FILES, "delete").mockRejectedValue(new Error("r2 down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await api("DELETE", `/files/${meta.id}`)).status).toBe(204);
      expect((await api("GET", `/files/${meta.id}`)).status).toBe(404);
      const second = await uploadOk(item.id, "photo", PNG_BYTES);
      await apiJson("POST", `/items/${item.id}/archive`);
      expect((await api("DELETE", `/items/${item.id}`, { confirmName: "Doomed" })).status).toBe(204);
      expect((await api("GET", `/files/${second.id}`)).status).toBe(404);
      const logged = quiet.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
      expect(logged.some((l) => l.level === "error" && String(l.msg).includes("r2"))).toBe(true);
    } finally {
      failing.mockRestore();
      quiet.mockRestore();
    }
  });
});
