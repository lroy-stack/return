import type { z } from "zod";
import type { TrustedContact, trustedContactInputSchema } from "../../shared/schemas";
import { notFound } from "../lib/http";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";

export interface ContactRow {
  id: string;
  owner_id: string;
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  notify: number;
  show_public: number;
  created_at: string;
  updated_at: string;
}

export type ContactInput = z.output<typeof trustedContactInputSchema>;

export function toContact(r: ContactRow): TrustedContact {
  return {
    id: r.id,
    name: r.name,
    relationship: r.relationship,
    email: r.email,
    phone: r.phone,
    notify: r.notify === 1,
    showPublic: r.show_public === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listContacts(db: D1Database, ownerId: string): Promise<TrustedContact[]> {
  const { results } = await db
    .prepare("SELECT * FROM trusted_contacts WHERE owner_id = ? ORDER BY name")
    .bind(ownerId)
    .all<ContactRow>();
  return results.map(toContact);
}

export async function getOwnedContactRow(db: D1Database, ownerId: string, id: string): Promise<ContactRow> {
  const row = await db
    .prepare("SELECT * FROM trusted_contacts WHERE id = ? AND owner_id = ?")
    .bind(id, ownerId)
    .first<ContactRow>();
  if (!row) throw notFound("Contact");
  return row;
}

export async function createContact(
  db: D1Database,
  ownerId: string,
  input: ContactInput,
): Promise<TrustedContact> {
  const id = newId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO trusted_contacts (id, owner_id, name, relationship, email, phone, notify, show_public,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ownerId,
      input.name,
      input.relationship ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.notify ? 1 : 0,
      input.showPublic ? 1 : 0,
      now,
      now,
    )
    .run();
  return toContact(await getOwnedContactRow(db, ownerId, id));
}

export async function replaceContact(
  db: D1Database,
  ownerId: string,
  id: string,
  input: ContactInput,
): Promise<TrustedContact> {
  await getOwnedContactRow(db, ownerId, id);
  await db
    .prepare(
      `UPDATE trusted_contacts SET name = ?, relationship = ?, email = ?, phone = ?, notify = ?, show_public = ?,
         updated_at = ? WHERE id = ? AND owner_id = ?`,
    )
    .bind(
      input.name,
      input.relationship ?? null,
      input.email ?? null,
      input.phone ?? null,
      input.notify ? 1 : 0,
      input.showPublic ? 1 : 0,
      nowIso(),
      id,
      ownerId,
    )
    .run();
  return toContact(await getOwnedContactRow(db, ownerId, id));
}

export async function deleteContact(db: D1Database, ownerId: string, id: string): Promise<void> {
  await getOwnedContactRow(db, ownerId, id);
  await db.prepare("DELETE FROM trusted_contacts WHERE id = ? AND owner_id = ?").bind(id, ownerId).run();
}
