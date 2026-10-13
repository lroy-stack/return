/**
 * Vector PDF of the paper pages (one PDF page per sheet), built on the shared primitives in
 * ./pdf-draw. Browser-side only and not re-exported from ./index, like ./pdf.
 */
import {
  clip,
  concatTransformationMatrix,
  endPath,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
} from "pdf-lib";
import type { PaperMark, PaperPage, PaperRect, PaperUnit } from "./paper";
import { color, drawElement, drawWatermark, Fonts, type Frame, PT_PER_MM } from "./pdf-draw";
import type { CardSide } from "./types";

export interface PaperPdfOptions {
  title?: string;
}

function drawMark(frame: Frame, m: PaperMark): void {
  const k = PT_PER_MM;
  const dash = m.dash ? { dashArray: [m.dash[0] * k, m.dash[1] * k], dashPhase: m.dashPhaseMm * k } : {};
  if (m.kind === "line") {
    frame.page.drawLine({
      start: { x: frame.ox + m.x1 * k, y: frame.oy - m.y1 * k },
      end: { x: frame.ox + m.x2 * k, y: frame.oy - m.y2 * k },
      thickness: m.widthMm * k,
      color: color(m.color),
      ...dash,
    });
    return;
  }
  frame.page.drawCircle({
    x: frame.ox + m.cx * k,
    y: frame.oy - m.cy * k,
    size: m.r * k,
    borderColor: color(m.color),
    borderWidth: m.widthMm * k,
    ...(m.dash
      ? { borderDashArray: [m.dash[0] * k, m.dash[1] * k], borderDashPhase: m.dashPhaseMm * k }
      : {}),
  });
}

/** Paint one face clipped to its trim rectangle; the back is rotated 180° about its centre. */
async function drawPanel(
  page: Frame,
  side: CardSide,
  rect: PaperRect,
  rotated: boolean,
  watermark: string | null,
  fonts: Fonts,
): Promise<void> {
  const k = PT_PER_MM;
  const x = page.ox + rect.x * k;
  const top = page.oy - rect.y * k;
  const w = rect.w * k;
  const h = rect.h * k;
  const ops = [pushGraphicsState()];
  if (rotated) ops.push(concatTransformationMatrix(-1, 0, 0, -1, 2 * x + w, 2 * (top - h) + h));
  ops.push(rectangle(x, top - h, w, h), clip(), endPath());
  page.page.pushOperators(...ops);
  const frame: Frame = { page: page.page, ox: x, oy: top };
  for (const el of side.elements) await drawElement(frame, el, fonts);
  if (watermark) await drawWatermark(frame, side, watermark, fonts);
  page.page.pushOperators(popGraphicsState());
}

async function drawUnit(
  frame: Frame,
  unit: PaperUnit,
  watermark: string | null,
  fonts: Fonts,
): Promise<void> {
  await drawPanel(frame, unit.card.front, unit.front, false, watermark, fonts);
  await drawPanel(frame, unit.card.back, unit.back, true, watermark, fonts);
  for (const m of [...unit.foldLine, ...unit.punch]) drawMark(frame, m);
}

export async function renderPaperPdf(
  pages: readonly PaperPage[],
  opts: PaperPdfOptions = {},
): Promise<Uint8Array> {
  const first = pages[0];
  if (!first) throw new Error("Select at least one card to export.");
  const doc = await PDFDocument.create();
  doc.setTitle(
    opts.title ??
      `RETURN quick cards (${pages.flatMap((p) => p.units.map((u) => u.card.meta.label)).join(", ")})`,
  );
  doc.setAuthor("RETURN");
  doc.setCreator("RETURN print studio");
  doc.setProducer("RETURN (pdf-lib)");
  const fonts = new Fonts(doc);
  for (const p of pages) {
    const page = doc.addPage([p.widthMm * PT_PER_MM, p.heightMm * PT_PER_MM]);
    const frame: Frame = { page, ox: 0, oy: p.heightMm * PT_PER_MM };
    for (const u of p.units) await drawUnit(frame, u, p.watermark, fonts);
    for (const m of p.marks) drawMark(frame, m);
    await drawElement(frame, p.instructions, fonts);
  }
  return doc.save();
}
