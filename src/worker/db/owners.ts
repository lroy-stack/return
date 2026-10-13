import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

/** Returns the owner id for an authenticated email, creating the row on first sign-in. */
export async function ensureOwner(db: D1Database, email: string): Promise<string> {
  const existing = await db
    .prepare("SELECT id FROM owners WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = newId();
  await db
    .prepare("INSERT INTO owners (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(id, email, nowIso())
    .run();
  const row = await db.prepare("SELECT id FROM owners WHERE email = ?").bind(email).first<{ id: string }>();
  if (!row) throw new Error("owner row missing after insert");
  return row.id;
}
