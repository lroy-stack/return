import { Hono } from "hono";
import { z } from "zod";
import {
  blockInputSchema,
  CONVERSATION_STATUSES,
  type ConversationDetail,
  locationInputSchema,
  messageInputSchema,
  proposalInputSchema,
  proposalResponseSchema,
  type SharedLocation,
} from "../../shared/schemas";
import { languageSchema } from "../../shared/settings";
import {
  type ConversationRow,
  getOwnedConversationRow,
  listConversationSummaries,
  loadConversationDetail,
} from "../db/conversations";
import {
  addMessage,
  blockConversation,
  closeConversation,
  createProposal,
  deleteConversation,
  markRead,
  reopenConversation,
  respondToProposal,
  shareLocation,
  unblockConversation,
} from "../domain/conversations";
import type { AppContext, AppEnv } from "../env";
import { AppError, parseJson, parseWith } from "../lib/http";
import { resolveAndStorePlace, retryUnresolvedPlaces } from "../services/geocode";
import { notifyFinder } from "../services/notify";

export const conversationsApi = new Hono<AppEnv>();

const listQuerySchema = z.object({
  status: z.enum(CONVERSATION_STATUSES).optional(),
  itemId: z.string().max(64).optional(),
});
const deleteSchema = z.object({ confirm: z.literal("DELETE") });

/** Like `parseJson`, but an empty body means "no fields" (the panel posts no body for plain actions). */
async function parseOptionalJson<T extends z.ZodType>(c: AppContext, schema: T): Promise<z.output<T>> {
  const text = await c.req.text();
  if (text.trim() === "") return parseWith(schema, {});
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON");
  }
  return parseWith(schema, raw);
}

function loadRow(c: AppContext): Promise<ConversationRow> {
  return getOwnedConversationRow(c.env.DB, c.get("ownerId"), c.req.param("id") ?? "");
}

function detail(c: AppContext, conv: ConversationRow): Promise<ConversationDetail> {
  return loadConversationDetail(c.env.DB, conv.owner_id, conv.id);
}

/** Tells the finder (if they opted in to email) that the owner wrote; never blocks the response. */
function tellFinder(c: AppContext, conv: ConversationRow): void {
  const lang = languageSchema.catch("en").parse(conv.finder_lang);
  c.executionCtx.waitUntil(
    notifyFinder(
      c.env,
      conv.owner_id,
      { id: conv.id, finderEmail: conv.finder_email, lang },
      { type: "reply" },
    ),
  );
}

conversationsApi.get("/", async (c) => {
  const query = parseWith(listQuerySchema, c.req.query());
  const conversations = await listConversationSummaries(c.env.DB, c.get("ownerId"), query);
  return c.json({ conversations });
});

conversationsApi.get("/:id", async (c) => {
  const conv = await loadRow(c);
  await markRead(c.env.DB, conv, "owner");
  c.executionCtx.waitUntil(retryUnresolvedPlaces(c.env, conv.owner_id, conv.id));
  return c.json(await detail(c, conv));
});

conversationsApi.post("/:id/messages", async (c) => {
  const conv = await loadRow(c);
  const input = await parseJson(c, messageInputSchema);
  const message = await addMessage(c.env.DB, conv, "owner", input.body);
  tellFinder(c, conv);
  return c.json(message, 201);
});

/**
 * The owner shares their current position ("Share my location"). Stored like the finder's, with the
 * place name resolved afterwards; it never notifies the owner (they just did it) and the finder sees it
 * on the next refresh of their page. Poor accuracy is stored and flagged `approximate`, not rejected.
 */
conversationsApi.post("/:id/locations", async (c) => {
  const conv = await loadRow(c);
  const input = await parseJson(c, locationInputSchema);
  const location = await shareLocation(c.env.DB, conv, "owner", input);
  c.executionCtx.waitUntil(
    resolveAndStorePlace(c.env, conv.owner_id, { table: "shared_locations", id: location.id }, location),
  );
  tellFinder(c, conv);
  return c.json<SharedLocation>(location, 201);
});

conversationsApi.post("/:id/proposals", async (c) => {
  const conv = await loadRow(c);
  const input = await parseJson(c, proposalInputSchema);
  const proposal = await createProposal(c.env.DB, conv, "owner", input);
  c.executionCtx.waitUntil(
    resolveAndStorePlace(c.env, conv.owner_id, { table: "proposals", id: proposal.id }, proposal),
  );
  tellFinder(c, conv);
  return c.json(proposal, 201);
});

conversationsApi.post("/:id/proposals/:pid/respond", async (c) => {
  const conv = await loadRow(c);
  const input = await parseJson(c, proposalResponseSchema);
  const proposal = await respondToProposal(c.env.DB, conv, "owner", c.req.param("pid") ?? "", input.action);
  return c.json(proposal);
});

conversationsApi.post("/:id/close", async (c) => {
  const conv = await loadRow(c);
  await closeConversation(c.env.DB, conv);
  return c.json(await detail(c, conv));
});

conversationsApi.post("/:id/reopen", async (c) => {
  const conv = await loadRow(c);
  await reopenConversation(c.env.DB, conv);
  return c.json(await detail(c, conv));
});

conversationsApi.post("/:id/block", async (c) => {
  const conv = await loadRow(c);
  const input = await parseOptionalJson(c, blockInputSchema);
  await blockConversation(c.env.DB, conv, input.reason || null, input.duration);
  return c.json(await detail(c, conv));
});

conversationsApi.post("/:id/unblock", async (c) => {
  const conv = await loadRow(c);
  await unblockConversation(c.env.DB, conv);
  return c.json(await detail(c, conv));
});

conversationsApi.delete("/:id", async (c) => {
  const conv = await loadRow(c);
  await parseJson(c, deleteSchema);
  await deleteConversation(c.env.DB, conv);
  return c.body(null, 204);
});
