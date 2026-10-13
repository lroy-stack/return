/** Origin used in printed QR/NFC URLs. Falls back to the request origin in local development. */
export function publicOrigin(env: Env, requestUrl?: string): string {
  if (env.PUBLIC_HOST) return `https://${env.PUBLIC_HOST}`;
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:5173";
}

export function appOrigin(env: Env, requestUrl?: string): string {
  if (env.APP_HOST) return `https://${env.APP_HOST}`;
  if (requestUrl) return new URL(requestUrl).origin;
  return "http://localhost:5173";
}

export function tagUrl(origin: string, token: string): string {
  return `${origin}/t/${token}`;
}

/** Owner-only download path for a stored file (served by /api/files/:id). */
export function fileApiPath(fileId: string): string {
  return `/api/files/${fileId}`;
}
