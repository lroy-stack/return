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

/** A proposer's local wall-clock time ("2026-10-14T18:30") has no zone; format it as typed. */
export function formatWallClock(local: string, lang: Language): string {
  const date = new Date(`${local}:00Z`);
  if (Number.isNaN(date.getTime())) return local;
  return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(
    date,
  );
}

export function formatCoordinate(n: number): string {
  return n.toFixed(5);
}
