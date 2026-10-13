/** Tiny typed fetch client for the owner API (same origin, cookies automatic). */
import { reportApiReachable } from "./connectivity";

interface Issue {
  path: ReadonlyArray<string | number>;
  message: string;
}

function isIssue(v: unknown): v is Issue {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return Array.isArray(r.path) && typeof r.message === "string";
}

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  /** zod issue paths from a 422 response, keyed by dotted path ("contact.email"). First issue wins. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (!Array.isArray(this.details)) return out;
    for (const issue of this.details) {
      if (!isIssue(issue)) continue;
      const key = issue.path.join(".");
      if (!(key in out)) out[key] = issue.message;
    }
    return out;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

function isErrorBody(v: unknown): v is { error: { code: string; message: string; details?: unknown } } {
  if (typeof v !== "object" || v === null || !("error" in v)) return false;
  const e = (v as { error: unknown }).error;
  return typeof e === "object" && e !== null && "code" in e && "message" in e;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json") ?? false;
  const body: unknown = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (isErrorBody(body)) {
      throw new ApiRequestError(res.status, body.error.code, body.error.message, body.error.details);
    }
    throw new ApiRequestError(res.status, "http_error", `Request failed (${res.status})`);
  }
  // A truncated or unparsable body must surface as a recoverable error, never as `null` data.
  if (!isJson || body === null) {
    throw new ApiRequestError(res.status, "bad_response", "Unexpected response from the server");
  }
  return body as T;
}

async function request<T>(method: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, credentials: "same-origin", ...init });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    reportApiReachable(false);
    throw new ApiRequestError(0, "network", "Network error");
  }
  reportApiReachable(true);
  return parse<T>(res);
}

const jsonInit = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, { signal }),
  post: <T>(path: string, body?: unknown) =>
    request<T>("POST", path, body === undefined ? {} : jsonInit(body)),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, jsonInit(body)),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, jsonInit(body)),
  delete: <T = void>(path: string, body?: unknown) =>
    request<T>("DELETE", path, body === undefined ? {} : jsonInit(body)),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, { body: form }),
};

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
