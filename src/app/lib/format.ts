import { formatMeeting } from "../../shared/datetime";

export interface Formatter {
  date: (iso: string | null | undefined) => string;
  dateTime: (iso: string | null | undefined) => string;
  money: (cents: number | null | undefined, currency: string | null | undefined) => string;
  relative: (iso: string | null | undefined) => string;
  /** A meeting time as typed plus its zone: "14 Oct 2026, 18:30 (Madrid)". Never converted to another zone. */
  meeting: (local: string | null | undefined, zone: string | null | undefined) => string;
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
    meeting: (local, zone) =>
      local
        ? safeIntl(
            () => formatMeeting(local, zone ?? null, locale),
            () => formatMeeting(local, zone ?? null, "en"),
          )
        : "",
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

function separators(locale: string): { group: string; decimal: string } {
  const parts = (() => {
    try {
      return new Intl.NumberFormat(locale).formatToParts(1234567.8);
    } catch {
      return new Intl.NumberFormat(undefined).formatToParts(1234567.8);
    }
  })();
  return {
    group: parts.find((p) => p.type === "group")?.value ?? ",",
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
  };
}

const count = (text: string, char: string) => text.split(char).length - 1;

/**
 * "1.234,50", "1,234.50", "12,50", "12.5" -> cents; undefined when empty, null when it is not an amount.
 * With both separators the last one is the decimal point. A lone separator is the decimal point when it is the
 * locale's, or when it is not followed by exactly three digits ("12.500" in en is 12.5; "1.234" in es is 1234).
 */
export function parseMoneyToCents(value: string, locale = "en"): number | null | undefined {
  const text = value.replace(/[\s'\u2019\u00a0\u202f]/g, "");
  if (!text) return undefined;
  if (!/^\d[\d.,]*$/.test(text)) return null;
  const dot = text.lastIndexOf(".");
  const comma = text.lastIndexOf(",");
  let decimal: "." | "," | null = null;
  if (dot >= 0 && comma >= 0) {
    decimal = dot > comma ? "." : ",";
  } else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? "." : ",";
    const afterLast = text.length - text.lastIndexOf(sep) - 1;
    if (count(text, sep) === 1 && (sep === separators(locale).decimal || afterLast !== 3)) decimal = sep;
  }
  const group = decimal === "." ? "," : decimal === "," ? "." : dot >= 0 ? "." : ",";
  const [whole = "", fraction = ""] = decimal ? text.split(decimal) : [text, ""];
  if (decimal && count(text, decimal) > 1) return null;
  if (fraction.includes(group)) return null;
  // Grouped digits must be well formed: 1.234.567, not 1.23.4567.
  if (whole.includes(group) && !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(whole)) return null;
  const n = Number(`${whole.split(group).join("")}.${fraction || "0"}`);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** 123456 -> "1234.56" for an English panel, "1234,56" for Spanish: what the money field shows when editing. */
export function centsToInput(cents: number | null | undefined, locale = "en"): string {
  if (cents == null) return "";
  return safeIntl(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      }).format(cents / 100),
    () => (cents / 100).toFixed(2),
  );
}
