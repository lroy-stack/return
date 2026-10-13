/** Joins class names, skipping falsy values. Components own their classes; callers add layout only. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
