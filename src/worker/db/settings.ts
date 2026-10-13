import { DEFAULT_SETTINGS, type Settings, settingsSchema } from "../../shared/settings";
import { nowIso } from "../lib/time";

export async function getSettings(db: D1Database, ownerId: string): Promise<Settings> {
  const row = await db
    .prepare("SELECT data FROM settings WHERE owner_id = ?")
    .bind(ownerId)
    .first<{ data: string }>();
  if (!row) return DEFAULT_SETTINGS;
  // Stored documents may predate newer fields: parsing fills in defaults.
  const parsed = settingsSchema.safeParse(JSON.parse(row.data));
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(db: D1Database, ownerId: string, settings: Settings): Promise<void> {
  await db
    .prepare(
      `INSERT INTO settings (owner_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(ownerId, JSON.stringify(settings), nowIso())
    .run();
}
