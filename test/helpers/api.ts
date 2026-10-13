import { APP, accessJwt, worker } from "./auth";

type Json = Record<string, unknown> | unknown[] | null;

/** Authenticated owner request against the app host. */
export async function api(
  method: string,
  path: string,
  body?: Json,
  opts: { email?: string; jwt?: string | null; origin?: string | null } = {},
): Promise<Response> {
  const headers = new Headers();
  const jwt = opts.jwt === undefined ? await accessJwt(opts.email) : opts.jwt;
  if (jwt) headers.set("Cf-Access-Jwt-Assertion", jwt);
  if (opts.origin !== null) headers.set("Origin", opts.origin ?? APP);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return worker.fetch(
    new Request(`${APP}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

export async function apiJson<T>(method: string, path: string, body?: Json): Promise<T> {
  const res = await api(method, path, body);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}
