/**
 * Standalone SVG for one card face, in millimetres. The viewBox includes the bleed, so the file
 * can go straight to a printer; `marks` adds a non-printing proof overlay (trim, safe area, hole
 * die-line) and `watermark` stamps a diagonal banner across the face.
 */
import { BRAND } from "../brand";
import { escapeXml, qrPath } from "../qr";
import { round } from "./metrics";
import type { CardElement, CardSide } from "./types";

export const SVG_FONT_STACK: Record<"sans" | "mono", string> = {
  sans: "Helvetica, Arial, 'Liberation Sans', sans-serif",
  mono: "'SF Mono', Menlo, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

/** Proof-mark colours: printer's magenta for trim, cyan for safe area, red for the die-cut. */
export const MARK_COLORS = { trim: "#E5007E", safe: "#00A0E3", die: "#E30613" } as const;

export interface SvgOptions {
  marks?: boolean;
  watermark?: string;
}

const n = (v: number) => String(round(v));
const attr = (v: string) => escapeXml(v);

/** Rounded-rectangle path data, shared with the PDF renderer. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  if (rr <= 0) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
  return (
    `M${n(x + rr)} ${n(y)}h${n(w - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 ${n(rr)} ${n(rr)}` +
    `v${n(h - 2 * rr)}a${n(rr)} ${n(rr)} 0 0 1 ${n(-rr)} ${n(rr)}` +
    `h${n(-(w - 2 * rr))}a${n(rr)} ${n(rr)} 0 0 1 ${n(-rr)} ${n(-rr)}` +
    `v${n(-(h - 2 * rr))}a${n(rr)} ${n(rr)} 0 0 1 ${n(rr)} ${n(-rr)}z`
  );
}

export function renderElement(el: CardElement): string {
  switch (el.kind) {
    case "rect": {
      const stroke = el.stroke
        ? ` stroke="${attr(el.stroke)}" stroke-width="${n(el.strokeWidthMm ?? 0.25)}"`
        : "";
      const radius = el.r > 0 ? ` rx="${n(el.r)}"` : "";
      return `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}"${radius} fill="${attr(el.fill)}"${stroke}/>`;
    }
    case "circle":
      return `<circle cx="${n(el.cx)}" cy="${n(el.cy)}" r="${n(el.r)}" fill="${attr(el.fill)}"/>`;
    case "path": {
      const fill = el.fill ? attr(el.fill) : "none";
      const stroke = el.stroke
        ? ` stroke="${attr(el.stroke)}" stroke-width="${n(el.strokeWidthMm)}" stroke-linecap="${el.lineCap}"`
        : "";
      return `<path d="${attr(el.d)}" fill="${fill}"${stroke}/>`;
    }
    case "qr": {
      const m = el.moduleMm;
      // Modules are drawn in module units and scaled, keeping edges crisp at any resolution.
      return (
        `<g transform="translate(${n(el.x)} ${n(el.y)})">` +
        `<rect width="${n(el.sizeMm)}" height="${n(el.sizeMm)}" fill="${attr(el.light)}"/>` +
        `<path transform="scale(${round(m, 6)})" fill="${attr(el.dark)}" shape-rendering="crispEdges" d="${qrPath(el.matrix)}"/>` +
        `</g>`
      );
    }
    case "text": {
      const spacing = el.letterSpacingMm ? ` letter-spacing="${n(el.letterSpacingMm)}"` : "";
      const anchor = el.anchor === "start" ? "" : ` text-anchor="${el.anchor}"`;
      const weight = el.weight === "bold" ? "700" : "400";
      return (
        `<text x="${n(el.x)}" y="${n(el.y)}" font-family="${attr(SVG_FONT_STACK[el.font])}" ` +
        `font-size="${n(el.sizeMm)}" font-weight="${weight}" fill="${attr(el.fill)}"${anchor}${spacing}>` +
        `${escapeXml(el.text)}</text>`
      );
    }
    default: {
      const never: never = el;
      throw new Error(`Unknown element ${JSON.stringify(never)}`);
    }
  }
}

/** Geometry of the diagonal proof banner, shared by the SVG and PDF renderers. */
export function watermarkGeometry(side: Pick<CardSide, "widthMm" | "heightMm">) {
  const angleDeg = (-Math.atan2(side.heightMm, side.widthMm) * 180) / Math.PI;
  const diagonal = Math.hypot(side.widthMm, side.heightMm);
  return {
    cx: side.widthMm / 2,
    cy: side.heightMm / 2,
    angleDeg,
    diagonal,
    bandHeight: 9,
    fontSizeMm: 4.6,
    band: BRAND.warmWhite,
    bandOpacity: 0.82,
    ink: BRAND.lost,
  };
}

export function renderWatermark(side: CardSide, text: string): string {
  const g = watermarkGeometry(side);
  const len = g.diagonal + 2 * side.bleedMm + 8;
  return (
    `<g id="proof-watermark" transform="rotate(${n(g.angleDeg)} ${n(g.cx)} ${n(g.cy)})">` +
    `<rect x="${n(g.cx - len / 2)}" y="${n(g.cy - g.bandHeight / 2)}" width="${n(len)}" height="${n(g.bandHeight)}" fill="${g.band}" fill-opacity="${g.bandOpacity}"/>` +
    `<text x="${n(g.cx)}" y="${n(g.cy + g.fontSizeMm * 0.36)}" text-anchor="middle" font-family="${attr(SVG_FONT_STACK.sans)}" font-size="${n(g.fontSizeMm)}" font-weight="700" letter-spacing="${n(g.fontSizeMm * 0.06)}" fill="${g.ink}">${escapeXml(text)}</text>` +
    `</g>`
  );
}

function renderMarks(side: CardSide): string {
  const { widthMm: w, heightMm: h, safeMm: s, cornerRadiusMm: r } = side;
  const hair = 0.15;
  const holes = side.holes
    .map(
      (hole) =>
        `<circle cx="${n(hole.cx)}" cy="${n(hole.cy)}" r="${n(hole.r)}" fill="none" stroke="${MARK_COLORS.die}" stroke-width="${hair}" stroke-dasharray="0.6 0.4"/>` +
        `<circle cx="${n(hole.cx)}" cy="${n(hole.cy)}" r="${n(hole.r + side.holeClearanceMm)}" fill="none" stroke="${MARK_COLORS.die}" stroke-width="${hair}" stroke-dasharray="0.2 0.4" stroke-opacity="0.8"/>`,
    )
    .join("");
  return (
    `<g id="proof-marks" fill="none">` +
    `<path d="${roundedRectPath(0, 0, w, h, r)}" stroke="${MARK_COLORS.trim}" stroke-width="${hair}"/>` +
    `<rect x="${n(s)}" y="${n(s)}" width="${n(w - 2 * s)}" height="${n(h - 2 * s)}" stroke="${MARK_COLORS.safe}" stroke-width="${hair}" stroke-dasharray="0.8 0.6"/>` +
    holes +
    `</g>`
  );
}

export function renderSvg(side: CardSide, opts: SvgOptions = {}): string {
  const b = side.bleedMm;
  const fullW = side.widthMm + 2 * b;
  const fullH = side.heightMm + 2 * b;
  const body = side.elements.map(renderElement).join("");
  const watermark = opts.watermark ? renderWatermark(side, opts.watermark) : "";
  const marks = opts.marks ? renderMarks(side) : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${n(fullW)}mm" height="${n(fullH)}mm" ` +
    `viewBox="${n(-b)} ${n(-b)} ${n(fullW)} ${n(fullH)}">` +
    `<title>${escapeXml(side.title)}</title>` +
    `<g id="artwork">${body}</g>${watermark}${marks}</svg>`
  );
}
