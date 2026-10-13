import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { type Language, languageSchema, pickLocalized, type Settings } from "../../shared/settings";
import { recordActivity } from "../db/activity";
import { findConversationByTokenHash } from "../db/conversations";
import { getSettings } from "../db/settings";
import { createConversation } from "../domain/conversations";
import type { AppEnv } from "../env";
import { AppError, capabilityHeaders } from "../lib/http";
import { hmacHex, isWellFormedSecretToken, normalizeTagToken, sha256Hex } from "../lib/ids";
import { allowPublicWrite, requestIp } from "../lib/ratelimit";
import { nowIso } from "../lib/time";
import { publicOrigin } from "../lib/urls";
import { notifyFinder, notifyOwner } from "../services/notify";
import { verifyTurnstile } from "../services/turnstile";
import type { FormState } from "./components";
import { parseContact, toFormValues } from "./forms";
import { categoryName, defaultLostMessage, defaultReturnMessage, dict } from "./i18n";
import { negotiateLanguage } from "./lang";
import { type ContactLink, InactivePage, TagPage, type TagView } from "./pages";
import {
  countRecentConversations,
  findActiveTag,
  findPublicPhoto,
  isIpBlocked,
  listPublicTrustedContacts,
  type PublicTag,
  type PublicTrustedContact,
} from "./queries";
import {
  assertSmallForm,
  defer,
  degradedResponse,
  htmlPage,
  inactiveTagResponse,
  publicWrites,
  readBudget,
  turnstileSiteKey,
} from "./support";

const DAY_MS = 86_400_000;
const SCAN_LOG_INTERVAL_MS = 3_600_000;
const LOST_NOTIFY_INTERVAL_MS = 6 * 3_600_000;
const MAX_CONVERSATIONS_PER_TAG_PER_DAY = 5;
const MAX_CONVERSATIONS_PER_IP_PER_DAY = 3;
const COOKIE_MAX_AGE_SECONDS = 30 * 86_400;
const SAFE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

type Ctx = Context<AppEnv>;

function digits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function telHref(raw: string): string {
  return `tel:${raw.replace(/[^\d+]/g, "")}`;
}

function contactLinks(
  lang: Language,
  settings: Settings,
  visibility: Settings["contact"]["visibility"],
  trusted: PublicTrustedContact[],
): ContactLink[] {
  const t = dict(lang).tag;
  const { email, phone, whatsapp } = settings.contact;
  const links: ContactLink[] = [];
  if (visibility.email && email) links.push({ label: t.email, href: `mailto:${email}`, text: email });
  if (visibility.phone && phone && digits(phone)) {
    links.push({ label: t.phone, href: telHref(phone), text: phone });
  }
  if (visibility.whatsapp && whatsapp && digits(whatsapp)) {
    links.push({ label: t.whatsapp, href: `https://wa.me/${digits(whatsapp)}`, text: whatsapp });
  }
  if (visibility.trustedContacts) {
    for (const person of trusted) {
      const label = `${t.trusted}: ${person.name}`;
      if (person.email) links.push({ label, href: `mailto:${person.email}`, text: person.email });
      if (person.phone && digits(person.phone)) {
        links.push({ label, href: telHref(person.phone), text: person.phone });
      }
    }
  }
  return links;
}

interface TagContext {
  tag: PublicTag;
  settings: Settings;
  trusted: PublicTrustedContact[];
}

function buildView(
  c: Ctx,
  token: string,
  lang: Language,
  data: TagContext,
  continueUrl: string | null,
): TagView {
  const { tag, settings, trusted } = data;
  const visibility = tag.contactVisibility ?? settings.contact.visibility;
  const reward = tag.rewardText || pickLocalized(settings.publicPage.defaultRewardText, lang) || null;
  const photoVisible = settings.publicPage.showItemPhoto && tag.publicPhotoId;
  return {
    token,
    ownerName:
      settings.publicPage.showOwnerName && settings.identity.publicName ? settings.identity.publicName : null,
    title: tag.publicTitle || categoryName(lang, tag.category),
    photoUrl: photoVisible ? `/t/${token}/photo` : null,
    returnMessage: pickLocalized(settings.messages.returnMessage, lang, defaultReturnMessage(lang)),
    instructions: tag.publicMessage,
    lost:
      tag.itemStatus === "lost"
        ? {
            message: pickLocalized(settings.messages.lostMessage, lang, defaultLostMessage(lang)),
            reward,
          }
        : null,
    contacts: contactLinks(lang, settings, visibility, trusted),
    notifyFinders: settings.notifications.notifyFinders,
    continueUrl,
    siteKey: turnstileSiteKey(c.env),
  };
}

async function loadTagContext(c: Ctx, token: string): Promise<TagContext | null> {
  const tag = await findActiveTag(c.env.DB, token);
  if (!tag) return null;
  const [settings, trusted] = await Promise.all([
    getSettings(c.env.DB, tag.ownerId),
    listPublicTrustedContacts(c.env.DB, tag.ownerId),
  ]);
  return { tag, settings, trusted };
}

/** The finder's own open conversation for this tag, found through the `rc` cookie. */
async function existingConversationUrl(c: Ctx, tag: PublicTag): Promise<string | null> {
  const raw = getCookie(c, "rc");
  if (!raw || !isWellFormedSecretToken(raw)) return null;
  const conv = await findConversationByTokenHash(c.env.DB, await sha256Hex(raw));
  return conv && conv.tag_id === tag.tagId && conv.status === "open" ? `/c/${raw}` : null;
}

/** Scan log: at most one event per tag per hour, and at most one lost-item alert per 6 hours. */
async function recordScan(
  env: Env,
  tag: PublicTag,
  settings: Settings,
  country: string | null,
): Promise<void> {
  const now = nowIso();
  const claimed = await env.DB.prepare(
    "UPDATE tags SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)",
  )
    .bind(now, tag.tagId, new Date(Date.now() - SCAN_LOG_INTERVAL_MS).toISOString())
    .run();
  if (!claimed.meta.changes) return;

  let alert = false;
  if (tag.itemStatus === "lost") {
    const recent = await env.DB.prepare(
      `SELECT 1 AS hit FROM activity_events
        WHERE tag_id = ? AND type = 'tag.scanned' AND json_extract(data, '$.alerted') = 1 AND created_at > ? LIMIT 1`,
    )
      .bind(tag.tagId, new Date(Date.now() - LOST_NOTIFY_INTERVAL_MS).toISOString())
      .first();
    alert = recent === null;
  }
  await recordActivity(env.DB, {
    ownerId: tag.ownerId,
    type: "tag.scanned",
    itemId: tag.itemId,
    tagId: tag.tagId,
    country: settings.privacy.recordScanCountry ? country : null,
    data: { lost: tag.itemStatus === "lost", alerted: alert },
  });
  if (alert) await notifyOwner(env, tag.ownerId, { kind: "lost_item_scanned", itemName: tag.itemName });
}

function parseTagParam(c: Ctx): string | null {
  return normalizeTagToken(c.req.param("token") ?? "");
}

function countryOf(c: Ctx): string | null {
  const country = (c.req.raw as Request & { cf?: { country?: string } }).cf?.country;
  return country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null;
}

export const tagRoutes = new Hono<AppEnv>();
tagRoutes.use("*", capabilityHeaders);
tagRoutes.use("*", publicWrites);
tagRoutes.use("*", readBudget);

tagRoutes.get("/:token", async (c) => {
  const token = parseTagParam(c);
  const fallbackPage = <InactivePage lang={negotiateLanguage(c)} />;
  if (!token) return inactiveTagResponse(c, fallbackPage);

  let data: TagContext | null;
  let continueUrl: string | null;
  try {
    data = await loadTagContext(c, token);
    continueUrl = data ? await existingConversationUrl(c, data.tag) : null;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "tag page degraded", error: String(err) }));
    return degradedResponse(c);
  }
  if (!data) return inactiveTagResponse(c, fallbackPage);

  const lang = negotiateLanguage(c, data.settings.identity.defaultPublicLanguage);
  defer(c, recordScan(c.env, data.tag, data.settings, countryOf(c)));
  return htmlPage(c, <TagPage lang={lang} view={buildView(c, token, lang, data, continueUrl)} />);
});

tagRoutes.post("/:token/contact", async (c) => {
  const token = parseTagParam(c);
  const fallbackPage = <InactivePage lang={negotiateLanguage(c)} />;
  if (!(await allowPublicWrite(c.env, c.req.raw)))
    throw new AppError(429, "rate_limited", "Too many requests");
  assertSmallForm(c);
  if (!token) return inactiveTagResponse(c, fallbackPage);

  let data: TagContext | null;
  try {
    data = await loadTagContext(c, token);
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "contact degraded", error: String(err) }));
    return degradedResponse(c);
  }
  if (!data) return inactiveTagResponse(c, fallbackPage);

  const { tag, settings } = data;
  const values = toFormValues(await c.req.parseBody());
  const lang =
    languageSchema.safeParse(values.lang).data ??
    negotiateLanguage(c, settings.identity.defaultPublicLanguage);
  const t = dict(lang);
  const rerender = (form: FormState, status: 422 | 403) =>
    htmlPage(c, <TagPage lang={lang} view={buildView(c, token, lang, data, null)} form={form} />, status);

  const parsed = parseContact(values, t, settings.notifications.notifyFinders);
  if (!parsed.ok) return rerender({ values, errors: parsed.errors }, 422);

  const ip = requestIp(c.req.raw);
  if (!(await verifyTurnstile(c.env, values["cf-turnstile-response"] ?? null, ip))) {
    return rerender({ values, errors: { form: t.errors.verification } }, 403);
  }

  // Blocked IPs and exceeded caps get the same generic answer, so nothing is revealed.
  const ipHmac = ip ? await hmacHex(c.env.IP_HMAC_SECRET, ip) : null;
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();
  if (ipHmac && (await isIpBlocked(c.env.DB, tag.ownerId, ipHmac, nowIso()))) {
    throw new AppError(429, "rate_limited", "Too many requests");
  }
  const [perTag, perIp] = await Promise.all([
    countRecentConversations(c.env.DB, { tagId: tag.tagId }, dayAgo),
    ipHmac ? countRecentConversations(c.env.DB, { ipHmac }, dayAgo) : Promise.resolve(0),
  ]);
  if (perTag >= MAX_CONVERSATIONS_PER_TAG_PER_DAY || perIp >= MAX_CONVERSATIONS_PER_IP_PER_DAY) {
    throw new AppError(429, "rate_limited", "Too many requests");
  }

  const { id, token: finderToken } = await createConversation(c.env.DB, {
    ownerId: tag.ownerId,
    tagId: tag.tagId,
    itemId: tag.itemId,
    subject: tag.publicTitle || categoryName(settings.identity.panelLanguage, tag.category),
    message: parsed.data.message,
    name: parsed.data.name,
    email: parsed.data.email,
    lang,
    ipHmac,
    location: parsed.data.location,
  });

  const { email } = parsed.data;
  defer(
    c,
    (async () => {
      await notifyOwner(c.env, tag.ownerId, {
        kind: "new_conversation",
        itemName: tag.itemName,
        conversationId: id,
        preview: parsed.data.message,
      });
      if (email) {
        await notifyFinder(
          c.env,
          tag.ownerId,
          { id, finderEmail: email, lang },
          { type: "link", url: `${publicOrigin(c.env, c.req.url)}/c/${finderToken}` },
        );
      }
    })(),
  );

  setCookie(c, "rc", finderToken, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return c.redirect(`/c/${finderToken}`, 303);
});

/** The public photo is served outside the no-store middleware: a short private cache helps slow networks. */
export const photoRoute = new Hono<AppEnv>();
photoRoute.get("/:token/photo", readBudget, async (c) => {
  const notFound = () =>
    new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  const token = parseTagParam(c);
  if (!token) return notFound();
  let object: R2ObjectBody | null = null;
  let contentType = "application/octet-stream";
  try {
    const data = await loadTagContext(c, token);
    if (!data?.settings.publicPage.showItemPhoto) return notFound();
    const file = await findPublicPhoto(c.env.DB, data.tag);
    if (!file) return notFound();
    object = await c.env.FILES.get(file.r2Key);
    if (SAFE_IMAGE_TYPES.has(file.contentType)) contentType = file.contentType;
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "photo failed", error: String(err) }));
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});
