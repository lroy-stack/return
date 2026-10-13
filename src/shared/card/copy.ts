/** Built-in card texts. Short on purpose: they are read at arm's length by a stranger. */
import type { Language } from "../settings";

export interface CardCopy {
  /** Front headline. */
  headline: string;
  /** Default front message when settings.tags.cardMessage is empty. */
  message: string;
  /** Back: caption above the printed fallback email. */
  emailCaption: string;
  /** Back: caption above the typeable URL. */
  urlCaption: string;
}

export const CARD_COPY: Record<Language, CardCopy> = {
  en: {
    headline: "If found, please scan or tap",
    message: "No app or account needed.",
    emailCaption: "If found, please email",
    urlCaption: "Or open this address",
  },
  de: {
    headline: "Gefunden? Bitte scannen oder antippen",
    message: "Ohne App, ohne Konto.",
    emailCaption: "Gefunden? Bitte E-Mail an",
    urlCaption: "Oder diese Adresse öffnen",
  },
  es: {
    headline: "¿Lo encontró? Escanee o acerque el móvil",
    message: "Sin app ni registro.",
    emailCaption: "¿Lo encontró? Escriba a",
    urlCaption: "O abra esta dirección",
  },
};

export const REWARD_LINE = "Reward · Belohnung · Recompensa";
export const BRAND_MARK = "RETURN";
export const PROOF_WATERMARK = "PROOF — NOT FOR PRINT";

/** Second language printed in small type under the front message. */
export function defaultSecondaryLanguage(primary: Language): Language {
  return primary === "en" ? "de" : "en";
}

/** One-line cutting guide printed in the margin of paper sheets, in the card language. */
export const PAPER_INSTRUCTIONS: Record<Language, string> = {
  en: "Cut along the marks · fold on the dashed line · glue or laminate · punch the hole",
  de: "An den Marken ausschneiden · an der gestrichelten Linie falten · kleben oder laminieren · Loch stanzen",
  es: "Recorte por las marcas · doble por la línea discontinua · pegue o plastifique · perfore el agujero",
};
