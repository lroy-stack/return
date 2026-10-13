import { z } from "zod";
import { isValidLocale, isValidTimeZone } from "./datetime";

export const LANGUAGES = ["en", "de", "es"] as const;
export type Language = (typeof LANGUAGES)[number];
export const languageSchema = z.enum(LANGUAGES);

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().default(null);

/** A text shown to finders in each supported language. Empty strings fall back to English. */
export const localizedSchema = (max: number) =>
  z.object({ en: text(max).default(""), de: text(max).default(""), es: text(max).default("") });
export type Localized = { en: string; de: string; es: string };

export const contactVisibilitySchema = z.object({
  email: z.boolean(),
  phone: z.boolean(),
  whatsapp: z.boolean(),
  trustedContacts: z.boolean(),
});
export type ContactVisibility = z.infer<typeof contactVisibilitySchema>;

export const CARD_THEMES = ["petrol", "sage", "warm"] as const;

export const settingsSchema = z.object({
  identity: z
    .object({
      publicName: text(80).default(""),
      panelLanguage: languageSchema.default("en"),
      defaultPublicLanguage: languageSchema.default("en"),
      timezone: text(64).refine(isValidTimeZone, "Unknown time zone").default("Europe/Berlin"),
      locale: text(16).refine(isValidLocale, "Unknown locale").default("en-GB"),
    })
    .prefault({}),
  messages: z
    .object({
      returnMessage: localizedSchema(600).prefault({}),
      lostMessage: localizedSchema(600).prefault({}),
      thankYouMessage: localizedSchema(300).prefault({}),
    })
    .prefault({}),
  contact: z
    .object({
      email: z.email().max(254).nullable().default(null),
      phone: optionalText(32),
      whatsapp: optionalText(32),
      // Default visibility on public pages. Items can override it.
      visibility: contactVisibilitySchema.default({
        email: false,
        phone: false,
        whatsapp: false,
        trustedContacts: false,
      }),
    })
    .prefault({}),
  notifications: z
    .object({
      emailEnabled: z.boolean().default(true),
      // Must be a verified destination address in Cloudflare Email Service/Routing.
      emailAddress: z.email().max(254).nullable().default(null),
      events: z
        .object({
          newConversation: z.boolean().default(true),
          newMessage: z.boolean().default(true),
          locationShared: z.boolean().default(true),
          proposal: z.boolean().default(true),
          lostItemScanned: z.boolean().default(true),
        })
        .prefault({}),
      mutedUntil: z.iso.datetime().nullable().default(null),
      push: z
        .object({
          // Subscriptions exist only when a device opted in, so on by default.
          enabled: z.boolean().default(true),
          // Lock screens are public: the item name stays out of push payloads unless asked for.
          showItemName: z.boolean().default(false),
        })
        .prefault({}),
      // Sending to arbitrary finder addresses needs Cloudflare Email Service on Workers Paid.
      notifyFinders: z.boolean().default(false),
    })
    .prefault({}),
  privacy: z
    .object({
      activityRetentionDays: z.number().int().min(7).max(730).default(180),
      closedConversationRetentionDays: z.number().int().min(7).max(730).default(90),
      recordScanCountry: z.boolean().default(true),
    })
    .prefault({}),
  tags: z
    .object({
      labelPrefix: text(8).default(""),
      labelDigits: z.number().int().min(1).max(6).default(3),
      cardTheme: z.enum(CARD_THEMES).default("petrol"),
      cardLanguage: languageSchema.default("en"),
      showNameOnCard: z.boolean().default(true),
      // Printed fallback contact. Works even if this service is down.
      printedEmail: z.email().max(254).nullable().default(null),
      cardMessage: localizedSchema(90).prefault({}),
    })
    .prefault({}),
  publicPage: z
    .object({
      showOwnerName: z.boolean().default(true),
      showItemPhoto: z.boolean().default(true),
      defaultRewardText: localizedSchema(200).prefault({}),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/** Resolve a localized text for a language, falling back to English, then to a built-in default. */
export function pickLocalized(value: Localized, lang: Language, fallback = ""): string {
  return value[lang] || value.en || fallback;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Recursively overlays `patch` on `base`: objects merge key by key, everything else is replaced. */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = deepMerge(base[key], value);
  return out;
}
