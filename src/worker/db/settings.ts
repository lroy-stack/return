import { DEFAULT_SETTINGS, type Settings, settingsSchema } from "../../shared/settings";
import { nowIso } from "../lib/time";

export async function getSettings(db: D1Database, ownerId: string): Promise<Settings> {
  const row = await db
    .prepare("SELECT data FROM settings WHERE owner_id = ?")
    .bind(ownerId)
    .first<{ data: string }>();
  if (!row) return DEFAULT_SETTINGS;
  return parseStoredSettings(row.data);
}

/** Removes the value at `path` so the schema default applies; false when the path does not exist. */
function dropAt(doc: unknown, path: readonly PropertyKey[]): boolean {
  let node = doc;
  for (const key of path.slice(0, -1)) {
    if (typeof node !== "object" || node === null) return false;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  const last = path[path.length - 1];
  if (typeof node !== "object" || node === null || last === undefined || !(last in node)) return false;
  delete (node as Record<PropertyKey, unknown>)[last];
  return true;
}

/**
 * Writes are validated strictly (PUT/PATCH); reads are tolerant. A stored document may predate
 * newer fields (parsing fills in defaults) or hold a value a stricter rule now refuses (e.g. an
 * unknown time zone). Each invalid field falls back to its own default and is logged, so one bad
 * field never discards the rest of the owner's settings.
 */
function parseStoredSettings(raw: string): Settings {
  const doc: unknown = JSON.parse(raw);
  for (let round = 0; round < 10; round++) {
    const parsed = settingsSchema.safeParse(doc);
    if (parsed.success) return parsed.data;
    let dropped = false;
    for (const issue of parsed.error.issues) {
      if (dropAt(doc, issue.path)) {
        dropped = true;
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "stored setting invalid, default used",
            path: issue.path.join("."),
          }),
        );
      }
    }
    if (!dropped) break;
  }
  return DEFAULT_SETTINGS;
}

export function saveSettingsStatement(
  db: D1Database,
  ownerId: string,
  settings: Settings,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO settings (owner_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(owner_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(ownerId, JSON.stringify(settings), nowIso());
}

export async function saveSettings(db: D1Database, ownerId: string, settings: Settings): Promise<void> {
  await saveSettingsStatement(db, ownerId, settings).run();
}
