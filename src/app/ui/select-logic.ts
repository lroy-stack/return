/**
 * Pure list logic shared by Select, Combobox and Menu (no React, no DOM): matching, filtering, keyboard steps
 * and type-ahead. Unit-tested in test/select-logic.test.ts.
 */

/** The fields of an option the logic needs (structurally compatible with `SelectOption`). */
export interface ListEntry {
  label: string;
  description?: string;
  keywords?: string;
  disabled?: boolean;
}

/** Case- and accent-insensitive text for matching ("Zürich" ~ "zurich"). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** All whitespace-separated terms must occur in the label, description or keywords (accent-insensitive). */
export function filterOptions<T extends ListEntry>(options: ReadonlyArray<T>, query: string): T[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...options];
  return options.filter((o) => {
    const hay = fold(`${o.label} ${o.description ?? ""} ${o.keywords ?? ""}`);
    return terms.every((term) => hay.includes(term));
  });
}

/** First enabled index from `from` in direction `dir`, or -1. */
export function firstEnabled(options: ReadonlyArray<ListEntry>, from = 0, dir: 1 | -1 = 1): number {
  for (let i = from; i >= 0 && i < options.length; i += dir) if (!options[i]?.disabled) return i;
  return -1;
}

/** Move `by` steps (sign = direction) without wrapping, skipping disabled options. */
export function step(options: ReadonlyArray<ListEntry>, from: number, by: number): number {
  const dir: 1 | -1 = by < 0 ? -1 : 1;
  let i = from < 0 ? (dir === 1 ? -1 : options.length) : from;
  let moved = from;
  for (let n = 0; n < Math.abs(by); n++) {
    const next = firstEnabled(options, i + dir, dir);
    if (next < 0) break;
    i = next;
    moved = next;
  }
  return moved < 0 ? firstEnabled(options) : moved;
}

/** Type-ahead buffer: keys typed within this window form one prefix. */
export const TYPEAHEAD_MS = 600;

export interface TypeaheadBuffer {
  value: string;
  at: number;
}

/**
 * Next index for a type-ahead key press. Keys within `TYPEAHEAD_MS` form a prefix; a repeated single letter
 * ("ccc") cycles through the matches; a one-letter prefix starts after `from`. Mutates `buffer`. -1 = no match.
 */
export function typeaheadMatch<T>(
  items: ReadonlyArray<T>,
  text: (item: T) => string,
  enabled: (item: T) => boolean,
  buffer: TypeaheadBuffer,
  key: string,
  from: number,
  now: number,
): number {
  buffer.value = now - buffer.at > TYPEAHEAD_MS ? key : buffer.value + key;
  buffer.at = now;
  const needle = fold(buffer.value);
  const cycling = needle.length > 1 && [...needle].every((ch) => ch === needle[0]);
  const prefix = cycling ? (needle[0] ?? "") : needle;
  const start = prefix.length === 1 ? from + 1 : from;
  for (let k = 0; k < items.length; k++) {
    const i = (((start + k) % items.length) + items.length) % items.length;
    const item = items[i];
    if (item !== undefined && enabled(item) && fold(text(item)).startsWith(prefix)) return i;
  }
  return -1;
}
