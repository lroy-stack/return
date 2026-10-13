import { Hono } from "hono";
import { z } from "zod";
import { trustedContactInputSchema } from "../../shared/schemas";
import {
  createContact,
  deleteContact,
  getOwnedContactRow,
  listContacts,
  replaceContact,
  toContact,
} from "../db/contacts";
import type { AppEnv } from "../env";
import { parseJson, parseWith } from "../lib/http";

export const contactsApi = new Hono<AppEnv>();

contactsApi.get("/", async (c) => c.json({ contacts: await listContacts(c.env.DB, c.get("ownerId")) }));

contactsApi.post("/", async (c) => {
  const input = await parseJson(c, trustedContactInputSchema);
  return c.json(await createContact(c.env.DB, c.get("ownerId"), input), 201);
});

contactsApi.put("/:id", async (c) => {
  const input = await parseJson(c, trustedContactInputSchema);
  return c.json(await replaceContact(c.env.DB, c.get("ownerId"), c.req.param("id"), input));
});

/** Partial update: supplied fields are merged over the stored contact, then the full schema applies. */
contactsApi.patch("/:id", async (c) => {
  const ownerId = c.get("ownerId");
  const current = toContact(await getOwnedContactRow(c.env.DB, ownerId, c.req.param("id")));
  const raw = await parseJson(c, z.record(z.string(), z.unknown()));
  const merged = parseWith(trustedContactInputSchema, {
    name: current.name,
    relationship: current.relationship,
    email: current.email,
    phone: current.phone,
    notify: current.notify,
    showPublic: current.showPublic,
    ...raw,
  });
  return c.json(await replaceContact(c.env.DB, ownerId, current.id, merged));
});

contactsApi.delete("/:id", async (c) => {
  await deleteContact(c.env.DB, c.get("ownerId"), c.req.param("id"));
  return c.body(null, 204);
});
