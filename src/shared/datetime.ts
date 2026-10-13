/**
 * Wall-clock times with an explicit IANA time zone, shared by the worker and the panel.
 * A meeting time is stored as typed ("2026-10-14T18:30") plus the zone it was typed in, so both
 * parties read the same moment and the zone is always named.
 */

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const ZONE_SHAPE = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2}$/;

/** A meeting may be proposed up to this long after it started (clock skew, "right now"). */
export const MEETING_GRACE_MS = 10 * 60_000;

export interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** Parses "YYYY-MM-DDTHH:MM"; null for anything that is not a real calendar date and time (2026-02-31, 24:00). */
export function parseWallClock(local: string): WallClockParts | null {
  const m = WALL_CLOCK.exec(local);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number) as [number, number, number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const real =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day &&
    probe.getUTCHours() === hour &&
    probe.getUTCMinutes() === minute;
  return real ? { year, month, day, hour, minute } : null;
}

export function isRealWallClock(local: string): boolean {
  return parseWallClock(local) !== null;
}

let knownZones: Set<string> | undefined;

/** A real IANA zone ("Europe/Madrid", "UTC"). Offsets, abbreviations and made-up names are refused. */
export function isValidTimeZone(zone: string): boolean {
  if (zone === "UTC") return true;
  knownZones ??= new Set(Intl.supportedValuesOf("timeZone"));
  if (knownZones.has(zone)) return true;
  // Browsers may report a valid alias that the canonical list omits (e.g. Asia/Kolkata).
  if (!ZONE_SHAPE.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** A well-formed BCP 47 tag ("en-GB"); "en_GB" and junk are refused. */
export function isValidLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch {
    return false;
  }
}

function offsetMs(utcMs: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return shown - Math.floor(utcMs / 1000) * 1000;
}

/** The instant at which a clock in `zone` reads `local`; null when `local` or `zone` is invalid. */
export function wallClockToInstant(local: string, zone: string): Date | null {
  const p = parseWallClock(local);
  if (!p || !isValidTimeZone(zone)) return null;
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const first = asUtc - offsetMs(asUtc, zone);
  return new Date(asUtc - offsetMs(first, zone));
}

/** True when the meeting started more than the grace period ago, judged on the clock of `zone`. */
export function isPastMeeting(local: string, zone: string, now: Date = new Date()): boolean {
  const at = wallClockToInstant(local, zone);
  return at !== null && at.getTime() < now.getTime() - MEETING_GRACE_MS;
}

/** The current wall clock in `zone` as "YYYY-MM-DDTHH:MM". */
export function nowInZone(zone: string, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + offsetMs(now.getTime(), zone));
  return shifted.toISOString().slice(0, 16);
}

/** "Madrid" for Europe/Madrid, "Buenos Aires" for America/Argentina/Buenos_Aires, "UTC" for UTC. */
export function zoneLabel(zone: string): string {
  return (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");
}

/** "14 Oct 2026, 18:30 (Madrid)". Without a zone (legacy rows) the zone name is omitted. */
export function formatMeeting(local: string, zone: string | null, locale: string): string {
  const p = parseWallClock(local);
  if (!p) return local;
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute));
  const text = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
  return zone ? `${text} (${zoneLabel(zone)})` : text;
}
