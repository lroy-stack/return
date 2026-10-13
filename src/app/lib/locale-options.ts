import { zoneLabel } from "../../shared/datetime";
import { LANGUAGES, type Language } from "../../shared/settings";

/**
 * Option data for the time zone and locale pickers (Settings › Identity; reusable wherever a zone is chosen).
 * Shapes match `SelectOption` from ui/Select.tsx structurally, so callers pass them straight through.
 */

export const ZONE_REGIONS = [
  "africa",
  "america",
  "antarctica",
  "arctic",
  "asia",
  "atlantic",
  "australia",
  "europe",
  "indian",
  "pacific",
  "other",
] as const;
export type ZoneRegion = (typeof ZONE_REGIONS)[number];

const REGION_OF: Record<string, ZoneRegion> = {
  Africa: "africa",
  America: "america",
  Antarctica: "antarctica",
  Arctic: "arctic",
  Asia: "asia",
  Atlantic: "atlantic",
  Australia: "australia",
  Europe: "europe",
  Indian: "indian",
  Pacific: "pacific",
};

const FALLBACK_ZONES = ["UTC", "Europe/Berlin", "Europe/Madrid", "Europe/London", "America/New_York"];

export interface ZoneOption {
  value: string;
  /** City ("Buenos Aires (Argentina)"). */
  label: string;
  /** Current offset and long name: "GMT+02:00 · Central European Summer Time". */
  description: string;
  region: ZoneRegion;
  /** IANA id and compact offsets ("GMT+2", "UTC+2") for search. */
  keywords: string;
}

function zoneName(zone: string, locale: string, style: "longOffset" | "shortOffset" | "long", at: Date) {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: style })
        .formatToParts(at)
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
}

/** Built lists by locale, saved zone and UTC day (offsets only change at DST transitions). */
const zoneCache = new Map<string, ZoneOption[]>();

/**
 * Every IANA zone the browser knows (plus UTC and `current`), with today's offset, grouped by region and sorted
 * by city. About 420 entries and ~1,200 Intl formatters (70–100 ms), so the result is cached per
 * (locale, current, day): remounting Settings › Identity costs nothing. Treat the array as read-only.
 */
export function timeZoneOptions(locale: string, current?: string, at: Date = new Date()): ZoneOption[] {
  const key = `${locale}|${current ?? ""}|${at.toISOString().slice(0, 10)}`;
  const hit = zoneCache.get(key);
  if (hit) return hit;
  const built = buildZoneOptions(locale, current, at);
  if (zoneCache.size > 8) zoneCache.clear();
  zoneCache.set(key, built);
  return built;
}

function buildZoneOptions(locale: string, current: string | undefined, at: Date): ZoneOption[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = FALLBACK_ZONES;
  }
  const all = new Set(zones);
  all.add("UTC");
  if (current) all.add(current);
  const order = (r: ZoneRegion) => ZONE_REGIONS.indexOf(r);
  return [...all]
    .map((zone): ZoneOption => {
      const parts = zone.split("/");
      const region = REGION_OF[parts[0] ?? ""] ?? "other";
      const sub = parts.length > 2 ? parts[1]?.replaceAll("_", " ") : undefined;
      const offset = zoneName(zone, "en-US", "longOffset", at) || "GMT";
      const short = zoneName(zone, "en-US", "shortOffset", at) || "GMT";
      const long = zoneName(zone, locale, "long", at);
      const city = zoneLabel(zone);
      return {
        value: zone,
        label: sub ? `${city} (${sub})` : city,
        description: long && long !== offset ? `${offset} · ${long}` : offset,
        region,
        keywords: `${zone} ${short} ${short.replace("GMT", "UTC")} ${offset.replace("GMT", "UTC")}`,
      };
    })
    .sort((a, b) => order(a.region) - order(b.region) || a.label.localeCompare(b.label, locale));
}

/** Common locales for an owner travelling in Europe and the Americas; the current value is always kept. */
const LOCALES = [
  "en-GB",
  "en-US",
  "en-IE",
  "en-CA",
  "en-AU",
  "en-NZ",
  "en-IN",
  "en-ZA",
  "de-DE",
  "de-AT",
  "de-CH",
  "es-ES",
  "es-MX",
  "es-AR",
  "es-CO",
  "es-CL",
  "es-US",
  "fr-FR",
  "fr-BE",
  "fr-CA",
  "fr-CH",
  "it-IT",
  "pt-PT",
  "pt-BR",
  "nl-NL",
  "nl-BE",
  "da-DK",
  "sv-SE",
  "nb-NO",
  "fi-FI",
  "pl-PL",
  "cs-CZ",
  "ja-JP",
  "ko-KR",
  "zh-CN",
  "zh-TW",
];

export interface LocaleOption {
  value: string;
  /** "English (United Kingdom)" in the panel language. */
  label: string;
  /** How a date and a number look: "31/10/2026 · 1,234.5". */
  description: string;
  keywords: string;
}

export function localeOptions(displayLocale: string, current?: string): LocaleOption[] {
  const tags = current && !LOCALES.includes(current) ? [...LOCALES, current] : LOCALES;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([displayLocale], { type: "language", languageDisplay: "standard" });
  } catch {
    names = null;
  }
  const sampleDate = new Date(Date.UTC(2026, 9, 31, 12));
  return tags
    .map((tag): LocaleOption => {
      let description = tag;
      try {
        const date = new Intl.DateTimeFormat(tag, { dateStyle: "short", timeZone: "UTC" }).format(sampleDate);
        const number = new Intl.NumberFormat(tag).format(1234.5);
        description = `${date} · ${number}`;
      } catch {
        // Unknown to this browser: show the tag itself.
      }
      let label = tag;
      try {
        label = names?.of(tag) ?? tag;
      } catch {
        label = tag;
      }
      return { value: tag, label, description, keywords: tag };
    })
    .sort((a, b) => a.label.localeCompare(b.label, displayLocale));
}

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch", es: "Español" };

/** Finder-page / printed-card languages, each named in its own language. */
export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = LANGUAGES.map((value) => ({
  value,
  label: LANGUAGE_NAMES[value],
}));
