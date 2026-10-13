import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { LANGUAGES, type Language } from "../../shared/settings";

function asLanguage(value: string | undefined | null): Language | null {
  const code = value?.trim().toLowerCase().slice(0, 2);
  return LANGUAGES.find((l) => l === code) ?? null;
}

/** First supported language in an Accept-Language header, honouring q-values. */
export function fromAcceptLanguage(header: string | undefined | null): Language | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag, weight: Number.isFinite(weight) ? weight : 0 };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  for (const { tag } of ranked) {
    const lang = asLanguage(tag);
    if (lang) return lang;
  }
  return null;
}

/** ?lang= > cookie `lang` > Accept-Language > the given fallback. */
export function negotiateLanguage(c: Context, fallback: Language = "en"): Language {
  return (
    asLanguage(c.req.query("lang")) ??
    asLanguage(getCookie(c, "lang")) ??
    fromAcceptLanguage(c.req.header("Accept-Language")) ??
    fallback
  );
}

/** Explicit choices only (query or cookie), used where the stored language is the next fallback. */
export function explicitLanguage(c: Context): Language | null {
  return asLanguage(c.req.query("lang")) ?? asLanguage(getCookie(c, "lang"));
}
