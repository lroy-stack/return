/**
 * Owner API contract (`/api/*` on the app host). Request bodies are validated with these
 * schemas on the server; response types are shared with the React panel.
 */
import { z } from "zod";
import { type ContactVisibility, contactVisibilitySchema, type Settings } from "./settings";

const str = (max: number) => z.string().trim().max(max);
const nullableStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime();

export const ITEM_CATEGORIES = [
  "backpack",
  "suitcase",
  "bag",
  "laptop",
  "tablet",
  "phone",
  "camera",
  "headphones",
  "wallet",
  "keys",
  "documents",
  "clothing",
  "other",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_STATUSES = ["normal", "lost"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Item fields without defaults: updates must only touch the keys they send (zod 4 keeps defaults in `.partial()`). */
const itemFields = z.object({
  name: str(120).min(1),
  brand: nullableStr(80),
  model: nullableStr(80),
  category: z.enum(ITEM_CATEGORIES),
  description: nullableStr(2000),
  serialNumber: nullableStr(120),
  estimatedValueCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  acquiredOn: isoDate.nullable().optional(),
  privateNotes: nullableStr(5000),
  lastKnownLocation: nullableStr(300),
  parentId: z.string().max(64).nullable().optional(),
  publicTitle: nullableStr(120),
  publicMessage: nullableStr(600),
  rewardText: nullableStr(200),
  contactVisibility: contactVisibilitySchema.nullable().optional(),
});
export const itemInputSchema = itemFields.extend({ category: z.enum(ITEM_CATEGORIES).default("other") });
export type ItemInput = z.input<typeof itemInputSchema>;
export const itemPatchSchema = itemFields.partial();
export type ItemPatch = z.input<typeof itemPatchSchema>;

export type FileKind = "photo" | "document";
export interface FileMeta {
  id: string;
  itemId: string;
  kind: FileKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** Authenticated download URL on the app host. */
  url: string;
}

export interface Item {
  id: string;
  parentId: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  category: ItemCategory;
  description: string | null;
  serialNumber: string | null;
  estimatedValueCents: number | null;
  currency: string | null;
  acquiredOn: string | null;
  privateNotes: string | null;
  lastKnownLocation: string | null;
  lastKnownAt: string | null;
  status: ItemStatus;
  publicTitle: string | null;
  publicMessage: string | null;
  rewardText: string | null;
  publicPhotoId: string | null;
  contactVisibility: ContactVisibility | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row in the inventory grid. */
export interface ItemSummary {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: ItemCategory;
  status: ItemStatus;
  parentId: string | null;
  archivedAt: string | null;
  coverPhotoUrl: string | null;
  tagCount: number;
  openConversationCount: number;
  updatedAt: string;
}

export interface ItemDetail {
  item: Item;
  files: FileMeta[];
  tags: Tag[];
  trackers: Tracker[];
  children: ItemSummary[];
  recoveries: Recovery[];
  conversations: ConversationSummary[];
}

export const itemListQuerySchema = z.object({
  q: str(100).optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  category: z.enum(ITEM_CATEGORIES).optional(),
  archived: z.enum(["true", "false"]).optional(),
});

export const markLostSchema = z.object({
  lostAt: isoDateTime.nullable().optional(),
  lostPlace: nullableStr(300),
  notes: nullableStr(2000),
});
export const markFoundSchema = z.object({ notes: nullableStr(2000) });
export const deleteItemSchema = z.object({ confirmName: z.string() });
export const publicPhotoSchema = z.object({ fileId: z.string().max(64).nullable() });

// ---------------------------------------------------------------- tags ----

export const NFC_STATUSES = ["none", "pending", "programmed", "verified"] as const;
export type NfcStatus = (typeof NFC_STATUSES)[number];

export interface Tag {
  id: string;
  itemId: string | null;
  itemName: string | null;
  token: string;
  seq: number;
  label: string;
  status: "active" | "revoked";
  nfcStatus: NfcStatus;
  replacedBy: string | null;
  note: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** Absolute public URL encoded in the QR code and NFC chip. */
  url: string;
}

export const tagCreateSchema = z.object({
  itemId: z.string().max(64).nullable().optional(),
  note: nullableStr(200),
  count: z.number().int().min(1).max(50).default(1),
});
export const tagPatchSchema = z.object({
  itemId: z.string().max(64).nullable().optional(),
  note: nullableStr(200),
  nfcStatus: z.enum(NFC_STATUSES).optional(),
});

export interface TagVerification {
  url: string;
  ok: boolean;
  /** Machine-readable problems: "revoked", "unassigned", "item_archived", "no_contact_method". */
  problems: string[];
}

// ------------------------------------------------------------ trackers ----

export const TRACKER_KINDS = ["airtag", "smarttag", "tile", "chipolo", "other"] as const;
export interface Tracker {
  id: string;
  itemId: string | null;
  kind: (typeof TRACKER_KINDS)[number];
  name: string;
  notes: string | null;
  lastLocationText: string | null;
  lastLocationAt: string | null;
  createdAt: string;
  updatedAt: string;
}
const trackerFields = z.object({
  itemId: z.string().max(64).nullable().optional(),
  kind: z.enum(TRACKER_KINDS),
  name: str(80).min(1),
  notes: nullableStr(1000),
  lastLocationText: nullableStr(300),
  lastLocationAt: isoDateTime.nullable().optional(),
});
export const trackerInputSchema = trackerFields.extend({ kind: z.enum(TRACKER_KINDS).default("airtag") });
export const trackerPatchSchema = trackerFields.partial();

// ---------------------------------------------------------- recoveries ----

export const RECOVERY_STATUSES = ["lost", "found", "returning", "recovered", "closed"] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];
export interface Recovery {
  id: string;
  itemId: string;
  itemName: string;
  status: RecoveryStatus;
  lostAt: string | null;
  lostPlace: string | null;
  notes: string | null;
  recoveredAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export const recoveryPatchSchema = z.object({
  status: z.enum(RECOVERY_STATUSES).optional(),
  lostAt: isoDateTime.nullable().optional(),
  lostPlace: nullableStr(300),
  notes: nullableStr(2000),
});

// ------------------------------------------------------- conversations ----

export const CONVERSATION_STATUSES = ["open", "closed", "blocked"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type Party = "finder" | "owner";

export interface ConversationSummary {
  id: string;
  itemId: string | null;
  itemName: string | null;
  tagLabel: string | null;
  subject: string;
  finderName: string | null;
  status: ConversationStatus;
  unread: boolean;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  sender: Party | "system";
  body: string;
  createdAt: string;
}

export interface SharedLocation {
  id: string;
  sharedBy: Party;
  source: "gps" | "manual";
  label: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  /** Readable place resolved from the coordinates (OpenStreetMap); null if unresolved. */
  place: ResolvedPlace | null;
  createdAt: string;
  /** Links to the shared point only; never include an origin. */
  maps: MapLinks | null;
}

export const PROPOSAL_KINDS = [
  "meeting_point",
  "public_place",
  "hotel_reception",
  "lost_and_found",
  "shipping",
  "other",
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export const PROPOSAL_STATUSES = ["proposed", "accepted", "declined", "cancelled", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface Proposal {
  id: string;
  proposedBy: Party;
  kind: ProposalKind;
  place: string;
  lat: number | null;
  lng: number | null;
  /** Readable place for the coordinates, when they were given and could be resolved. */
  resolvedPlace: ResolvedPlace | null;
  meetAt: string | null;
  instructions: string | null;
  status: ProposalStatus;
  respondedAt: string | null;
  createdAt: string;
  maps: MapLinks | null;
}

export interface MapLinks {
  google: string;
  apple: string;
}

/**
 * A place name resolved from coordinates (reverse geocoding) or found by search (forward geocoding).
 * Data © OpenStreetMap contributors (ODbL) — attribution must be shown wherever it is displayed.
 */
export interface ResolvedPlace {
  /** Short, human name: "Estación de Atocha" or "Calle de Alcalá 12". */
  name: string;
  /** Context line: neighbourhood, city, country. */
  detail: string | null;
  /** Full address as returned by the geocoder. */
  address: string;
}

export interface GeocodeResult extends ResolvedPlace {
  lat: number;
  lng: number;
}

export const geocodeSearchQuerySchema = z.object({ q: str(200).min(3) });

export interface ConversationDetail {
  conversation: ConversationSummary & {
    finderEmail: string | null;
    finderLang: string;
    recoveryId: string | null;
  };
  messages: Message[];
  locations: SharedLocation[];
  proposals: Proposal[];
}

export const messageInputSchema = z.object({ body: str(4000).min(1) });

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

export const proposalInputSchema = z
  .object({
    kind: z.enum(PROPOSAL_KINDS),
    place: str(300).min(1),
    lat: latitude.nullable().optional(),
    lng: longitude.nullable().optional(),
    // Local wall-clock time as typed by the proposer, e.g. "2026-10-14T18:30".
    meetAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable()
      .optional(),
    instructions: nullableStr(1000),
  })
  .refine((p) => (p.lat == null) === (p.lng == null), { message: "lat and lng go together" });
export type ProposalInput = z.input<typeof proposalInputSchema>;

export const proposalResponseSchema = z.object({ action: z.enum(["accept", "decline", "cancel"]) });

export const locationInputSchema = z
  .object({
    source: z.enum(["gps", "manual"]),
    label: nullableStr(300),
    lat: latitude.nullable().optional(),
    lng: longitude.nullable().optional(),
    accuracyM: z.number().min(0).max(100_000).nullable().optional(),
  })
  .refine((l) => (l.lat == null) === (l.lng == null), { message: "lat and lng go together" })
  .refine((l) => l.source === "manual" || l.lat != null, { message: "gps locations need coordinates" })
  .refine((l) => l.lat != null || (l.label != null && l.label.length > 0), {
    message: "a location needs coordinates or a description",
  });
export type LocationInput = z.input<typeof locationInputSchema>;

// ------------------------------------------------------------ contacts ----

export interface TrustedContact {
  id: string;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  notify: boolean;
  showPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
export const trustedContactInputSchema = z
  .object({
    name: str(80).min(1),
    relationship: nullableStr(80),
    email: z.email().max(254).nullable().optional(),
    phone: nullableStr(32),
    notify: z.boolean().default(false),
    showPublic: z.boolean().default(false),
  })
  .refine((c) => !c.notify || !!c.email, { message: "notify requires an email address", path: ["notify"] });

// ------------------------------------------------- activity & overview ----

export interface ActivityEvent {
  id: string;
  type: string;
  itemId: string | null;
  tagId: string | null;
  conversationId: string | null;
  country: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface Overview {
  unreadConversations: ConversationSummary[];
  lostItems: ItemSummary[];
  openRecoveries: Recovery[];
  recentActivity: ActivityEvent[];
}

// -------------------------------------------------------------- system ----

export interface SystemStatus {
  version: string;
  environment: string;
  publicOrigin: string | null;
  appOrigin: string | null;
  checks: {
    database: boolean;
    storage: boolean;
    accessConfigured: boolean;
    turnstileConfigured: boolean;
    emailConfigured: boolean;
    fallbackContactConfigured: boolean;
  };
  counts: { items: number; tags: number; openConversations: number };
  lastBackupAt: string | null;
  recentNotificationFailures: number;
}

export interface Me {
  ownerId: string;
  email: string;
}

export type SettingsResponse = Settings;

/** Error body returned by every API endpoint on failure. */
export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
