/**
 * HTML forms deliver strings. These parsers turn them into the shared zod contracts and report
 * problems as localized messages keyed by field, so the page can re-render with the user's input.
 */
import { z } from "zod";
import { isValidTimeZone } from "../../shared/datetime";
import { locationInputSchema, messageInputSchema, proposalInputSchema } from "../../shared/schemas";
import type { LocationData } from "../domain/conversations";
import type { FormErrors, FormValues } from "./components";
import type { Dict } from "./i18n";

const MAX_FIELD_CHARS = 5000;

export type Parsed<T> = { ok: true; data: T } | { ok: false; errors: FormErrors };

/** Keeps only string fields (a file upload is not a valid answer) and caps echoed input. */
export function toFormValues(body: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") values[key] = value.slice(0, MAX_FIELD_CHARS);
  }
  return values;
}

const emailSchema = z.email().max(254);

export function parseMessage(values: FormValues, t: Dict): Parsed<string> {
  const result = messageInputSchema.safeParse({ body: values.message ?? "" });
  return result.success
    ? { ok: true, data: result.data.body }
    : { ok: false, errors: { message: t.errors.message } };
}

const NUMBER = /^-?\d+(\.\d+)?$/;

function numberOrNull(raw: string | undefined): number | null | "invalid" {
  const text = raw?.trim();
  if (!text) return null;
  return NUMBER.test(text) ? Number(text) : "invalid";
}

/** Returns data null when the finder left every location field empty. */
export function parseLocation(values: FormValues, t: Dict): Parsed<LocationData | null> {
  const label = values.location_label?.trim() ?? "";
  const lat = numberOrNull(values.location_lat);
  const lng = numberOrNull(values.location_lng);
  const accuracy = numberOrNull(values.location_accuracy);
  if (!label && lat === null && lng === null) return { ok: true, data: null };
  const fail: Parsed<LocationData | null> = { ok: false, errors: { location: t.errors.location } };
  // Consent is the act itself: typing a place or tapping "Use my current position" (the page says who sees it).
  if (lat === "invalid" || lng === "invalid" || accuracy === "invalid") return fail;
  const result = locationInputSchema.safeParse({
    source: values.location_source === "gps" ? "gps" : "manual",
    label: label || null,
    lat,
    lng,
    accuracyM: accuracy,
  });
  return result.success ? { ok: true, data: result.data } : fail;
}

export interface ContactInput {
  message: string;
  name: string | null;
  email: string | null;
  location: LocationData | null;
}

export function parseContact(values: FormValues, t: Dict, acceptEmail: boolean): Parsed<ContactInput> {
  const errors: FormErrors = {};
  const message = parseMessage(values, t);
  if (!message.ok) Object.assign(errors, message.errors);

  const name = values.name?.trim() || null;
  if (name && name.length > 80) errors.name = t.errors.name;

  const rawEmail = acceptEmail ? values.email?.trim() || null : null;
  if (rawEmail && !emailSchema.safeParse(rawEmail).success) errors.email = t.errors.email;

  const location = parseLocation(values, t);
  if (!location.ok) Object.assign(errors, location.errors);

  if (Object.keys(errors).length > 0 || !message.ok || !location.ok) return { ok: false, errors };
  return { ok: true, data: { message: message.data, name, email: rawEmail, location: location.data } };
}

export function parseProposal(values: FormValues, t: Dict): Parsed<z.output<typeof proposalInputSchema>> {
  const meetRaw = values.meet_at?.trim().slice(0, 16) || null;
  const result = proposalInputSchema.safeParse({
    kind: values.kind,
    place: values.place ?? "",
    meetAt: meetRaw,
    // A zone the browser reported; anything unusable falls back to the owner's time zone in the domain layer.
    meetTz: values.meet_tz && isValidTimeZone(values.meet_tz) ? values.meet_tz : null,
    instructions: values.instructions ?? null,
  });
  const errors: FormErrors = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "form");
      if (field === "kind") errors.kind = t.errors.kind;
      else if (field === "place") errors.place = t.errors.place;
      else if (field === "meetAt") errors.meetAt = t.errors.when;
      else if (field === "instructions") errors.instructions = t.errors.instructions;
      else errors.form = t.errors.fixFields;
    }
    return { ok: false, errors };
  }
  return { ok: true, data: result.data };
}
