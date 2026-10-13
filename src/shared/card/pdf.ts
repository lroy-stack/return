/**
 * Print-ready PDF: one page per card face (front, back, front, back…), page = card + bleed,
 * TrimBox/BleedBox set for the printer, everything vector (QR modules are filled rectangles).
 * Fonts are the PDF standard Helvetica / Courier families (WinAnsi encoding, no embedding).
 * Browser-only at runtime: the print studio loads this module with a dynamic import, so pdf-lib
 * stays out of the panel's main bundle, and it is deliberately NOT re-exported from ./index (the
 * Worker never pulls it in). It lives in src/shared only so the Vitest suite (worker tsconfig) can
 * type-check and exercise it; it has no DOM dependencies.
 */
import {
  degrees,
  LineCapStyle,
  PDFDocument,
  type PDFDocument as PDFDocumentType,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
  setCharacterSpacing,
} from "pdf-lib";
import { qrPath } from "../qr";
import { roundedRectPath, watermarkGeometry } from "./svg";
import type { Card, CardElement, CardSide, FontFamily, FontWeight } from "./types";

/** PDF points per millimetre. */
export const PT_PER_MM = 72 / 25.4;

export interface PdfOptions {
  /** Diagonal proof stamp on every page, e.g. "PROOF — NOT FOR PRINT". */
  watermark?: string;
  title?: string;
}

// Unicode code points of the WinAnsi (CP1252) slots 0x80–0x9F.
const WIN_ANSI_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e,
  0x0178,
]);

/**
 * Standard PDF fonts can only show WinAnsi characters (German and Spanish are fine). Anything else
 * becomes "?" instead of crashing the export; the SVG/PNG exports keep the original text.
 */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    const ok = (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(cp);
    out += ok ? ch : "?";
  }
  return out;
}

function color(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Unsupported colour "${hex}" (expected #rrggbb).`);
  return rgb(
    Number.parseInt(m[1] ?? "0", 16) / 255,
    Number.parseInt(m[2] ?? "0", 16) / 255,
    Number.parseInt(m[3] ?? "0", 16) / 255,
  );
}

const FONT_NAMES: Record<FontFamily, Record<FontWeight, StandardFonts>> = {
  sans: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold },
  mono: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold },
};

class Fonts {
  private readonly cache = new Map<StandardFonts, PDFFont>();
  constructor(private readonly doc: PDFDocumentType) {}
  async get(font: FontFamily, weight: FontWeight): Promise<PDFFont> {
    const name = FONT_NAMES[font][weight];
    let embedded = this.cache.get(name);
    if (!embedded) {
      embedded = await this.doc.embedFont(name);
      this.cache.set(name, embedded);
    }
    return embedded;
  }
}

function circlePath(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
}

/** Page-space helpers: trim-space millimetres (y down) → PDF points (y up). */
interface Frame {
  page: PDFPage;
  ox: number;
  oy: number;
}

async function drawElement(f: Frame, el: CardElement, fonts: Fonts): Promise<void> {
  const { page, ox, oy } = f;
  const at = { x: ox, y: oy, scale: PT_PER_MM };
  switch (el.kind) {
    case "rect":
      page.drawSvgPath(roundedRectPath(el.x, el.y, el.w, el.h, el.r), {
        ...at,
        color: color(el.fill),
        ...(el.stroke ? { borderColor: color(el.stroke), borderWidth: el.strokeWidthMm ?? 0.25 } : {}),
      });
      return;
    case "circle":
      page.drawSvgPath(circlePath(el.cx, el.cy, el.r), { ...at, color: color(el.fill) });
      return;
    case "path":
      page.drawSvgPath(el.d, {
        ...at,
        ...(el.fill ? { color: color(el.fill) } : {}),
        ...(el.stroke
          ? {
              borderColor: color(el.stroke),
              borderWidth: el.strokeWidthMm,
              borderLineCap: el.lineCap === "round" ? LineCapStyle.Round : LineCapStyle.Butt,
            }
          : {}),
      });
      return;
    case "qr":
      page.drawSvgPath(roundedRectPath(el.x, el.y, el.sizeMm, el.sizeMm, 0), {
        ...at,
        color: color(el.light),
      });
      page.drawSvgPath(qrPath(el.matrix), {
        x: ox + el.x * PT_PER_MM,
        y: oy - el.y * PT_PER_MM,
        scale: el.moduleMm * PT_PER_MM,
        color: color(el.dark),
      });
      return;
    case "text": {
      const font = await fonts.get(el.font, el.weight);
      const text = toWinAnsi(el.text);
      const size = el.sizeMm * PT_PER_MM;
      const spacing = el.letterSpacingMm * PT_PER_MM;
      const width = font.widthOfTextAtSize(text, size) + spacing * [...text].length;
      const shift = el.anchor === "end" ? width : el.anchor === "middle" ? width / 2 : 0;
      if (spacing) page.pushOperators(setCharacterSpacing(spacing));
      page.drawText(text, {
        x: ox + el.x * PT_PER_MM - shift,
        y: oy - el.y * PT_PER_MM,
        size,
        font,
        color: color(el.fill),
      });
      if (spacing) page.pushOperators(setCharacterSpacing(0));
      return;
    }
    default: {
      const never: never = el;
      throw new Error(`Unknown element ${JSON.stringify(never)}`);
    }
  }
}

async function drawWatermark(f: Frame, side: CardSide, text: string, fonts: Fonts): Promise<void> {
  const g = watermarkGeometry(side);
  const a = (g.angleDeg * Math.PI) / 180;
  // Same rotation as SVG's rotate(angle cx cy) in a y-down space.
  const rot = (x: number, y: number) => ({
    x: g.cx + x * Math.cos(a) - y * Math.sin(a),
    y: g.cy + x * Math.sin(a) + y * Math.cos(a),
  });
  const len = g.diagonal + 2 * side.bleedMm + 8;
  const corners = [
    rot(-len / 2, -g.bandHeight / 2),
    rot(len / 2, -g.bandHeight / 2),
    rot(len / 2, g.bandHeight / 2),
    rot(-len / 2, g.bandHeight / 2),
  ];
  const band = `M${corners.map((c) => `${c.x} ${c.y}`).join("L")}z`;
  f.page.drawSvgPath(band, {
    x: f.ox,
    y: f.oy,
    scale: PT_PER_MM,
    color: color(g.band),
    opacity: g.bandOpacity,
  });
  const font = await fonts.get("sans", "bold");
  const safeText = toWinAnsi(text);
  const size = g.fontSizeMm * PT_PER_MM;
  const widthMm = font.widthOfTextAtSize(safeText, size) / PT_PER_MM;
  const start = rot(-widthMm / 2, g.fontSizeMm * 0.36);
  f.page.drawText(safeText, {
    x: f.ox + start.x * PT_PER_MM,
    y: f.oy - start.y * PT_PER_MM,
    size,
    font,
    color: color(g.ink),
    rotate: degrees(-g.angleDeg),
  });
}

async function drawSide(doc: PDFDocumentType, side: CardSide, fonts: Fonts, opts: PdfOptions): Promise<void> {
  const b = side.bleedMm * PT_PER_MM;
  const w = side.widthMm * PT_PER_MM;
  const h = side.heightMm * PT_PER_MM;
  const page = doc.addPage([w + 2 * b, h + 2 * b]);
  page.setBleedBox(0, 0, w + 2 * b, h + 2 * b);
  page.setTrimBox(b, b, w, h);
  const frame: Frame = { page, ox: b, oy: h + b };
  for (const el of side.elements) await drawElement(frame, el, fonts);
  if (opts.watermark) await drawWatermark(frame, side, opts.watermark, fonts);
}

/** Pages alternate front/back per card, ready for duplex card printers. */
export async function renderPdf(cards: readonly Card[], opts: PdfOptions = {}): Promise<Uint8Array> {
  if (cards.length === 0) throw new Error("Select at least one card to export.");
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title ?? `RETURN cards (${cards.map((c) => c.meta.label).join(", ")})`);
  doc.setAuthor("RETURN");
  doc.setCreator("RETURN print studio");
  doc.setProducer("RETURN (pdf-lib)");
  const fonts = new Fonts(doc);
  for (const card of cards) {
    await drawSide(doc, card.front, fonts, opts);
    await drawSide(doc, card.back, fonts, opts);
  }
  return doc.save();
}
