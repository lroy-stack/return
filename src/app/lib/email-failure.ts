import type { TestEmailResult } from "../../shared/schemas";
import type { T } from "./i18n";

/** The panel's own wording for an email failure code (the API's `message` is English and only a fallback). */
export function emailFailureText(code: Exclude<TestEmailResult["code"], "sent">, t: T): string {
  return t(`email.fail.${code}` as const);
}
