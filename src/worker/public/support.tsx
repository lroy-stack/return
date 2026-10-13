import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../env";
import { isDevelopment } from "../env";
import { AppError, sameOriginWrites } from "../lib/http";
import { allowPublicRead } from "../lib/ratelimit";
import { dict } from "./i18n";
import { negotiateLanguage } from "./lang";
import { renderPage } from "./layout";
import { DegradedPage, InactivePage, MessagePage } from "./pages";

type C = Context<AppEnv>;

const MAX_FORM_BYTES = 32_768;
const DEV_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

/** Run a side effect after the response without ever failing the request. */
export function defer(c: C, work: Promise<unknown>): void {
  const safe = work.catch((err) =>
    console.error(JSON.stringify({ level: "error", msg: "deferred task failed", error: String(err) })),
  );
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    // No execution context (unit-style call): the promise still runs to completion.
  }
}

export function turnstileSiteKey(env: Env): string {
  return env.TURNSTILE_SITE_KEY || (isDevelopment(env) ? DEV_TURNSTILE_SITE_KEY : "");
}

/**
 * Forms submitted by browsers that follow the Fetch spec send `Origin: null` when the page's
 * Referrer-Policy is no-referrer (which these pages must keep). Same-origin form posts are then
 * recognised by Sec-Fetch-Site, which scripts cannot forge; everything else needs a matching Origin.
 */
export const publicWrites: MiddlewareHandler = async (c, next) => {
  if (c.req.header("Origin") === "null" && c.req.header("Sec-Fetch-Site") === "same-origin") return next();
  return sameOriginWrites(c, next);
};

export const readBudget: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!(await allowPublicRead(c.env, c.req.raw)))
    throw new AppError(429, "rate_limited", "Too many requests");
  return next();
};

export function assertSmallForm(c: C): void {
  const length = Number(c.req.header("Content-Length") ?? 0);
  if (length > MAX_FORM_BYTES) throw new AppError(413, "too_large", "Request too large");
}

export async function htmlPage(
  c: C,
  node: { toString(): string | Promise<string> },
  status: ContentfulStatusCode = 200,
): Promise<Response> {
  return c.html(await renderPage(node), status);
}

export function inactiveTagResponse(c: C, page: { toString(): string | Promise<string> }): Promise<Response> {
  return htmlPage(c, page, 404);
}

export async function degradedResponse(c: C): Promise<Response> {
  c.header("Retry-After", "120");
  return htmlPage(c, <DegradedPage lang={negotiateLanguage(c)} email={c.env.FALLBACK_CONTACT_EMAIL} />, 503);
}

export function errorMessage(err: AppError, lang: ReturnType<typeof negotiateLanguage>): string {
  const t = dict(lang).errors;
  switch (err.code) {
    case "conversation_closed":
      return t.closed;
    case "proposal_not_pending":
      return t.pending;
    case "bad_origin":
      return t.forbidden;
    case "not_allowed":
      return t.notAllowed;
    case "too_large":
      return t.tooLarge;
    case "rate_limited":
      return t.tryLater;
    case "not_found":
      return t.notFound;
    case "validation_failed":
      return t.fixFields;
    default:
      return t.generic;
  }
}

/** Errors on public pages are HTML, never JSON and never a stack trace. */
export async function handlePublicError(err: unknown, c: C): Promise<Response> {
  const lang = negotiateLanguage(c);
  if (err instanceof AppError) {
    const message = errorMessage(err, lang);
    return c.html(await renderPage(<MessagePage lang={lang} title={message} />), err.status);
  }
  console.error(JSON.stringify({ level: "error", msg: "unhandled", error: String(err), path: c.req.path }));
  const message = dict(lang).errors.generic;
  return c.html(await renderPage(<MessagePage lang={lang} title={message} />), 500);
}

export function notFoundPage(c: C): Promise<Response> {
  return htmlPage(c, <InactivePage lang={negotiateLanguage(c)} />, 404);
}
