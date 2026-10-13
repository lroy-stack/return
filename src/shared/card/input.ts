import type { Tag } from "../schemas";
import { type Language, pickLocalized, type Settings } from "../settings";
import type { CardInput, CardTheme } from "./types";

export interface CardOverrides {
  theme?: CardTheme;
  language?: Language;
  showReward?: boolean;
}

/** Map a tag and the owner's settings to a card. Overrides come from the print studio controls. */
export function cardInputFromSettings(
  tag: Tag,
  settings: Settings,
  overrides: CardOverrides = {},
): CardInput {
  const language = overrides.language ?? settings.tags.cardLanguage;
  return {
    url: tag.url,
    label: tag.label,
    theme: overrides.theme ?? settings.tags.cardTheme,
    language,
    ownerName: settings.tags.showNameOnCard ? settings.identity.publicName.trim() || null : null,
    printedEmail: settings.tags.printedEmail,
    cardMessage: pickLocalized(settings.tags.cardMessage, language) || null,
    showReward: overrides.showReward ?? false,
  };
}
