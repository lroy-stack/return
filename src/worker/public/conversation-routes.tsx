import { type Context, Hono } from "hono";
import { z } from "zod";
import { proposalResponseSchema } from "../../shared/schemas";
import { languageSchema } from "../../shared/settings";
import { type ConversationRow, findConversationByTokenHash } from "../db/conversations";
import {
  addMessage,
  conversationClosed,
  createProposal,
  getConversationDetail,
  markRead,
  respondToProposal,
  shareLocation,
} from "../domain/conversations";
import type { AppEnv } from "../env";
import { AppError, capabilityHeaders } from "../lib/http";
import { isWellFormedSecretToken, sha256Hex } from "../lib/ids";
import { allowPublicWrite } from "../lib/ratelimit";
import { resolveAndStorePlace } from "../services/geocode";
import { notifyOwner, type OwnerEvent } from "../services/notify";
import type { FormState } from "./components";
import { ConversationPage, type FormName, renderTimelineHtml } from "./conversation-view";
import { parseLocation, parseMessage, parseProposal, toFormValues } from "./forms";
import { dict } from "./i18n";
import { explicitLanguage } from "./lang";
import { assertSmallForm, defer, htmlPage, publicWrites, readBudget } from "./support";
import { itemAnchor } from "./timeline";

type Ctx = Context<AppEnv>;

interface Loaded {
  token: string;
  conv: ConversationRow;
  lang: ReturnType<typeof conversationLanguage>;
}

function conversationLanguage(c: Ctx, conv: ConversationRow) {
  return explicitLanguage(c) ?? languageSchema.catch("en").parse(conv.finder_lang);
}

/** Capability lookup: a malformed or unknown token is a plain 404, indistinguishable from any other. */
async function load(c: Ctx): Promise<Loaded> {
  const token = c.req.param("token") ?? "";
  if (!isWellFormedSecretToken(token)) throw new AppError(404, "not_found", "Not found");
  const conv = await findConversationByTokenHash(c.env.DB, await sha256Hex(token));
  if (!conv) throw new AppError(404, "not_found", "Not found");
  return { token, conv, lang: conversationLanguage(c, conv) };
}

async function loadForWrite(c: Ctx): Promise<Loaded> {
  if (!(await allowPublicWrite(c.env, c.req.raw)))
    throw new AppError(429, "rate_limited", "Too many requests");
  assertSmallForm(c);
  const loaded = await load(c);
  if (loaded.conv.status !== "open") throw conversationClosed();
  return loaded;
}

async function renderConversation(
  c: Ctx,
  loaded: Loaded,
  active?: FormName,
  form?: FormState,
  status?: 422 | 429,
) {
  const detail = await getConversationDetail(c.env.DB, loaded.conv);
  // Tells chat.js this page carries the finder's input and an explanation: it may show it by a normal submit.
  if (form) c.header("X-Form-State", "1");
  return htmlPage(
    c,
    <ConversationPage
      lang={loaded.lang}
      token={loaded.token}
      detail={detail}
      open={loaded.conv.status === "open"}
      active={active}
      form={form}
    />,
    status,
  );
}

function tellOwner(c: Ctx, conv: ConversationRow, kind: OwnerEvent["kind"], preview: string): void {
  defer(
    c,
    notifyOwner(c.env, conv.owner_id, {
      kind,
      itemName: conv.item_name,
      conversationId: conv.id,
      preview,
    }),
  );
}

/**
 * What the timeline looks like now. Scripts ask for this (`Accept: application/json`) after a write
 * and while polling; `cursor` is the conversation's activity clock.
 */
async function timelineJson(c: Ctx, loaded: Loaded) {
  const detail = await getConversationDetail(c.env.DB, loaded.conv);
  const open = loaded.conv.status === "open";
  return c.json({
    cursor: detail.conversation.lastMessageAt,
    open,
    html: await renderTimelineHtml({ lang: loaded.lang, token: loaded.token, detail, open }),
  });
}

const wantsJson = (c: Ctx) => (c.req.header("Accept") ?? "").includes("application/json");

/**
 * After a write: scripts get the fresh timeline; plain form posts are redirected to the new item,
 * so the browser lands on it instead of the top of the page.
 */
function done(c: Ctx, loaded: Loaded, createdId: string) {
  if (wantsJson(c)) return timelineJson(c, loaded);
  return c.redirect(`/c/${loaded.token}#${itemAnchor(createdId)}`, 303);
}

/** Over the daily cap: a friendly page that keeps what the finder typed. */
async function withCap(
  c: Ctx,
  loaded: Loaded,
  active: FormName,
  values: FormState["values"],
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof AppError && err.code === "conversation_cap") {
      const errors = { form: dict(loaded.lang).errors.dailyLimit };
      return renderConversation(c, loaded, active, { values, errors }, 429);
    }
    throw err;
  }
}

export const conversationRoutes = new Hono<AppEnv>();
conversationRoutes.use("*", capabilityHeaders);
conversationRoutes.use("*", publicWrites);
conversationRoutes.use("*", readBudget);

conversationRoutes.get("/:token", async (c) => {
  const loaded = await load(c);
  defer(c, markRead(c.env.DB, loaded.conv, "finder"));
  return renderConversation(c, loaded);
});

/**
 * Polling endpoint. The conversation row (already read to check the capability) carries the activity
 * clock, so an unchanged conversation costs one query and no HTML.
 */
conversationRoutes.get("/:token/timeline", async (c) => {
  const loaded = await load(c);
  const { conv } = loaded;
  const after = c.req.query("after");
  if (after && after === conv.last_message_at) {
    return c.json({ cursor: conv.last_message_at, open: conv.status === "open", html: null });
  }
  defer(c, markRead(c.env.DB, conv, "finder"));
  return timelineJson(c, loaded);
});

conversationRoutes.post("/:token/messages", async (c) => {
  const loaded = await loadForWrite(c);
  const values = toFormValues(await c.req.parseBody());
  const parsed = parseMessage(values, dict(loaded.lang));
  if (!parsed.ok) return renderConversation(c, loaded, "reply", { values, errors: parsed.errors }, 422);
  return withCap(c, loaded, "reply", values, async () => {
    const message = await addMessage(c.env.DB, loaded.conv, "finder", parsed.data);
    tellOwner(c, loaded.conv, "new_message", parsed.data);
    return done(c, loaded, message.id);
  });
});

conversationRoutes.post("/:token/location", async (c) => {
  const loaded = await loadForWrite(c);
  const values = toFormValues(await c.req.parseBody());
  const t = dict(loaded.lang);
  const parsed = parseLocation(values, t);
  if (!parsed.ok || parsed.data === null) {
    const errors = parsed.ok ? { location: t.errors.location } : parsed.errors;
    return renderConversation(c, loaded, "location", { values, errors }, 422);
  }
  const data = parsed.data;
  return withCap(c, loaded, "location", values, async () => {
    const location = await shareLocation(c.env.DB, loaded.conv, "finder", data);
    defer(
      c,
      resolveAndStorePlace(
        c.env,
        loaded.conv.owner_id,
        { table: "shared_locations", id: location.id },
        location,
      ),
    );
    tellOwner(c, loaded.conv, "location_shared", location.label ?? "");
    return done(c, loaded, location.id);
  });
});

conversationRoutes.post("/:token/proposals", async (c) => {
  const loaded = await loadForWrite(c);
  const values = toFormValues(await c.req.parseBody());
  const parsed = parseProposal(values, dict(loaded.lang));
  if (!parsed.ok) return renderConversation(c, loaded, "proposal", { values, errors: parsed.errors }, 422);
  const data = parsed.data;
  return withCap(c, loaded, "proposal", values, async () => {
    let proposal: Awaited<ReturnType<typeof createProposal>>;
    try {
      proposal = await createProposal(c.env.DB, loaded.conv, "finder", data);
    } catch (err) {
      if (err instanceof AppError && err.code === "meeting_in_past") {
        const errors = { meetAt: dict(loaded.lang).errors.whenPast };
        return renderConversation(c, loaded, "proposal", { values, errors }, 422);
      }
      throw err;
    }
    defer(
      c,
      resolveAndStorePlace(c.env, loaded.conv.owner_id, { table: "proposals", id: proposal.id }, proposal),
    );
    tellOwner(c, loaded.conv, "proposal", proposal.place);
    return done(c, loaded, proposal.id);
  });
});

const respondFormSchema = z.object({ action: proposalResponseSchema.shape.action });

conversationRoutes.post("/:token/proposals/:id/respond", async (c) => {
  const loaded = await loadForWrite(c);
  const values = toFormValues(await c.req.parseBody());
  const parsed = respondFormSchema.safeParse(values);
  if (!parsed.success) throw new AppError(422, "validation_failed", "Invalid action");
  const proposal = await respondToProposal(
    c.env.DB,
    loaded.conv,
    "finder",
    c.req.param("id") ?? "",
    parsed.data.action,
  );
  tellOwner(c, loaded.conv, "proposal", `${parsed.data.action}: ${proposal.place}`);
  return done(c, loaded, proposal.id);
});
