/** Accept either a bare array or `{ [key]: array }` from list endpoints. */
export function unwrapList<T>(res: T[] | Record<string, unknown>, key: string): T[] {
  if (Array.isArray(res)) return res;
  const inner = res[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}
