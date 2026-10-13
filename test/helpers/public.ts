import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { type Settings, settingsSchema } from "../../src/shared/settings";
import { saveSettings } from "../../src/worker/db/settings";
import { newId, newTagToken } from "../../src/worker/lib/ids";
import { apiJson } from "./api";
import { PUBLIC, worker } from "./auth";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Controls and records the stubbed Turnstile siteverify endpoint (the network is never used). */
export const turnstile = {
  success: true,
  unreachable: false,
  calls: [] as { body: string }[],
};

const tracked: { mockRestore(): void }[] = [];

/** Registers a spy for `restoreTrackedSpies`. vi.restoreAllMocks would also undo the Access fetch stub. */
export function trackSpy<T extends { mockRestore(): void }>(spy: T): T {
  tracked.push(spy);
  return spy;
}

export function resetPublicStubs(): void {
  for (const spy of tracked.splice(0)) spy.mockRestore();
  turnstile.success = true;
  turnstile.unreachable = false;
}

const fetchMock = vi.mocked(globalThis.fetch);
const previousFetch = fetchMock.getMockImplementation();
const realFetch = globalThis.fetch;
fetchMock.mockImplementation(async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === SITEVERIFY) {
    turnstile.calls.push({ body: String(init?.body ?? "") });
    if (turnstile.unreachable) throw new Error("network down");
    return Response.json({ success: turnstile.success });
  }
  return (previousFetch ?? realFetch)(input, init);
});

let ipCounter = 0;
/** A fresh client IP per call, so per-IP budgets and caps never leak between tests. */
export function uniqueIp(): string {
  ipCounter += 1;
  return `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export async function ownerId(): Promise<string> {
  return (await apiJson<{ ownerId: string }>("GET", "/me")).ownerId;
}

export interface SeedOptions {
  settings?: Record<string, unknown>;
  item?: Partial<{
    name: string;
    brand: string;
    model: string;
    category: string;
    serialNumber: string;
    privateNotes: string;
    valueCents: number;
    status: "normal" | "lost";
    publicTitle: string | null;
    publicMessage: string | null;
    rewardText: string | null;
    contactVisibility: Record<string, boolean> | null;
    archived: boolean;
    withPhoto: boolean;
  }>;
  tagStatus?: "active" | "revoked";
  unassigned?: boolean;
}

export interface Seeded {
  ownerId: string;
  itemId: string;
  tagId: string;
  token: string;
  photoKey: string | null;
  photoFileId: string | null;
}

const DEFAULT_VISIBILITY = { email: true, phone: false, whatsapp: false, trustedContacts: false };

/** Inserts an owner-side item and tag directly (no dependency on other owner API modules). */
export async function seedTag(opts: SeedOptions = {}): Promise<Seeded> {
  const owner = await ownerId();
  const now = new Date().toISOString();
  const i = opts.item ?? {};
  const itemId = newId();
  const tagId = newId();
  const token = newTagToken();
  let photoFileId: string | null = null;
  let photoKey: string | null = null;

  const settings: Settings = settingsSchema.parse({
    identity: { publicName: "Ada Traveller" },
    contact: { email: "ada@example.test", visibility: DEFAULT_VISIBILITY },
    ...opts.settings,
  });
  await saveSettings(env.DB, owner, settings);

  const statements = [
    env.DB.prepare(
      `INSERT INTO items (id, owner_id, name, brand, model, category, serial_number, private_notes,
         estimated_value_cents, status, public_title, public_message, reward_text, contact_visibility,
         archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      itemId,
      owner,
      i.name ?? "Private grey backpack",
      i.brand ?? "Osprey",
      i.model ?? "Farpoint 40",
      i.category ?? "backpack",
      i.serialNumber ?? "SN-SECRET-4471",
      i.privateNotes ?? "passport is in the lid pocket",
      i.valueCents ?? 18900,
      i.status ?? "normal",
      i.publicTitle === undefined ? "Grey travel backpack" : i.publicTitle,
      i.publicMessage === undefined ? null : i.publicMessage,
      i.rewardText === undefined ? null : i.rewardText,
      i.contactVisibility ? JSON.stringify(i.contactVisibility) : null,
      i.archived ? now : null,
      now,
      now,
    ),
  ];
  if (i.withPhoto) {
    photoFileId = newId();
    photoKey = `test/${photoFileId}`;
    await env.FILES.put(photoKey, new Uint8Array([137, 80, 78, 71]), {
      httpMetadata: { contentType: "image/png" },
    });
    statements.push(
      env.DB.prepare(
        `INSERT INTO item_files (id, owner_id, item_id, kind, r2_key, filename, content_type, size_bytes, created_at)
         VALUES (?, ?, ?, 'photo', ?, 'front.png', 'image/png', 4, ?)`,
      ).bind(photoFileId, owner, itemId, photoKey, now),
      env.DB.prepare("UPDATE items SET public_photo_id = ? WHERE id = ?").bind(photoFileId, itemId),
    );
  }
  const seq = await env.DB.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM tags WHERE owner_id = ?")
    .bind(owner)
    .first<{ n: number }>();
  statements.push(
    env.DB.prepare(
      `INSERT INTO tags (id, owner_id, item_id, token, seq, label, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      tagId,
      owner,
      opts.unassigned ? null : itemId,
      token,
      seq?.n ?? 1,
      `T${seq?.n ?? 1}`,
      opts.tagStatus ?? "active",
      now,
    ),
  );
  await env.DB.batch(statements);
  return { ownerId: owner, itemId, tagId, token, photoKey, photoFileId };
}

export async function seedRecovery(seeded: Seeded, status: string = "lost"): Promise<string> {
  const id = newId();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO recoveries (id, owner_id, item_id, status, lost_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, seeded.ownerId, seeded.itemId, status, now, now, now),
    env.DB.prepare("UPDATE items SET status = 'lost' WHERE id = ?").bind(seeded.itemId),
  ]);
  return id;
}

export async function seedTrustedContact(
  owner: string,
  c: { name: string; email?: string; phone?: string; showPublic: boolean },
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO trusted_contacts (id, owner_id, name, email, phone, notify, show_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  )
    .bind(newId(), owner, c.name, c.email ?? null, c.phone ?? null, c.showPublic ? 1 : 0, now, now)
    .run();
}

export interface FinderRequest {
  ip?: string;
  cookie?: string;
  lang?: string;
  headers?: Record<string, string>;
}

export function finderGet(path: string, opts: FinderRequest = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  headers.set("CF-Connecting-IP", opts.ip ?? uniqueIp());
  if (opts.cookie) headers.set("Cookie", opts.cookie);
  if (opts.lang) headers.set("Accept-Language", opts.lang);
  return worker.fetch(new Request(`${PUBLIC}${path}`, { headers }));
}

export function finderPost(
  path: string,
  fields: Record<string, string>,
  opts: FinderRequest & { origin?: string | null } = {},
): Promise<Response> {
  const headers = new Headers(opts.headers);
  headers.set("CF-Connecting-IP", opts.ip ?? uniqueIp());
  headers.set("Content-Type", "application/x-www-form-urlencoded");
  if (opts.origin !== null) headers.set("Origin", opts.origin ?? PUBLIC);
  if (opts.cookie) headers.set("Cookie", opts.cookie);
  if (opts.lang) headers.set("Accept-Language", opts.lang);
  return worker.fetch(
    new Request(`${PUBLIC}${path}`, {
      method: "POST",
      headers,
      body: new URLSearchParams(fields).toString(),
      redirect: "manual",
    }),
  );
}

/** Opens a conversation as a finder and returns its private token. */
export async function openConversation(
  seeded: Seeded,
  fields: Record<string, string> = {},
  opts: FinderRequest = {},
): Promise<{ token: string; id: string; ip: string }> {
  const ip = opts.ip ?? uniqueIp();
  const res = await finderPost(
    `/t/${seeded.token}/contact`,
    { message: "I found your backpack.", "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX", ...fields },
    { ...opts, ip },
  );
  if (res.status !== 303) throw new Error(`contact failed: ${res.status} ${await res.text()}`);
  const token = (res.headers.get("Location") ?? "").replace("/c/", "");
  const row = await env.DB.prepare("SELECT id FROM conversations WHERE finder_token_hash = ?")
    .bind(await sha256(token))
    .first<{ id: string }>();
  if (!row) throw new Error("conversation not stored");
  return { token, id: row.id, ip };
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
