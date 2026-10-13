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
