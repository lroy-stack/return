export interface Formatter {
  date: (iso: string | null | undefined) => string;
  dateTime: (iso: string | null | undefined) => string;
  money: (cents: number | null | undefined, currency: string | null | undefined) => string;
  relative: (iso: string | null | undefined) => string;
}

function safeIntl<T>(make: () => T, fallback: () => T): T {
  try {
    return make();
  } catch {
    return fallback();
  }
}

/** Formatters bound to the owner's locale and timezone; invalid settings fall back to the browser's. */
export function createFormatter(locale: string, timeZone: string): Formatter {
  const dateFmt = safeIntl(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }),
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }),
  );
  const dateTimeFmt = safeIntl(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }),
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
  );
  const rtf = safeIntl(
    () => new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" }),
    () => new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" }),
  );
  const parse = (iso: string | null | undefined): Date | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  return {
    date: (iso) => {
      const d = parse(iso);
      return d ? dateFmt.format(d) : "";
    },
    dateTime: (iso) => {
      const d = parse(iso);
      return d ? dateTimeFmt.format(d) : "";
    },
    money: (cents, currency) => {
      if (cents == null) return "";
      const amount = cents / 100;
      return safeIntl(
        () =>
          new Intl.NumberFormat(locale, { style: "currency", currency: currency ?? "EUR" }).format(amount),
        () => `${amount.toFixed(2)} ${currency ?? ""}`.trim(),
      );
    },
    relative: (iso) => {
      const d = parse(iso);
      if (!d) return "";
      const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
      const abs = Math.abs(diffSec);
      if (abs < 60) return rtf.format(0, "second");
      if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
      if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
      if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
      return dateFmt.format(d);
    },
  };
}

/** "2026-10-14T18:30" (datetime-local) -> ISO string in UTC. Empty -> null. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO -> value for <input type="datetime-local"> in the browser's timezone. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowLocalInput(): string {
  return isoToLocalInput(new Date().toISOString());
}

/** "12,50" or "12.50" -> 1250. Returns undefined when empty, NaN-safe via null. */
export function parseMoneyToCents(value: string): number | null | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}
