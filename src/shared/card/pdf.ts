/**
 * Print-ready PDF: one page per card face (front, back, front, back…), page = card + bleed,
 * TrimBox/BleedBox set for the printer, everything vector (QR modules are filled rectangles).
 * Fonts are the PDF standard Helvetica / Courier families (WinAnsi encoding, no embedding).
 * Browser-only at runtime: the print studio loads this module with a dynamic import, so pdf-lib
 * stays out of the panel's main bundle, and it is deliberately NOT re-exported from ./index (the
 * Worker never pulls it in). It lives in src/shared only so the Vitest suite (worker tsconfig) can
 * type-check and exercise it; it has no DOM dependencies.
 */
import { PDFDocument } from "pdf-lib";
import { drawElement, drawWatermark, Fonts, type Frame, PT_PER_MM } from "./pdf-draw";
import type { Card, CardSide } from "./types";

export { PT_PER_MM, toWinAnsi } from "./pdf-draw";

export interface PdfOptions {
  /** Diagonal proof stamp on every page, e.g. "PROOF — NOT FOR PRINT". */
  watermark?: string;
  title?: string;
}

async function drawSide(doc: PDFDocument, side: CardSide, fonts: Fonts, opts: PdfOptions): Promise<void> {
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
