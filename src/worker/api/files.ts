import { Hono } from "hono";
import { z } from "zod";
import type { FileKind, FileMeta } from "../../shared/schemas";
import { deleteStoredObjects, type FileRow, fileKey, SERVABLE_CONTENT_TYPES, toFileMeta } from "../db/files";
import { getOwnedItemRow } from "../db/items";
import type { AppContext, AppEnv } from "../env";
import { AppError, notFound, parseWith } from "../lib/http";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

export const filesApi = new Hono<AppEnv>();

const MB = 1024 * 1024;
const MULTIPART_OVERHEAD = 64 * 1024;

interface KindRule {
  maxBytes: number;
  types: readonly DetectedType[];
}
type DetectedType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const KIND_RULES: Record<FileKind, KindRule> = {
  photo: { maxBytes: 8 * MB, types: ["image/jpeg", "image/png", "image/webp"] },
  document: { maxBytes: 20 * MB, types: ["application/pdf", "image/jpeg", "image/png"] },
};

const EXTENSIONS: Record<DetectedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const uploadFieldsSchema = z.object({
  itemId: z.string().min(1).max(64),
  kind: z.enum(["photo", "document"]),
});

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((b, i) => bytes[offset + i] === b);

/** Identify the real format from the first bytes; the client-declared type is never trusted. */
export function detectContentType(bytes: Uint8Array): DetectedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

/** `Content-Disposition: attachment` with an RFC 5987 UTF-8 filename (and an ASCII fallback). */
export function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|[";]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function cleanFilename(raw: string, type: DetectedType): string {
  // Strip any path, control characters and leading dots; keep it short.
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(CONTROL_CHARS, "").replace(/^\.+/, "").trim().slice(0, 200);
  return cleaned || `file.${EXTENSIONS[type]}`;
}

filesApi.post("/", async (c) => {
  const ownerId = c.get("ownerId");
  // Decide from the declared size before the body is buffered. Multipart framing adds a little.
  const declared = c.req.header("Content-Length");
  if (declared === undefined) throw new AppError(411, "length_required", "Content-Length is required");
  const declaredLength = Number(declared);
  if (!Number.isInteger(declaredLength) || declaredLength < 0) {
    throw new AppError(400, "invalid_length", "Content-Length is invalid");
  }
  if (declaredLength > KIND_RULES.document.maxBytes + MULTIPART_OVERHEAD) {
    throw new AppError(413, "file_too_large", "The upload is too large");
  }
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw new AppError(400, "invalid_form", "Request body must be multipart/form-data");
  }
  const fields = parseWith(uploadFieldsSchema, {
    itemId: form.get("itemId"),
    kind: form.get("kind"),
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError(422, "validation_failed", "A file is required");

  const item = await getOwnedItemRow(c.env.DB, ownerId, fields.itemId);
  const rule = KIND_RULES[fields.kind];
  if (declaredLength > rule.maxBytes + MULTIPART_OVERHEAD) {
    throw new AppError(413, "file_too_large", `The file exceeds ${rule.maxBytes / MB} MB`);
  }
  if (file.size === 0) throw new AppError(422, "empty_file", "The file is empty");
  if (file.size > rule.maxBytes) {
    throw new AppError(413, "file_too_large", `The file exceeds ${rule.maxBytes / MB} MB`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectContentType(bytes);
  if (!type || !rule.types.includes(type)) {
    throw new AppError(415, "unsupported_type", "Unsupported file type", { allowed: rule.types });
  }

  const id = newId();
  const key = fileKey(ownerId, item.id, id);
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: type } });
  const row: FileRow = {
    id,
    owner_id: ownerId,
    item_id: item.id,
    kind: fields.kind,
    r2_key: key,
    filename: cleanFilename(file.name, type),
    content_type: type,
    size_bytes: bytes.byteLength,
    created_at: nowIso(),
  };
  try {
    await c.env.DB.prepare(
      `INSERT INTO item_files (id, owner_id, item_id, kind, r2_key, filename, content_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.id,
        row.owner_id,
        row.item_id,
        row.kind,
        row.r2_key,
        row.filename,
        row.content_type,
        row.size_bytes,
        row.created_at,
      )
      .run();
  } catch (err) {
    await deleteStoredObjects(c.env.FILES, [key]);
    throw err;
  }
  return c.json<FileMeta>(toFileMeta(row), 201);
});

async function getOwnedFileRow(c: AppContext, ownerId: string, id: string): Promise<FileRow> {
  const row = await c.env.DB.prepare("SELECT * FROM item_files WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId)
    .first<FileRow>();
  if (!row) throw notFound("File");
  return row;
}

filesApi.get("/:id", async (c) => {
  const ownerId = c.get("ownerId");
  const row = await getOwnedFileRow(c, ownerId, c.req.param("id"));
  // Defence in depth: a row can only ever point inside the owner's own prefix.
  if (!row.r2_key.startsWith(`owners/${ownerId}/`)) throw notFound("File");
  const object = await c.env.FILES.get(row.r2_key);
  if (!object) throw notFound("File");
  // Only known-safe types are rendered by the browser; anything else is an opaque download.
  const servable = SERVABLE_CONTENT_TYPES.includes(row.content_type);
  const inline = servable && row.kind === "photo" && row.content_type.startsWith("image/");
  return new Response(object.body, {
    headers: {
      "Content-Type": servable ? row.content_type : "application/octet-stream",
      "Content-Length": String(object.size),
      "Content-Disposition": inline ? "inline" : attachmentDisposition(row.filename),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

filesApi.delete("/:id", async (c) => {
  const ownerId = c.get("ownerId");
  const row = await getOwnedFileRow(c, ownerId, c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE items SET public_photo_id = NULL, updated_at = ? WHERE id = ? AND owner_id = ? AND public_photo_id = ?",
    ).bind(nowIso(), row.item_id, ownerId, row.id),
    c.env.DB.prepare("DELETE FROM item_files WHERE id = ? AND owner_id = ?").bind(row.id, ownerId),
  ]);
  if (row.r2_key.startsWith(`owners/${ownerId}/`)) await deleteStoredObjects(c.env.FILES, [row.r2_key]);
  return c.body(null, 204);
});
