import { env } from "cloudflare:workers";
import { APP, accessJwt, worker } from "./auth";

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
export const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
export const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n%test\n");
export const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

/** Multipart upload as the browser would send it (Origin + Access JWT). */
export async function upload(fields: {
  itemId?: string;
  kind?: string;
  bytes?: Uint8Array;
  filename?: string;
  type?: string;
  email?: string;
  /** Declared Content-Length: omitted = real size, null = header not sent. */
  contentLength?: number | null;
}): Promise<Response> {
  const form = new FormData();
  if (fields.itemId !== undefined) form.set("itemId", fields.itemId);
  if (fields.kind !== undefined) form.set("kind", fields.kind);
  if (fields.bytes) {
    form.set(
      "file",
      new File([fields.bytes], fields.filename ?? "upload.bin", {
        type: fields.type ?? "application/octet-stream",
      }),
    );
  }
  // Encode the body ourselves so Content-Length is known, as it is for real browser uploads.
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  const headers = new Headers({
    Origin: APP,
    "Cf-Access-Jwt-Assertion": await accessJwt(fields.email),
    "Content-Type": encoded.headers.get("Content-Type") ?? "multipart/form-data",
  });
  if (fields.contentLength !== null)
    headers.set("Content-Length", String(fields.contentLength ?? body.byteLength));
  // A stream has no known length, so no Content-Length is derived for it.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(body));
      controller.close();
    },
  });
  const init: RequestInit & { duplex?: "half" } = {
    method: "POST",
    headers,
    body: fields.contentLength === null ? stream : body,
    duplex: "half",
  };
  return worker.fetch(new Request(`${APP}/api/files`, init));
}

/** Another owner with one row of every owned kind, inserted directly (bypassing the API). */
export async function seedForeignOwner(): Promise<void> {
  const t = "2026-01-01T00:00:00.000Z";
  await env.FILES.put("owners/foreign/items/foreign-item/foreign-file", PNG_BYTES);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO owners (id, email, created_at) VALUES ('foreign', 'foreign@example.test', ?)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO items (id, owner_id, name, created_at, updated_at) VALUES ('foreign-item', 'foreign', 'Not yours', ?1, ?1)",
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO item_files (id, owner_id, item_id, kind, r2_key, filename, content_type, size_bytes, created_at)
       VALUES ('foreign-file', 'foreign', 'foreign-item', 'photo', 'owners/foreign/items/foreign-item/foreign-file', 'x.png', 'image/png', 12, ?)`,
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO tags (id, owner_id, item_id, token, seq, label, created_at)
       VALUES ('foreign-tag', 'foreign', 'foreign-item', 'zzzzzzzzzzzzzzzzzzzzzzzzzz', 1, '001', ?)`,
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO trackers (id, owner_id, item_id, name, created_at, updated_at) VALUES ('foreign-tracker', 'foreign', 'foreign-item', 'AirTag', ?1, ?1)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO recoveries (id, owner_id, item_id, created_at, updated_at) VALUES ('foreign-recovery', 'foreign', 'foreign-item', ?1, ?1)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO trusted_contacts (id, owner_id, name, created_at, updated_at) VALUES ('foreign-contact', 'foreign', 'Sis', ?1, ?1)",
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO conversations (id, owner_id, item_id, finder_token_hash, subject, last_message_at, created_at)
       VALUES ('foreign-conv', 'foreign', 'foreign-item', 'foreign-hash', 'Private thread', ?1, ?1)`,
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('foreign-msg', 'foreign-conv', 'finder', 'secret', ?)",
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO activity_events (id, owner_id, type, created_at) VALUES ('foreign-event', 'foreign', 'item.created', ?)`,
    ).bind(t),
  ]);
}
