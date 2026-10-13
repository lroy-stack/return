/**
 * Card palettes, built only from BRAND colours. Every text/background pair is ≥ 4.5:1 (WCAG AA for
 * small text) and the QR is always dark petrol on a warm-white panel (≥ 12:1). The "stub" is the
 * band under the punched hole, a boarding-pass device that makes the hole look intentional.
 *
 * Contrast (WCAG 2.x): warmWhite/petrol 9.2 · sageTint/petrol 8.2 · petrolDeep/sage 5.4 ·
 * petrolDeep/warmWhite 12.2 · muted/warmWhite 5.7 · sageText/warmWhite 5.6 · petrolDeep/sageTint 10.8 ·
 * muted/sageTint 5.0 · sageText/sageTint 4.9 · petrol/sageTint 8.2.
 */
import { BRAND } from "../brand";
import type { CardTheme } from "./types";

export interface FacePalette {
  background: string;
  stub: string;
  /** Strongest text: name, email, URL. */
  strong: string;
  /** Headline and message. */
  text: string;
  /** Captions and secondary language. */
  muted: string;
  /** Label and small accents. */
  accent: string;
  /** Non-text graphics (NFC glyph, rule). ≥ 3:1 where it carries meaning. */
  graphic: string;
}

export interface CardPalette {
  front: FacePalette;
  back: FacePalette;
  qrDark: string;
  qrLight: string;
  /** Hairline around the QR panel when it sits on a light background. */
  qrPanelStroke: string | null;
  brandMark: string;
}

const LIGHT_BACK: FacePalette = {
  background: BRAND.warmWhite,
  stub: BRAND.petrol,
  strong: BRAND.petrolDeep,
  text: BRAND.petrol,
  muted: BRAND.muted,
  accent: BRAND.sageText,
  graphic: BRAND.sage,
};

export const CARD_PALETTES: Record<CardTheme, CardPalette> = {
  petrol: {
    front: {
      background: BRAND.petrol,
      stub: BRAND.petrolDeep,
      strong: BRAND.warmWhite,
      text: BRAND.warmWhite,
      muted: BRAND.sageTint,
      accent: BRAND.sageTint,
      graphic: BRAND.sage,
    },
    back: LIGHT_BACK,
    qrDark: BRAND.petrolDeep,
    qrLight: BRAND.warmWhite,
    qrPanelStroke: null,
    brandMark: BRAND.petrol,
  },
  sage: {
    front: {
      background: BRAND.sage,
      stub: BRAND.petrol,
      strong: BRAND.petrolDeep,
      text: BRAND.petrolDeep,
      muted: BRAND.petrolDeep,
      accent: BRAND.petrolDeep,
      graphic: BRAND.petrolDeep,
    },
    back: {
      background: BRAND.sageTint,
      stub: BRAND.sage,
      strong: BRAND.petrolDeep,
      text: BRAND.petrol,
      muted: BRAND.muted,
      accent: BRAND.sageText,
      graphic: BRAND.sage,
    },
    qrDark: BRAND.petrolDeep,
    qrLight: BRAND.warmWhite,
    qrPanelStroke: null,
    brandMark: BRAND.petrol,
  },
  warm: {
    front: {
      background: BRAND.warmWhite,
      stub: BRAND.petrol,
      strong: BRAND.petrolDeep,
      text: BRAND.petrol,
      muted: BRAND.muted,
      accent: BRAND.sageText,
      graphic: BRAND.sageText,
    },
    back: LIGHT_BACK,
    qrDark: BRAND.petrolDeep,
    qrLight: BRAND.paper,
    qrPanelStroke: BRAND.line,
    brandMark: BRAND.petrol,
  },
};
