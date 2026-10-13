import { Hono } from "hono";
import { z } from "zod";
import { qrSvg } from "../../shared/qr";
import { type Tag, type TagVerification, tagCreateSchema, tagPatchSchema } from "../../shared/schemas";
import { recordActivity } from "../db/activity";
import { getOwnedItemRow } from "../db/items";
import { getSettings } from "../db/settings";
import {
  countOpenConversations,
  createTags,
  getOwnedTagRow,
  listTags,
  replaceTag,
  type TagRow,
  toTag,
} from "../db/tags";
import type { AppContext, AppEnv } from "../env";
import { AppError, parseJson, parseWith } from "../lib/http";
import { nowIso } from "../lib/time";
import { publicOrigin } from "../lib/urls";
import { attachmentDisposition } from "./files";

export const tagsApi = new Hono<AppEnv>();

const tagStatusSchema = z.enum(["active", "revoked"]);
const tagListQuerySchema = z.object({
  itemId: z.string().max(64).optional(),
  status: tagStatusSchema.optional(),
});
const csvQuerySchema = z.object({ status: tagStatusSchema.optional() });

/** `POST /tags/:id/revoke` returns the tag plus how many of its conversations are still open (they stay open). */
type RevokeResponse = Tag & { openConversations: number };
/** `GET /tags/:id/verify`. */
type VerifyResponse = TagVerification & { openConversations: number };

/** Excel only reads UTF-8 CSV when it starts with a byte order mark. */
const UTF8_BOM = "\uFEFF";

async function loadTag(c: AppContext, ownerId: string, id: string): Promise<Tag> {
  return toTag(await getOwnedTagRow(c.env.DB, ownerId, id), publicOrigin(c.env, c.req.url));
}

tagsApi.get("/", async (c) => {
  const query = parseWith(tagListQuerySchema, c.req.query());
  const tags = await listTags(c.env.DB, c.get("ownerId"), publicOrigin(c.env, c.req.url), query);
  return c.json({ tags });
});

tagsApi.post("/", async (c) => {
  const input = await parseJson(c, tagCreateSchema);
  const ownerId = c.get("ownerId");
  const itemId = input.itemId ?? null;
  if (itemId) await getOwnedItemRow(c.env.DB, ownerId, itemId);
  const settings = await getSettings(c.env.DB, ownerId);
  const ids = await createTags(c.env.DB, ownerId, settings, {
    itemId,
    note: input.note ?? null,
    count: input.count,
  });
  const origin = publicOrigin(c.env, c.req.url);
  const created = new Set(ids);
  const tags = (await listTags(c.env.DB, ownerId, origin)).filter((t) => created.has(t.id));
  return c.json({ tags }, 201);
});

const csvCell = (value: string): string => {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/**
 * NFC programming list (UTF-8 with BOM). `?status=active` keeps only tags that still work, `revoked` only
 * the dead ones; without it every tag is listed. Must be registered before `/:id` routes.
 */
tagsApi.get("/export.csv", async (c) => {
  const { status } = parseWith(csvQuerySchema, c.req.query());
  const tags = await listTags(c.env.DB, c.get("ownerId"), publicOrigin(c.env, c.req.url), { status });
  const header = ["label", "item", "url", "status", "nfc_status"];
  const rows = tags
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map((t) => [t.label, t.itemName ?? "", t.url, t.status, t.nfcStatus]);
  const body = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`${UTF8_BOM}${body}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": attachmentDisposition("return-tags.csv"),
      "Cache-Control": "no-store",
    },
  });
});

tagsApi.patch("/:id", async (c) => {
  const patch = await parseJson(c, tagPatchSchema);
  const ownerId = c.get("ownerId");
  const row = await getOwnedTagRow(c.env.DB, ownerId, c.req.param("id"));
  if (row.status === "revoked" && ("itemId" in patch || "nfcStatus" in patch)) {
    throw new AppError(409, "tag_revoked", "A revoked tag can only have its note changed");
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if ("itemId" in patch) {
    const itemId = patch.itemId ?? null;
    if (itemId) await getOwnedItemRow(c.env.DB, ownerId, itemId);
    sets.push("item_id = ?");
    params.push(itemId);
  }
  if ("note" in patch) {
    sets.push("note = ?");
    params.push(patch.note ?? null);
  }
  if (patch.nfcStatus) {
    sets.push("nfc_status = ?");
    params.push(patch.nfcStatus);
  }
  if (sets.length > 0) {
    await c.env.DB.prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ? AND owner_id = ?`)
      .bind(...params, row.id, ownerId)
      .run();
  }
  return c.json(await loadTag(c, ownerId, row.id));
});

tagsApi.post("/:id/revoke", async (c) => {
  const ownerId = c.get("ownerId");
  const row = await getOwnedTagRow(c.env.DB, ownerId, c.req.param("id"));
  // Open conversations are left alone on purpose: the finder may be in the middle of arranging a return.
  if (row.status !== "revoked") {
    await c.env.DB.prepare("UPDATE tags SET status = 'revoked', revoked_at = ? WHERE id = ? AND owner_id = ?")
      .bind(nowIso(), row.id, ownerId)
      .run();
    await recordActivity(c.env.DB, {
      ownerId,
      type: "tag.revoked",
      tagId: row.id,
      itemId: row.item_id,
      data: { label: row.label },
    });
  }
  const openConversations = await countOpenConversations(c.env.DB, ownerId, row.id);
  return c.json<RevokeResponse>({ ...(await loadTag(c, ownerId, row.id)), openConversations });
});

tagsApi.post("/:id/replace", async (c) => {
  const ownerId = c.get("ownerId");
  const row = await getOwnedTagRow(c.env.DB, ownerId, c.req.param("id"));
  if (row.replaced_by) throw new AppError(409, "already_replaced", "This tag was already replaced");
  if (row.status === "revoked") throw new AppError(409, "tag_revoked", "A revoked tag cannot be replaced");
  const settings = await getSettings(c.env.DB, ownerId);
  const newId = await replaceTag(c.env.DB, ownerId, settings, row);
  return c.json({ tag: await loadTag(c, ownerId, newId) });
});

tagsApi.get("/:id/qr.svg", async (c) => {
  const tag = await loadTag(c, c.get("ownerId"), c.req.param("id"));
  return new Response(qrSvg(tag.url, { ecc: "M", title: tag.label }), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": attachmentDisposition(`${tag.label || "tag"}.svg`),
      "Cache-Control": "private, max-age=3600",
    },
  });
});

/**
 * Pre-print check. `no_contact_method` is reported only when the owner cannot be reached by email
 * at all: no notification address, no contact email, no printed fallback email and no
 * FALLBACK_CONTACT_EMAIL on the server. Finders can always message through the tag page, so a missing
 * phone or WhatsApp number is not a problem. `openConversations` counts conversations still open on this tag.
 */
tagsApi.get("/:id/verify", async (c) => {
  const ownerId = c.get("ownerId");
  const row: TagRow = await getOwnedTagRow(c.env.DB, ownerId, c.req.param("id"));
  const problems: string[] = [];
  if (row.status === "revoked") problems.push("revoked");
  if (!row.item_id) {
    problems.push("unassigned");
  } else {
    const item = await getOwnedItemRow(c.env.DB, ownerId, row.item_id);
    if (item.archived_at) problems.push("item_archived");
  }
  const settings = await getSettings(c.env.DB, ownerId);
  const reachable =
    settings.notifications.emailAddress ??
    settings.contact.email ??
    settings.tags.printedEmail ??
    (c.env.FALLBACK_CONTACT_EMAIL || null);
  if (!reachable) problems.push("no_contact_method");
  const url = toTag(row, publicOrigin(c.env, c.req.url)).url;
  const openConversations = await countOpenConversations(c.env.DB, ownerId, row.id);
  return c.json<VerifyResponse>({ url, ok: problems.length === 0, problems, openConversations });
});
