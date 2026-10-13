import { formatMeeting } from "../../shared/datetime";
import type { Language } from "../../shared/settings";

/** Server-side timestamps are shown in UTC (labelled); public.js re-renders them in the viewer's zone. */
export function formatInstant(iso: string, lang: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

const WALL_CLOCK_LOCALE: Record<Language, string> = { en: "en-GB", de: "de-DE", es: "es-ES" };

/** A proposer's wall-clock time with the zone it was typed in: "14 Oct 2026, 18:30 (Madrid)". */
export function formatWallClock(local: string, zone: string | null, lang: Language): string {
  return formatMeeting(local, zone, WALL_CLOCK_LOCALE[lang]);
}

export function formatCoordinate(n: number): string {
  return n.toFixed(5);
}
