/**
 * Text measurement and fitting without a DOM. Widths come from the Helvetica / Helvetica-Bold AFM
 * metrics (identical to Arial, the SVG fallback) for ASCII; accented letters use their base letter;
 * monospace is 0.6 em (Courier, Menlo, SF Mono). A small safety factor keeps estimates on the wide
 * side so text never spills out of its box when the viewer substitutes a font.
 */
import type { FontFamily, FontWeight } from "./types";

// Advance widths in 1/1000 em for U+0020…U+007E.
// biome-ignore format: data table
const HELVETICA = [
  278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,
  278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,
  611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,
  556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,
];
// biome-ignore format: data table
const HELVETICA_BOLD = [
  278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,
  333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,
  611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,
  611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,
];
const EXTRA: Record<FontWeight, Record<string, number>> = {
  regular: {
    ß: 611,
    "€": 556,
    "…": 1000,
    "·": 278,
    "—": 1000,
    "–": 556,
    "’": 222,
    "‘": 222,
    "“": 333,
    "”": 333,
    "¿": 611,
    "¡": 333,
    " ": 278,
  },
  bold: {
    ß: 611,
    "€": 556,
    "…": 1000,
    "·": 278,
    "—": 1000,
    "–": 556,
    "’": 278,
    "‘": 278,
    "“": 500,
    "”": 500,
    "¿": 611,
    "¡": 333,
    " ": 278,
  },
};
/** Anything unknown (CJK, emoji, symbols) is assumed to be a full em wide. */
const UNKNOWN = 1000;
const MONO = 600;
/** Estimates are inflated by 3 % to absorb font substitution (Arial, Liberation Sans, Menlo). */
export const WIDTH_SAFETY = 1.03;

export const ELLIPSIS = "…";
export const LINE_HEIGHT = 1.22;
const DESCENT = 0.22;

function glyphWidth(ch: string, font: FontFamily, weight: FontWeight): number {
  if (font === "mono") return (ch.codePointAt(0) ?? 0) > 0x2e7f ? UNKNOWN : MONO;
  const code = ch.charCodeAt(0);
  const table = weight === "bold" ? HELVETICA_BOLD : HELVETICA;
  if (code >= 32 && code < 127) return table[code - 32] ?? UNKNOWN;
  const extra = EXTRA[weight][ch];
  if (extra !== undefined) return extra;
  // Accented Latin letters (ü, ñ, É…) share the advance width of their base letter.
  const base = ch.normalize("NFD")[0];
  if (base && base !== ch) {
    const b = base.charCodeAt(0);
    if (b >= 32 && b < 127) return table[b - 32] ?? UNKNOWN;
  }
  return UNKNOWN;
}

export interface FontSpec {
  font: FontFamily;
  weight: FontWeight;
  sizeMm: number;
  letterSpacingMm?: number;
}

/** Estimated advance width in millimetres (conservative). */
export function measureText(text: string, spec: FontSpec): number {
  let em = 0;
  let count = 0;
  for (const ch of text) {
    em += glyphWidth(ch, spec.font, spec.weight);
    count++;
  }
  return ((em / 1000) * spec.sizeMm + (spec.letterSpacingMm ?? 0) * count) * WIDTH_SAFETY;
}

/** Distance from baseline to the top of the tallest glyph, in em. Accented capitals reach higher. */
export function ascentEm(text: string): number {
  if (/\p{Lu}\p{M}|[ÅÆØ¿¡]/u.test(text.normalize("NFD"))) return 0.95;
  return 0.76;
}

export function descentEm(): number {
  return DESCENT;
}

export type BreakMode = "words" | "url" | "email";

export interface FitSpec {
  text: string;
  font: FontFamily;
  weight: FontWeight;
  maxSizeMm: number;
  minSizeMm: number;
  maxWidthMm: number;
  maxLines: number;
  letterSpacingEm?: number;
  /**
   * "words" breaks at spaces; "url" after "/" and "."; "email" only after "@". Hyphens are never
   * break points (a wrapped hyphen reads as hyphenation). At the minimum size, segments that still
   * do not fit break anywhere.
   */
  breaks?: BreakMode;
  /** Even out line lengths (like CSS `text-wrap: balance`) without adding lines. */
  balance?: boolean;
}

export interface FitResult {
  sizeMm: number;
  letterSpacingMm: number;
  lines: string[];
  truncated: boolean;
}

const SIZE_STEP = 0.05;

function segmentsOf(text: string, mode: BreakMode): string[] {
  if (mode === "words") {
    const words = text.split(" ").filter(Boolean);
    return words.map((w, i) => (i < words.length - 1 ? `${w} ` : w));
  }
  const pattern = mode === "url" ? /[^/.]+[/.]*|[/.]+/g : /[^@]+@*|@+/g;
  return text.match(pattern) ?? [];
}

function wrap(segments: string[], maxWidth: number, spec: FontSpec): { lines: string[]; overflow: boolean } {
  const lines: string[] = [];
  let current = "";
  let overflow = false;
  for (const seg of segments) {
    const candidate = current + seg;
    if (current === "" || measureText(candidate.trimEnd(), spec) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current.trimEnd());
      current = seg;
    }
    if (measureText(current.trimEnd(), spec) > maxWidth) overflow = true;
  }
  if (current.trim() !== "") lines.push(current.trimEnd());
  return { lines, overflow };
}

/** Split segments wider than the line into single characters so they can break anywhere. */
function hardBreak(segments: string[], maxWidth: number, spec: FontSpec): string[] {
  return segments.flatMap((seg) => (measureText(seg.trimEnd(), spec) > maxWidth ? [...seg] : [seg]));
}

function ellipsize(text: string, maxWidth: number, spec: FontSpec): string {
  let chars = [...text.trimEnd()];
  while (chars.length > 0 && measureText(`${chars.join("").trimEnd()}${ELLIPSIS}`, spec) > maxWidth) {
    chars = chars.slice(0, -1);
  }
  return `${chars.join("").trimEnd()}${ELLIPSIS}`;
}

/** Narrowest width that keeps the same line count; mirrors CSS `text-wrap: balance`. */
function balance(segments: string[], lines: string[], maxWidth: number, spec: FontSpec): string[] {
  if (lines.length < 2) return lines;
  let lo = maxWidth / lines.length;
  let hi = maxWidth;
  let best = lines;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const attempt = wrap(segments, mid, spec);
    if (!attempt.overflow && attempt.lines.length === lines.length) {
      best = attempt.lines;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}

/**
 * Fit text into `maxLines` lines of `maxWidthMm`: shrink from max to min size, then (at the minimum
 * size) break inside long segments, and finally truncate the last line with an ellipsis.
 */
export function fitText(fit: FitSpec): FitResult {
  const mode = fit.breaks ?? "words";
  const text = fit.text.replace(/\s+/g, " ").trim();
  const segments = segmentsOf(text, mode);
  const specAt = (sizeMm: number): FontSpec => ({
    font: fit.font,
    weight: fit.weight,
    sizeMm,
    letterSpacingMm: round((fit.letterSpacingEm ?? 0) * sizeMm),
  });
  const result = (sizeMm: number, lines: string[], truncated: boolean): FitResult => ({
    sizeMm: round(sizeMm),
    letterSpacingMm: round((fit.letterSpacingEm ?? 0) * sizeMm),
    lines,
    truncated,
  });

  if (text === "") return result(fit.maxSizeMm, [], false);

  const steps = Math.max(0, Math.floor((fit.maxSizeMm - fit.minSizeMm) / SIZE_STEP + 1e-9));
  for (let k = 0; k <= steps; k++) {
    const size = round(fit.maxSizeMm - k * SIZE_STEP);
    const { lines, overflow } = wrap(segments, fit.maxWidthMm, specAt(size));
    if (!overflow && lines.length <= fit.maxLines) {
      return result(
        size,
        fit.balance ? balance(segments, lines, fit.maxWidthMm, specAt(size)) : lines,
        false,
      );
    }
  }

  const spec = specAt(fit.minSizeMm);
  const { lines } = wrap(hardBreak(segments, fit.maxWidthMm, spec), fit.maxWidthMm, spec);
  if (lines.length <= fit.maxLines) return result(fit.minSizeMm, lines, false);
  const kept = lines.slice(0, fit.maxLines - 1);
  const rest = lines.slice(fit.maxLines - 1).join(mode === "words" ? " " : "");
  return result(fit.minSizeMm, [...kept, ellipsize(rest, fit.maxWidthMm, spec)], true);
}

export function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
