import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";
import type { Language } from "../../shared/settings";
import { en, es, type MessageKey } from "./dict";

export type PanelLanguage = "en" | "es";
export type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

const DICTS: Record<PanelLanguage, Record<MessageKey, string>> = { en, es };

/** 'de' (and anything unknown) falls back to English. */
export function toPanelLanguage(lang: Language | string | undefined): PanelLanguage {
  return lang === "es" ? "es" : "en";
}

export function browserLanguage(): PanelLanguage {
  return toPanelLanguage(navigator.language.slice(0, 2));
}

export function translate(
  lang: PanelLanguage,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const raw: string = DICTS[lang][key] ?? en[key] ?? key;
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
