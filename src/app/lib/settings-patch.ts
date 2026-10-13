import { deepMerge, type Settings } from "../../shared/settings";

type Doc = Record<string, unknown>;

const isDoc = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The smallest nested document that turns `before` into `after` (what `PATCH /api/settings` deep-merges).
 * Objects are compared key by key; any other value (including arrays and null) is replaced as a whole.
 */
export function settingsDiff(before: unknown, after: unknown): Doc {
  const out: Doc = {};
  if (!isDoc(before) || !isDoc(after)) return out;
  for (const key of Object.keys(after)) {
    const a = after[key];
    const b = before[key];
    if (isDoc(a) && isDoc(b)) {
      const nested = settingsDiff(b, a);
      if (Object.keys(nested).length > 0) out[key] = nested;
    } else if (JSON.stringify(a) !== JSON.stringify(b)) out[key] = a;
  }
  return out;
}

export const isEmptyPatch = (patch: Doc): boolean => Object.keys(patch).length === 0;

/** `settings` with `patch` laid over it. */
export function applyPatch(settings: Settings, patch: Doc): Settings {
  return deepMerge(settings, patch) as Settings;
}
