import { useCallback, useState } from "react";
import type { z } from "zod";

export type FieldErrors = Record<string, string>;

/** Parse with a shared schema and return either the data or dotted-path field errors. */
export function validate<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.output<S> } | { ok: false; errors: FieldErrors } {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const errors: FieldErrors = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

/** String-valued form state with typed keys. */
export function useFormValues<T extends Record<string, string | boolean>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  }, []);
  return { values, set, setValues };
}

export const emptyToNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

/** True once the form's values differ from what they were when the form opened (feeds `useSheetGuard`). */
export function useDirty(values: unknown): boolean {
  const [initial] = useState(() => JSON.stringify(values));
  return JSON.stringify(values) !== initial;
}
