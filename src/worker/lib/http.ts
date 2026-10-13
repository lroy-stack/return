import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { ApiError } from "../../shared/schemas";

/** Throw from any handler; rendered as `{ error: { code, message } }` for the API. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);

export function apiErrorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON");
  }
  return parseWith(schema, raw);
}

export function parseWith<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError(422, "validation_failed", "Some fields are invalid", result.error.issues);
  }
  return result.data;
}

export function toErrorResponse(err: unknown, c: Context): Response {
  if (err instanceof AppError) return c.json(apiErrorBody(err.code, err.message, err.details), err.status);
  if (err instanceof HTTPException) return c.json(apiErrorBody("http_error", err.message), err.status);
  console.error(JSON.stringify({ level: "error", msg: "unhandled", error: String(err), path: c.req.path }));
  return c.json(apiErrorBody("internal", "Unexpected error"), 500);
}

const CSP_PUBLIC = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const CSP_APP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

/**
 * Headers for capability-URL pages (tag and conversation pages): never indexed, never cached
 * by shared caches, never leak the URL through the Referer header.
 */
export const capabilityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  c.header("Referrer-Policy", "no-referrer");
  // Handlers may opt into short private caching (e.g. the public item photo); default is no-store.
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  c.header("Content-Security-Policy", CSP_PUBLIC);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
};

export const appHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow, noarchive");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  if (!c.res.headers.has("Cache-Control")) c.header("Cache-Control", "no-store");
  // Vite's dev server injects an inline React Refresh preamble, so CSP applies to built assets only.
  const isHtml = (c.res.headers.get("Content-Type") ?? "").includes("text/html");
  if (isHtml && c.env.ENVIRONMENT !== "development") {
    c.header("Content-Security-Policy", CSP_APP);
  }
};

/**
 * CSRF defence for state-changing requests: browsers always send Origin on cross-site
 * POST/PUT/PATCH/DELETE, so require it to match the request's own origin.
 */
export const sameOriginWrites: MiddlewareHandler = async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  const origin = c.req.header("Origin");
  const expected = new URL(c.req.url).origin;
  if (origin !== expected) {
    throw new AppError(403, "bad_origin", "Cross-origin request rejected");
  }
  return next();
};
