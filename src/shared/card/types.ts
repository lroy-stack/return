/**
 * Layout model for printed luggage-tag cards. All coordinates are millimetres in *trim space*:
 * (0,0) is the top-left corner of the finished card, y grows downwards, the bleed extends to
 * negative coordinates and beyond width/height. Renderers (SVG, PDF) only translate this model.
 */
import type { QrMatrix } from "../qr";
import type { CARD_THEMES, Language } from "../settings";

export type CardTheme = (typeof CARD_THEMES)[number];
export type CardFace = "front" | "back";
export type FontFamily = "sans" | "mono";
export type FontWeight = "regular" | "bold";
export type TextAnchor = "start" | "middle" | "end";

/**
 * `background` elements intentionally fill the bleed (and may sit under the punched hole);
 * every `content` element must stay inside the safe area and out of the hole keep-out zone.
 */
export type ElementRole = "background" | "content";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

interface ElementBase {
  /** Stable id for tests and debugging, e.g. "qr", "label", "headline.1". */
  id: string;
  role: ElementRole;
}

export interface RectElement extends ElementBase {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius. */
  r: number;
  fill: string;
  stroke?: string;
  strokeWidthMm?: number;
}

export interface CircleElement extends ElementBase, Circle {
  kind: "circle";
  fill: string;
}

export interface TextElement extends ElementBase {
  kind: "text";
  /** Anchor point on the baseline. */
  x: number;
  y: number;
  text: string;
  font: FontFamily;
  weight: FontWeight;
  sizeMm: number;
  anchor: TextAnchor;
  fill: string;
  /** Extra space after every glyph (CSS/SVG `letter-spacing`, PDF `Tc`). Only used with anchor "start". */
  letterSpacingMm: number;
}

export interface QrElement extends ElementBase {
  kind: "qr";
  /** Top-left corner of the symbol *including* its quiet zone. */
  x: number;
  y: number;
  sizeMm: number;
  moduleMm: number;
  matrix: QrMatrix;
  dark: string;
  light: string;
}

export interface PathElement extends ElementBase {
  kind: "path";
  /** Absolute SVG path data in trim-space millimetres. */
  d: string;
  fill: string | null;
  stroke: string | null;
  strokeWidthMm: number;
  lineCap: "butt" | "round";
  /** Precomputed bounds including half the stroke width (path data is not parsed for checks). */
  bounds: Box;
}

export type CardElement = RectElement | CircleElement | TextElement | QrElement | PathElement;

export interface CardSide {
  face: CardFace;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMm: number;
  /** Corner radius of the die-cut card (ISO/IEC 7810 ID-1: 3.18 mm). */
  cornerRadiusMm: number;
  /** Punched holes on this face, in this face's own coordinates. */
  holes: Circle[];
  /** Extra no-content ring around each hole. */
  holeClearanceMm: number;
  /** Paint order: first element is painted first. */
  elements: CardElement[];
  /** Human description used as SVG <title> and PDF page label. */
  title: string;
}

export interface HoleSpec {
  /** Short edge the hole sits next to, as seen on the front. */
  edge: "left" | "right";
  /** Distance from that short edge to the hole centre. */
  fromEdgeMm: number;
  /** Vertical position of the hole centre on the front (27 = centred). */
  yMm: number;
  diameterMm: number;
  clearanceMm: number;
}

/**
 * How the printer turns the card between front and back.
 * - `long-axis`: rotate about the horizontal centre line (top and bottom swap, x unchanged).
 * - `short-axis`: rotate about the vertical centre line (left and right swap, y unchanged).
 */
export type FlipAxis = "long-axis" | "short-axis";

export interface CardTemplate {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMm: number;
  cornerRadiusMm: number;
  hole: HoleSpec;
  flip: FlipAxis;
  /** Preferred QR edge length including the quiet zone. Grows if modules would be too small. */
  qrMm: number;
  minModuleMm: number;
}

export interface CardInput {
  /** Absolute tag URL; encoded in the QR and printed (without scheme) on the back. */
  url: string;
  /** Human reference, e.g. "RT-001". */
  label: string;
  theme: CardTheme;
  language: Language;
  /** Small second line on the front; defaults to English (German for English cards). */
  secondaryLanguage?: Language | null;
  /** Already resolved against `showNameOnCard`; null/empty hides it. */
  ownerName: string | null;
  /** Printed fallback contact on the back; null hides the block. */
  printedEmail: string | null;
  /** Short message under the headline; null/empty uses the built-in default for the language. */
  cardMessage: string | null;
  /** "Reward · Belohnung · Recompensa" line on the back. Default off. */
  showReward?: boolean;
  template?: Partial<Omit<CardTemplate, "hole">> & { hole?: Partial<HoleSpec> };
}

/** Machine-readable layout issues the UI should surface before printing. */
export type CardWarning =
  | "name_truncated"
  | "message_truncated"
  | "email_truncated"
  | "url_truncated"
  | "label_truncated"
  | "secondary_line_dropped"
  | "no_printed_email";

export interface Card {
  front: CardSide;
  back: CardSide;
  meta: {
    label: string;
    url: string;
    /** Host + path as printed on the back, e.g. "return.example/t/01j9…". */
    displayUrl: string;
    /** The URL is not a public https host: exports must be stamped as proofs. */
    proof: boolean;
    qr: { version: number; modules: number; moduleMm: number; sizeMm: number };
    warnings: CardWarning[];
  };
}
