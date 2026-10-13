/**
 * Full-account export and restore.
 *
 * The export is a self-describing JSON document with the raw database rows (snake_case, without
 * `owner_id`). It includes tag tokens (printed QR codes must survive a restore) and finder token
 * hashes (finder links keep working). File bytes are NOT included, only their metadata: a restore
 * keeps working file links only while the R2 objects still exist (`findMissingFiles` tells the
 * restoring owner which ones do not).
 *
 * Blocks are included: `ip_hmac` is a keyed hash, never an address, so the export stays pseudonymous
 * and a restore does not silently unblock a finder. The notification log and the activity history are
 * deliberately left out: they hold recipient addresses and delivery diagnostics, are pruned by the
 * retention job anyway, and a restored account regenerates them from new events.
 */
import { z } from "zod";
import {
  ITEM_CATEGORIES,
  NFC_STATUSES,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  RECOVERY_STATUSES,
  TRACKER_KINDS,
} from "../../shared/schemas";
import { contactVisibilitySchema, LANGUAGES, type Settings, settingsSchema } from "../../shared/settings";
import { AppError } from "../lib/http";
import { nowIso } from "../lib/time";
import { fileKey, SERVABLE_CONTENT_TYPES } from "./files";
import { getSettings, saveSettingsStatement } from "./settings";

export const EXPORT_FORMAT = "return-export";
export const EXPORT_VERSION = 1;

type Cell = string | number | null;
export type ExportRow = Record<string, Cell>;

interface TableSpec {
  table: string;
  columns: readonly string[];
  /** Has an `owner_id` column (re-keyed on import). Otherwise scoped through its conversation. */
  owned: boolean;
  /** Self/forward reference inserted as NULL first and set after all rows exist. */
  deferred?: string;
}

const ITEMS: TableSpec = {
  table: "items",
  owned: true,
  deferred: "parent_id",
  columns: [
    "id",
    "parent_id",
    "name",
    "brand",
    "model",
    "category",
    "description",
    "serial_number",
    "estimated_value_cents",
    "currency",
    "acquired_on",
    "private_notes",
    "last_known_location",
    "last_known_lat",
    "last_known_lng",
    "last_known_accuracy_m",
    "last_known_at",
    "status",
    "public_title",
    "public_message",
    "reward_text",
    "public_photo_id",
    "contact_visibility",
    "archived_at",
    "created_at",
    "updated_at",
  ],
};
const FILES: TableSpec = {
  table: "item_files",
  owned: true,
  columns: ["id", "item_id", "kind", "r2_key", "filename", "content_type", "size_bytes", "created_at"],
};
const TAGS: TableSpec = {
  table: "tags",
  owned: true,
  deferred: "replaced_by",
  columns: [
    "id",
    "item_id",
    "token",
    "seq",
    "label",
    "status",
    "nfc_status",
    "replaced_by",
    "note",
    "last_seen_at",
    "revoked_at",
    "created_at",
  ],
};
const TRACKERS: TableSpec = {
  table: "trackers",
  owned: true,
  columns: [
    "id",
    "item_id",
    "kind",
    "name",
    "notes",
    "last_location_text",
    "last_location_at",
    "created_at",
    "updated_at",
  ],
};
const RECOVERIES: TableSpec = {
  table: "recoveries",
  owned: true,
  columns: [
    "id",
    "item_id",
    "status",
    "lost_at",
    "lost_place",
    "notes",
    "recovered_at",
    "closed_at",
    "created_at",
    "updated_at",
  ],
};
const RECOVERY_EVENTS: TableSpec = {
  table: "recovery_events",
  owned: true,
  columns: ["id", "recovery_id", "status", "note", "created_at"],
};
const BLOCKS: TableSpec = {
  table: "blocks",
  owned: true,
  columns: ["id", "ip_hmac", "reason", "expires_at", "created_at"],
};
const CONTACTS: TableSpec = {
  table: "trusted_contacts",
  owned: true,
  columns: [
    "id",
    "name",
    "relationship",
    "email",
    "phone",
    "notify",
    "show_public",
    "created_at",
    "updated_at",
  ],
};
const CONVERSATIONS: TableSpec = {
  table: "conversations",
  owned: true,
  columns: [
    "id",
    "item_id",
    "tag_id",
    "recovery_id",
    "finder_token_hash",
    "finder_name",
    "finder_email",
    "finder_lang",
    "finder_ip_hmac",
    "subject",
    "status",
    "owner_read_at",
    "finder_read_at",
    "last_message_at",
    "last_finder_notified_at",
    "last_owner_notified_at",
    "closed_at",
    "created_at",
  ],
};
const MESSAGES: TableSpec = {
  table: "messages",
  owned: false,
  columns: ["id", "conversation_id", "sender", "body", "created_at"],
};
const LOCATIONS: TableSpec = {
  table: "shared_locations",
  owned: false,
  columns: [
    "id",
    "conversation_id",
    "shared_by",
    "source",
    "label",
    "lat",
    "lng",
    "accuracy_m",
    "created_at",
  ],
};
const PROPOSALS: TableSpec = {
  table: "proposals",
  owned: false,
  columns: [
    "id",
    "conversation_id",
    "proposed_by",
    "kind",
    "place",
    "lat",
    "lng",
    "meet_at",
    "meet_tz",
    "instructions",
    "status",
    "responded_at",
    "created_at",
  ],
};

// Row schemas mirror the table columns and CHECK constraints: an export file is untrusted input.
const id = z.string().min(1).max(64);
const idOrNull = id.nullable();
const text = (max: number) => z.string().max(max).nullable();
const requiredText = (max: number) => z.string().min(1).max(max);
const ts = z.iso.datetime({ offset: true });
const tsOrNull = ts.nullable();
const flag = z.union([z.literal(0), z.literal(1)]);
const coordinate = (limit: number) => z.number().min(-limit).max(limit).nullable();

const contactVisibilityColumn = z
  .string()
  .max(1000)
  .nullable()
  .refine(
    (value) => {
      if (value === null) return true;
      try {
        return contactVisibilitySchema.safeParse(JSON.parse(value)).success;
      } catch {
        return false;
      }
    },
    { message: "contact_visibility must be a JSON contact visibility object" },
  );

const itemRow = z.object({
  id,
  parent_id: idOrNull,
  name: requiredText(120),
  brand: text(80),
  model: text(80),
  category: z.enum(ITEM_CATEGORIES),
  description: text(2000),
  serial_number: text(120),
  estimated_value_cents: z.number().int().min(0).max(100_000_000).nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  acquired_on: z.iso.date().nullable(),
  private_notes: text(5000),
  last_known_location: text(300),
  last_known_lat: coordinate(90).default(null),
  last_known_lng: coordinate(180).default(null),
  last_known_accuracy_m: z.number().min(0).max(100_000).nullable().default(null),
  last_known_at: tsOrNull,
  status: z.enum(["normal", "lost"]),
  public_title: text(120),
  public_message: text(600),
  reward_text: text(200),
  public_photo_id: idOrNull,
  contact_visibility: contactVisibilityColumn,
  archived_at: tsOrNull,
  created_at: ts,
  updated_at: ts,
});
const fileRow = z.object({
  id,
  item_id: id,
  kind: z.enum(["photo", "document"]),
  r2_key: requiredText(300),
  filename: requiredText(255),
  content_type: z.enum(SERVABLE_CONTENT_TYPES as [string, ...string[]]),
  size_bytes: z
    .number()
    .int()
    .min(0)
    .max(20 * 1024 * 1024),
  created_at: ts,
});
const tagRow = z.object({
  id,
  item_id: idOrNull,
  token: z.string().regex(/^[0-9a-hjkmnp-tv-z]{26}$/),
  seq: z.number().int().min(1),
  label: requiredText(40),
  status: z.enum(["active", "revoked"]),
  nfc_status: z.enum(NFC_STATUSES),
  replaced_by: idOrNull,
  note: text(200),
  last_seen_at: tsOrNull,
  revoked_at: tsOrNull,
  created_at: ts,
});
const trackerRow = z.object({
  id,
  item_id: idOrNull,
  kind: z.enum(TRACKER_KINDS),
  name: requiredText(80),
  notes: text(1000),
  last_location_text: text(300),
  last_location_at: tsOrNull,
  created_at: ts,
  updated_at: ts,
});
const recoveryRow = z.object({
  id,
  item_id: id,
  status: z.enum(RECOVERY_STATUSES),
  lost_at: tsOrNull,
  lost_place: text(300),
  notes: text(20_000),
  recovered_at: tsOrNull,
  closed_at: tsOrNull,
  created_at: ts,
  updated_at: ts,
});
const recoveryEventRow = z.object({
  id,
  recovery_id: id,
  status: z.enum(RECOVERY_STATUSES),
  note: text(2000),
  created_at: ts,
});
const blockRow = z.object({
  id,
  ip_hmac: requiredText(128),
  reason: text(300),
  expires_at: tsOrNull,
  created_at: ts,
});
const contactRow = z.object({
  id,
  name: requiredText(80),
  relationship: text(80),
  email: z.string().max(254).nullable(),
  phone: text(32),
  notify: flag,
  show_public: flag,
  created_at: ts,
  updated_at: ts,
});
const conversationRow = z.object({
  id,
  item_id: idOrNull,
  tag_id: idOrNull,
  recovery_id: idOrNull,
  finder_token_hash: z.string().regex(/^[0-9a-f]{64}$/),
  finder_name: text(200),
  finder_email: text(254),
  finder_lang: z.enum(LANGUAGES),
  finder_ip_hmac: text(128),
  subject: requiredText(300),
  status: z.enum(["open", "closed", "blocked"]),
  owner_read_at: tsOrNull,
  finder_read_at: tsOrNull,
  last_message_at: ts,
  last_finder_notified_at: tsOrNull,
  last_owner_notified_at: tsOrNull,
  closed_at: tsOrNull,
  created_at: ts,
});
const messageRow = z.object({
  id,
  conversation_id: id,
  sender: z.enum(["finder", "owner", "system"]),
  body: z.string().max(10_000),
  created_at: ts,
});
const locationRow = z.object({
  id,
  conversation_id: id,
  shared_by: z.enum(["finder", "owner"]),
  source: z.enum(["gps", "manual"]),
  label: text(300),
  lat: coordinate(90),
  lng: coordinate(180),
  accuracy_m: z.number().min(0).max(100_000).nullable(),
  created_at: ts,
});
const proposalRow = z.object({
  id,
  conversation_id: id,
  proposed_by: z.enum(["finder", "owner"]),
  kind: z.enum(PROPOSAL_KINDS),
  place: requiredText(300),
  lat: coordinate(90),
  lng: coordinate(180),
  meet_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    .nullable(),
  meet_tz: z.string().max(64).nullable().default(null),
  instructions: text(1000),
  status: z.enum(PROPOSAL_STATUSES),
  responded_at: tsOrNull,
  created_at: ts,
});

export const exportDocumentSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.iso.datetime(),
  owner: z.object({ email: z.string() }),
  settings: settingsSchema,
  items: z.array(itemRow),
  files: z.array(fileRow),
  tags: z.array(tagRow),
  trackers: z.array(trackerRow),
  recoveries: z.array(recoveryRow),
  // Added after the first exports shipped: older documents simply have none.
  recoveryEvents: z.array(recoveryEventRow).default([]),
  blocks: z.array(blockRow).default([]),
  trustedContacts: z.array(contactRow),
  conversations: z.array(z.object({ conversation: conversationRow, messages: z.array(messageRow) })),
  sharedLocations: z.array(locationRow),
  proposals: z.array(proposalRow),
});
export type ParsedExport = z.output<typeof exportDocumentSchema>;

export interface ExportConversation {
  conversation: ExportRow;
  messages: ExportRow[];
}

export interface ExportDocument {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  owner: { email: string };
  settings: Settings;
  items: ExportRow[];
  files: ExportRow[];
  tags: ExportRow[];
  trackers: ExportRow[];
  recoveries: ExportRow[];
  recoveryEvents: ExportRow[];
  blocks: ExportRow[];
  trustedContacts: ExportRow[];
  conversations: ExportConversation[];
  sharedLocations: ExportRow[];
  proposals: ExportRow[];
}

export const importRequestSchema = z.object({
  confirm: z.literal("RESTORE"),
  data: exportDocumentSchema,
});

async function selectRows(db: D1Database, spec: TableSpec, ownerId: string): Promise<ExportRow[]> {
  const columns = spec.columns.map((c) => `x.${c}`).join(", ");
  const sql = spec.owned
    ? `SELECT ${columns} FROM ${spec.table} x WHERE x.owner_id = ? ORDER BY x.created_at, x.id`
    : `SELECT ${columns} FROM ${spec.table} x JOIN conversations c ON c.id = x.conversation_id
        WHERE c.owner_id = ? ORDER BY x.created_at, x.id`;
  const { results } = await db.prepare(sql).bind(ownerId).all<ExportRow>();
  return results;
}

export async function buildExport(db: D1Database, ownerId: string): Promise<ExportDocument> {
  const owner = await db
    .prepare("SELECT email FROM owners WHERE id = ?")
    .bind(ownerId)
    .first<{ email: string }>();
  if (!owner) throw new Error("owner row missing");
  const [settings, items, files, tags, trackers, recoveries, trustedContacts, conversations, messages] =
    await Promise.all([
      getSettings(db, ownerId),
      selectRows(db, ITEMS, ownerId),
      selectRows(db, FILES, ownerId),
      selectRows(db, TAGS, ownerId),
      selectRows(db, TRACKERS, ownerId),
      selectRows(db, RECOVERIES, ownerId),
      selectRows(db, CONTACTS, ownerId),
      selectRows(db, CONVERSATIONS, ownerId),
      selectRows(db, MESSAGES, ownerId),
    ]);
  const [sharedLocations, proposals, recoveryEvents, blocks] = await Promise.all([
    selectRows(db, LOCATIONS, ownerId),
    selectRows(db, PROPOSALS, ownerId),
    selectRows(db, RECOVERY_EVENTS, ownerId),
    selectRows(db, BLOCKS, ownerId),
  ]);
  const messagesByConversation = new Map<string, ExportRow[]>();
  for (const message of messages) {
    const key = String(message.conversation_id);
    messagesByConversation.set(key, [...(messagesByConversation.get(key) ?? []), message]);
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: nowIso(),
    owner: { email: owner.email },
    settings,
    items,
    files,
    tags,
    trackers,
    recoveries,
    recoveryEvents,
    blocks,
    trustedContacts,
    conversations: conversations.map((conversation) => ({
      conversation,
      messages: messagesByConversation.get(String(conversation.id)) ?? [],
    })),
    sharedLocations,
    proposals,
  };
}

export interface ImportCounts {
  items: number;
  files: number;
  tags: number;
  trackers: number;
  recoveries: number;
  recoveryEvents: number;
  blocks: number;
  trustedContacts: number;
  conversations: number;
  messages: number;
  sharedLocations: number;
  proposals: number;
}

type Row = Record<string, unknown>;

/** D1 caps a bound value at 2 MB; stay well below it. Sizes are UTF-8 bytes, not characters. */
const MAX_CHUNK_BYTES = 800_000;
const encoder = new TextEncoder();

function chunkRows(rows: Row[]): Row[][] {
  const chunks: Row[][] = [];
  let current: Row[] = [];
  let size = 0;
  for (const row of rows) {
    const bytes = encoder.encode(JSON.stringify(row)).length;
    if (current.length > 0 && size + bytes > MAX_CHUNK_BYTES) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** One statement per chunk: rows travel as a JSON array, which keeps the statement count tiny. */
function insertStatements(
  db: D1Database,
  spec: TableSpec,
  rows: Row[],
  ownerId: string,
): D1PreparedStatement[] {
  const select = spec.columns.map((c) => (c === spec.deferred ? "NULL" : `json_extract(value, '$.${c}')`));
  const columns = spec.owned ? [...spec.columns, "owner_id"] : [...spec.columns];
  if (spec.owned) select.push("?");
  const sql = `INSERT INTO ${spec.table} (${columns.join(", ")}) SELECT ${select.join(", ")} FROM json_each(?)`;
  return chunkRows(rows).map((chunk) => {
    const json = JSON.stringify(chunk);
    return spec.owned ? db.prepare(sql).bind(ownerId, json) : db.prepare(sql).bind(json);
  });
}

function deferredStatements(db: D1Database, spec: TableSpec, rows: Row[]): D1PreparedStatement[] {
  const column = spec.deferred;
  if (!column) return [];
  const withValue = rows.flatMap((r) => {
    const value = r[column];
    return value == null ? [] : [{ id: r.id, value }];
  });
  const sql = `UPDATE ${spec.table} SET ${column} = (
      SELECT json_extract(j.value, '$.value') FROM json_each(?) j WHERE json_extract(j.value, '$.id') = ${spec.table}.id)
    WHERE id IN (SELECT json_extract(value, '$.id') FROM json_each(?))`;
  return chunkRows(withValue).map((chunk) => {
    const json = JSON.stringify(chunk);
    return db.prepare(sql).bind(json, json);
  });
}

/** True when the owner has no data at all: the only state a restore is allowed into. */
export async function ownerIsEmpty(db: D1Database, ownerId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM items WHERE owner_id = ?1)
            + (SELECT COUNT(*) FROM tags WHERE owner_id = ?1)
            + (SELECT COUNT(*) FROM trusted_contacts WHERE owner_id = ?1)
            + (SELECT COUNT(*) FROM trackers WHERE owner_id = ?1)
            + (SELECT COUNT(*) FROM conversations WHERE owner_id = ?1) AS n`,
    )
    .bind(ownerId)
    .first<{ n: number }>();
  return (row?.n ?? 1) === 0;
}

const invalidReference = (table: string, column: string, value: string) =>
  new AppError(422, "invalid_reference", `${table}.${column} points at a row that is not in the export`, {
    table,
    column,
    value,
  });

/** Every non-null reference must resolve inside the document itself, never to existing rows. */
function assertReferences(doc: ParsedExport): void {
  const itemIds = new Set(doc.items.map((r) => r.id));
  const fileById = new Map(doc.files.map((r) => [r.id, r]));
  const tagIds = new Set(doc.tags.map((r) => r.id));
  const recoveryIds = new Set(doc.recoveries.map((r) => r.id));
  const conversationIds = new Set(doc.conversations.map((c) => c.conversation.id));
  const check = (ids: Set<string>, table: string, column: string, value: string | null) => {
    if (value !== null && !ids.has(value)) throw invalidReference(table, column, value);
  };
  for (const r of doc.items) {
    check(itemIds, "items", "parent_id", r.parent_id);
    if (r.public_photo_id !== null) {
      const file = fileById.get(r.public_photo_id);
      if (!file || file.item_id !== r.id || file.kind !== "photo") {
        throw invalidReference("items", "public_photo_id", r.public_photo_id);
      }
    }
  }
  for (const r of doc.files) check(itemIds, "item_files", "item_id", r.item_id);
  for (const r of doc.tags) {
    check(itemIds, "tags", "item_id", r.item_id);
    check(tagIds, "tags", "replaced_by", r.replaced_by);
  }
  for (const r of doc.trackers) check(itemIds, "trackers", "item_id", r.item_id);
  for (const r of doc.recoveries) check(itemIds, "recoveries", "item_id", r.item_id);
  for (const r of doc.recoveryEvents) {
    if (!recoveryIds.has(r.recovery_id))
      throw invalidReference("recovery_events", "recovery_id", r.recovery_id);
  }
  for (const { conversation: c, messages } of doc.conversations) {
    check(itemIds, "conversations", "item_id", c.item_id);
    check(tagIds, "conversations", "tag_id", c.tag_id);
    check(recoveryIds, "conversations", "recovery_id", c.recovery_id);
    for (const m of messages)
      if (m.conversation_id !== c.id)
        throw invalidReference("messages", "conversation_id", m.conversation_id);
  }
  for (const r of doc.sharedLocations)
    check(conversationIds, "shared_locations", "conversation_id", r.conversation_id);
  for (const r of doc.proposals) check(conversationIds, "proposals", "conversation_id", r.conversation_id);
}

/**
 * Stored keys are always `owners/<owner>/items/<item>/<file>`. A key of any other shape is
 * rejected (it could point at someone else's object); a canonical one is re-keyed to the
 * restoring owner, which is the only place the API will ever read from.
 */
function rekeyFiles(doc: ParsedExport, ownerId: string): Row[] {
  return doc.files.map((file) => {
    const canonical = new RegExp(`^owners/[^/]+/items/${file.item_id}/${file.id}$`);
    if (!canonical.test(file.r2_key)) {
      throw new AppError(422, "invalid_file_key", "A file entry has a storage key that is not allowed", {
        file: file.id,
      });
    }
    return { ...file, r2_key: fileKey(ownerId, file.item_id, file.id) };
  });
}

/** Ids, tag tokens and finder hashes are globally unique: refuse cleanly instead of failing mid-batch. */
async function assertNoConflicts(db: D1Database, doc: ParsedExport): Promise<void> {
  const json = (values: string[]) => JSON.stringify(values);
  const inList = (n: number) => `IN (SELECT value FROM json_each(?${n}))`;
  // Scalar subqueries rather than UNION ALL: D1 caps the number of compound SELECT terms.
  const found = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM items WHERE id ${inList(1)}) AS items,
              (SELECT COUNT(*) FROM item_files WHERE id ${inList(2)}) AS item_files,
              (SELECT COUNT(*) FROM tags WHERE id ${inList(3)} OR token ${inList(4)}) AS tags,
              (SELECT COUNT(*) FROM trackers WHERE id ${inList(5)}) AS trackers,
              (SELECT COUNT(*) FROM recoveries WHERE id ${inList(6)}) AS recoveries,
              (SELECT COUNT(*) FROM trusted_contacts WHERE id ${inList(7)}) AS trusted_contacts,
              (SELECT COUNT(*) FROM recovery_events WHERE id ${inList(13)}) AS recovery_events,
              (SELECT COUNT(*) FROM blocks WHERE id ${inList(14)}) AS blocks,
              (SELECT COUNT(*) FROM conversations WHERE id ${inList(8)} OR finder_token_hash ${inList(9)}) AS conversations,
              (SELECT COUNT(*) FROM messages WHERE id ${inList(10)}) AS messages,
              (SELECT COUNT(*) FROM shared_locations WHERE id ${inList(11)}) AS shared_locations,
              (SELECT COUNT(*) FROM proposals WHERE id ${inList(12)}) AS proposals`,
    )
    .bind(
      json(doc.items.map((r) => r.id)),
      json(doc.files.map((r) => r.id)),
      json(doc.tags.map((r) => r.id)),
      json(doc.tags.map((r) => r.token)),
      json(doc.trackers.map((r) => r.id)),
      json(doc.recoveries.map((r) => r.id)),
      json(doc.trustedContacts.map((r) => r.id)),
      json(doc.conversations.map((c) => c.conversation.id)),
      json(doc.conversations.map((c) => c.conversation.finder_token_hash)),
      json(doc.conversations.flatMap((c) => c.messages.map((m) => m.id))),
      json(doc.sharedLocations.map((r) => r.id)),
      json(doc.proposals.map((r) => r.id)),
      json(doc.recoveryEvents.map((r) => r.id)),
      json(doc.blocks.map((r) => r.id)),
    )
    .first<Record<string, number>>();
  const clash = Object.entries(found ?? {}).find(([, count]) => count > 0)?.[0];
  if (clash) {
    throw new AppError(
      409,
      "id_conflict",
      "Some ids, tag tokens or finder links in the export already exist",
      {
        table: clash,
      },
    );
  }
}

/** Restore a validated export for `ownerId`, all rows and the settings in one atomic D1 batch. */
export async function importExport(
  db: D1Database,
  ownerId: string,
  doc: ParsedExport,
): Promise<ImportCounts> {
  assertReferences(doc);
  const files = rekeyFiles(doc, ownerId);
  await assertNoConflicts(db, doc);
  const conversations = doc.conversations.map((c) => c.conversation);
  const messages = doc.conversations.flatMap((c) => c.messages);
  const statements = [
    ...insertStatements(db, ITEMS, doc.items, ownerId),
    ...insertStatements(db, FILES, files, ownerId),
    ...insertStatements(db, TAGS, doc.tags, ownerId),
    ...insertStatements(db, TRACKERS, doc.trackers, ownerId),
    ...insertStatements(db, RECOVERIES, doc.recoveries, ownerId),
    ...insertStatements(db, RECOVERY_EVENTS, doc.recoveryEvents, ownerId),
    ...insertStatements(db, BLOCKS, doc.blocks, ownerId),
    ...insertStatements(db, CONTACTS, doc.trustedContacts, ownerId),
    ...insertStatements(db, CONVERSATIONS, conversations, ownerId),
    ...insertStatements(db, MESSAGES, messages, ownerId),
    ...insertStatements(db, LOCATIONS, doc.sharedLocations, ownerId),
    ...insertStatements(db, PROPOSALS, doc.proposals, ownerId),
    ...deferredStatements(db, ITEMS, doc.items),
    ...deferredStatements(db, TAGS, doc.tags),
    saveSettingsStatement(db, ownerId, doc.settings),
  ];
  try {
    await db.batch(statements);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "import failed", error: String(err) }));
    throw new AppError(
      422,
      "import_failed",
      "The export file is inconsistent or conflicts with existing data; nothing was imported",
    );
  }
  return {
    items: doc.items.length,
    files: files.length,
    tags: doc.tags.length,
    trackers: doc.trackers.length,
    recoveries: doc.recoveries.length,
    recoveryEvents: doc.recoveryEvents.length,
    blocks: doc.blocks.length,
    trustedContacts: doc.trustedContacts.length,
    conversations: conversations.length,
    messages: messages.length,
    sharedLocations: doc.sharedLocations.length,
    proposals: doc.proposals.length,
  };
}

/** Upper bound on R2 lookups after a restore; an owner's inventory is far below it. */
const MAX_FILE_CHECKS = 500;
const HEAD_CONCURRENCY = 20;

export interface MissingFile {
  id: string;
  itemId: string;
  filename: string;
}

export interface FileCheck {
  /** How many file rows were looked up in R2 (at most MAX_FILE_CHECKS). */
  checked: number;
  /** Rows whose object is not in R2: their thumbnails and downloads will 404 until the file is uploaded again. */
  missing: MissingFile[];
}

/** After a restore: which file rows point at an R2 object that does not exist. Bounded, read-only. */
export async function findMissingFiles(
  db: D1Database,
  bucket: R2Bucket,
  ownerId: string,
): Promise<FileCheck> {
  const { results } = await db
    .prepare(
      "SELECT id, item_id, filename, r2_key FROM item_files WHERE owner_id = ? ORDER BY created_at, id LIMIT ?",
    )
    .bind(ownerId, MAX_FILE_CHECKS)
    .all<{ id: string; item_id: string; filename: string; r2_key: string }>();
  const missing: MissingFile[] = [];
  for (let i = 0; i < results.length; i += HEAD_CONCURRENCY) {
    const chunk = results.slice(i, i + HEAD_CONCURRENCY);
    const heads = await Promise.all(chunk.map((f) => bucket.head(f.r2_key)));
    chunk.forEach((f, index) => {
      if (heads[index] === null) missing.push({ id: f.id, itemId: f.item_id, filename: f.filename });
    });
  }
  return { checked: results.length, missing };
}
