import type { FileKind, FileMeta } from "../../shared/schemas";
import { fileApiPath } from "../lib/urls";

export interface FileRow {
  id: string;
  owner_id: string;
  item_id: string;
  kind: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export function toFileMeta(r: FileRow): FileMeta {
  return {
    id: r.id,
    itemId: r.item_id,
    kind: r.kind as FileKind,
    filename: r.filename,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    url: fileApiPath(r.id),
  };
}

export async function listItemFiles(db: D1Database, ownerId: string, itemId: string): Promise<FileMeta[]> {
  const { results } = await db
    .prepare("SELECT * FROM item_files WHERE owner_id = ? AND item_id = ? ORDER BY kind, created_at")
    .bind(ownerId, itemId)
    .all<FileRow>();
  return results.map(toFileMeta);
}

/** Content types a stored file may be served as. Anything else is served as an opaque download. */
export const SERVABLE_CONTENT_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

/** R2 key of an item file; the only shape the API ever writes. */
export function fileKey(ownerId: string, itemId: string, fileId: string): string {
  return `owners/${ownerId}/items/${itemId}/${fileId}`;
}

/** R2 accepts at most 1000 keys per delete call. */
const R2_DELETE_BATCH = 1000;

/**
 * Best-effort object cleanup, run after the database rows are gone: a failure leaves an orphan
 * object (logged) instead of a row that points at nothing.
 */
export async function deleteStoredObjects(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += R2_DELETE_BATCH) {
    const chunk = keys.slice(i, i + R2_DELETE_BATCH);
    try {
      await bucket.delete(chunk);
    } catch (err) {
      console.error(
        JSON.stringify({ level: "error", msg: "r2 delete failed", keys: chunk.length, error: String(err) }),
      );
    }
  }
}
