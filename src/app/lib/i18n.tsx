import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import type { Language } from "../../shared/settings";
import { en, es, type MessageKey } from "./dict";

export type PanelLanguage = "en" | "es";
/** "attention.lost" for the pair "attention.lost.one" / "attention.lost.other". */
export type PluralKey = Extract<MessageKey, `${string}.other`> extends `${infer Base}.other` ? Base : never;
export type T = (key: MessageKey | PluralKey, vars?: Record<string, string | number>) => string;

const DICTS: Record<PanelLanguage, Record<MessageKey, string>> = { en, es };

/** 'de' (and anything unknown) falls back to English. */
export function toPanelLanguage(lang: Language | string | undefined): PanelLanguage {
  return lang === "es" ? "es" : "en";
}

export function browserLanguage(): PanelLanguage {
  return toPanelLanguage(navigator.language.slice(0, 2));
}

const RULES: Record<PanelLanguage, Intl.PluralRules> = {
  en: new Intl.PluralRules("en"),
  es: new Intl.PluralRules("es"),
};

function lookup(lang: PanelLanguage, key: string): string | undefined {
  return (DICTS[lang] as Record<string, string>)[key] ?? (en as Record<string, string>)[key];
}

/** Plural keys are `<base>.one` / `<base>.other`; the form comes from `Intl.PluralRules` and `vars.n`. */
function pluralForm(lang: PanelLanguage, key: string, n: number): string | undefined {
  return lookup(lang, `${key}.${RULES[lang].select(n)}`) ?? lookup(lang, `${key}.other`);
}

export function translate(
  lang: PanelLanguage,
  key: MessageKey | PluralKey,
  vars?: Record<string, string | number>,
): string {
  const n = vars?.n;
  const raw: string =
    (typeof n === "number" ? pluralForm(lang, key, n) : undefined) ?? lookup(lang, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ""));
}

const I18nContext = createContext<{ lang: PanelLanguage; t: T }>({
  lang: "en",
  t: (key, vars) => translate("en", key, vars),
});

export function I18nProvider({ lang, children }: { lang: PanelLanguage; children: ReactNode }) {
  const t = useCallback<T>((key, vars) => translate(lang, key, vars), [lang]);
  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = (): T => useContext(I18nContext).t;
