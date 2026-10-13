/**
 * Paper "quick card" sheets: the card model laid out for a plain A4 / Letter printer.
 *
 * Layout "fold": every card becomes one FOLD-OVER unit, 2 × card width, card height. The front sits
 * on the left, the back on the right, sharing the vertical fold edge. Both faces are printed on the
 * same side of the sheet.
 *
 * Fold / flip convention. The card model's back is "upright after a long-axis flip" (the owner
 * turns the card about its horizontal centre line: top and bottom swap, x is unchanged; see
 * `flipToBack`). Folding the right panel behind the left one about the vertical crease mirrors x,
 * and turning the folded card about its horizontal axis adds a y flip, so the back panel must be
 * printed rotated by 180° (about its own centre) for the finder to read it upright. In unit
 * coordinates a back-face point (u, v) therefore sits at (2W − u, H − v) from the unit origin
 * (`backPointToPage`), and after the fold it lies directly behind the front point (u, H − v)
 * (`foldedFrontPoint`) — exactly `flipToBack`. The punched holes of both faces coincide.
 *
 * All numbers are millimetres, origin top-left of the page, y down. Artwork bleed is clipped away
 * (nothing bleeds on paper); the safe area is untouched. Cards keep their true physical size.
 */

import { PAPER_INSTRUCTIONS, PROOF_WATERMARK } from "./copy";
import { buildCard } from "./layout";
import { round } from "./metrics";
import type { Card, CardInput, CardSide, TextElement } from "./types";

export type PaperSize = "a4" | "letter";
export type PaperLayout = "fold";

export const PAPER_SIZES_MM: Record<PaperSize, { widthMm: number; heightMm: number }> = {
  a4: { widthMm: 210, heightMm: 297 },
  letter: { widthMm: 215.9, heightMm: 279.4 },
};

export interface PaperOptions {
  paper: PaperSize;
  layout: PaperLayout;
}

/** Minimum page margin; crop marks and fold ticks stay inside it, the cutting guide sits in it. */
export const PAPER_MARGIN_MM = 10;
export const CROP_MARK_LENGTH_MM = 3;
export const CROP_MARK_OFFSET_MM = 2;
/** Distance from a trim edge to the far end of a mark. */
const MARK_REACH_MM = CROP_MARK_LENGTH_MM + CROP_MARK_OFFSET_MM;
/** Vertical distance between the trim edge of one unit and the first mark of the next row. */
const ROW_GAP_MM = 11;
export const PAPER_DPI = 300;

interface MarkStyle {
  color: string;
  widthMm: number;
  /** On / off lengths of a dashed stroke; null = solid. */
  dash: [number, number] | null;
  dashPhaseMm: number;
}

export interface PaperLine extends MarkStyle {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PaperCircle extends MarkStyle {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
}

export type PaperMark = PaperLine | PaperCircle;

export interface PaperRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaperUnit {
  id: string;
  card: Card;
  /** Language of the card; the page's cutting guide uses the first unit's. */
  language: CardInput["language"];
  /** Trim rectangle of the whole unit (front + back). */
  rect: PaperRect;
  /** Trim rectangle of the front face (upright). */
  front: PaperRect;
  /** Trim rectangle of the back face; the back is drawn rotated by 180° inside it. */
  back: PaperRect;
  foldX: number;
  /** Dashed fold line (black + white strokes so it reads on any artwork) and punch circles. */
  foldLine: PaperMark[];
  punch: PaperMark[];
}

export interface PaperPage {
  index: number;
  pageCount: number;
  paper: PaperSize;
  layout: PaperLayout;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  units: PaperUnit[];
  /** Crop marks and fold ticks, outside the trim. */
  marks: PaperMark[];
  /** Cutting guide in the bottom margin (page coordinates). */
  instructions: TextElement;
  /** Proof stamp text when any card of the sheet set is not a live https URL, else null. */
  watermark: string | null;
  title: string;
}

const BLACK = "#000000";
const WHITE = "#ffffff";

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  widthMm: number,
  dash: [number, number] | null = null,
  dashPhaseMm = 0,
): PaperLine {
  return { kind: "line", x1, y1, x2, y2, color, widthMm, dash, dashPhaseMm };
}

function circle(cx: number, cy: number, r: number, color: string, dashPhaseMm: number): PaperCircle {
  return { kind: "circle", cx, cy, r, color, widthMm: 0.25, dash: [0.8, 0.8], dashPhaseMm };
}

/** Where a point of the back face (its own upright coordinates) is printed on the page. */
export function backPointToPage(unit: PaperUnit, p: { x: number; y: number }): { x: number; y: number } {
  return { x: unit.back.x + unit.back.w - p.x, y: unit.back.y + unit.back.h - p.y };
}

/** Where a printed point of the back panel ends up, in page coordinates, once the unit is folded. */
export function foldedPosition(unit: PaperUnit, page: { x: number; y: number }): { x: number; y: number } {
  return { x: 2 * unit.foldX - page.x, y: page.y };
}

/** The point of the front face (its own coordinates) that lies directly in front of a page point. */
export function frontPointAt(unit: PaperUnit, page: { x: number; y: number }): { x: number; y: number } {
  return { x: page.x - unit.front.x, y: page.y - unit.front.y };
}

function cropMarks(rect: PaperRect, foldX: number): PaperMark[] {
  const { x, y, w, h } = rect;
  const marks: PaperMark[] = [];
  const near = CROP_MARK_OFFSET_MM;
  const far = MARK_REACH_MM;
  for (const cx of [x, x + w]) {
    const dir = cx === x ? -1 : 1;
    for (const cy of [y, y + h]) {
      const vdir = cy === y ? -1 : 1;
      marks.push(line(cx + dir * near, cy, cx + dir * far, cy, BLACK, 0.2));
      marks.push(line(cx, cy + vdir * near, cx, cy + vdir * far, BLACK, 0.2));
    }
  }
  for (const [y0, vdir] of [
    [y, -1],
    [y + h, 1],
  ] as const) {
    marks.push(line(foldX, y0 + vdir * near, foldX, y0 + vdir * far, BLACK, 0.2, [0.8, 0.6]));
  }
  return marks;
}

function holeMarks(unit: Pick<PaperUnit, "card" | "front" | "back">): PaperMark[] {
  const { front, back } = unit.card;
  const out: PaperMark[] = [];
  for (const h of front.holes) {
    const cx = unit.front.x + h.cx;
    const cy = unit.front.y + h.cy;
    out.push(circle(cx, cy, h.r, BLACK, 0), circle(cx, cy, h.r, WHITE, 0.8));
  }
  for (const h of back.holes) {
    const cx = unit.back.x + unit.back.w - h.cx;
    const cy = unit.back.y + unit.back.h - h.cy;
    out.push(circle(cx, cy, h.r, BLACK, 0), circle(cx, cy, h.r, WHITE, 0.8));
  }
  return out;
}

/** How many unit rows fit on one page of this size for units of the given height. */
export function rowsPerPage(paper: PaperSize, unitHeightMm: number): number {
  const usable = PAPER_SIZES_MM[paper].heightMm - 2 * (PAPER_MARGIN_MM + MARK_REACH_MM);
  return Math.max(0, Math.floor((usable - unitHeightMm) / (unitHeightMm + ROW_GAP_MM)) + 1);
}

function sideSize(side: CardSide): { w: number; h: number } {
  return { w: side.widthMm, h: side.heightMm };
}

export class PaperLayoutError extends Error {
  constructor(
    readonly code: "no_cards" | "unsupported_layout" | "card_too_large",
    message: string,
  ) {
    super(message);
    this.name = "PaperLayoutError";
  }
}

/**
 * Lay the cards out as fold-over units, as many per portrait page as fit inside the margins,
 * on as many pages as needed. The proof watermark follows the studio rule: if any card's URL is
 * not a public https host, every page of the sheet set is stamped.
 */
export function buildPaperSheet(cardInputs: readonly CardInput[], opts: PaperOptions): PaperPage[] {
  if (cardInputs.length === 0) throw new PaperLayoutError("no_cards", "Select at least one card to print.");
  if (opts.layout !== "fold") {
    throw new PaperLayoutError("unsupported_layout", `Unsupported paper layout "${String(opts.layout)}".`);
  }
  const cards = cardInputs.map((input) => ({ input, card: buildCard(input) }));
  const size = PAPER_SIZES_MM[opts.paper];
  const unitH = Math.max(...cards.map((c) => sideSize(c.card.front).h));
  const perPage = rowsPerPage(opts.paper, unitH);
  const available = size.widthMm - 2 * (PAPER_MARGIN_MM + MARK_REACH_MM);
  if (perPage < 1 || cards.some((c) => 2 * sideSize(c.card.front).w > available)) {
    throw new PaperLayoutError("card_too_large", "The card does not fit on this paper size.");
  }
  const proof = cards.some((c) => c.card.meta.proof);
  const pageCount = Math.ceil(cards.length / perPage);
  const pages: PaperPage[] = [];
  for (let index = 0; index < pageCount; index++) {
    const slice = cards.slice(index * perPage, (index + 1) * perPage);
    const units: PaperUnit[] = slice.map(({ input, card }, row) => {
      const { w, h } = sideSize(card.front);
      const x = round((size.widthMm - 2 * w) / 2);
      const y = round(PAPER_MARGIN_MM + MARK_REACH_MM + row * (unitH + ROW_GAP_MM));
      const front: PaperRect = { x, y, w, h };
      const back: PaperRect = { x: round(x + w), y, w, h };
      const foldX = back.x;
      const unit: PaperUnit = {
        id: `p${index + 1}-u${row + 1}`,
        card,
        language: input.language,
        rect: { x, y, w: 2 * w, h },
        front,
        back,
        foldX,
        foldLine: [
          line(foldX, y, foldX, y + h, BLACK, 0.25, [1.2, 1.2]),
          line(foldX, y, foldX, y + h, WHITE, 0.25, [1.2, 1.2], 1.2),
        ],
        punch: [],
      };
      unit.punch = holeMarks(unit);
      return unit;
    });
    const language = slice[0]?.input.language ?? "en";
    pages.push({
      index,
      pageCount,
      paper: opts.paper,
      layout: opts.layout,
      widthMm: size.widthMm,
      heightMm: size.heightMm,
      marginMm: PAPER_MARGIN_MM,
      units,
      marks: units.flatMap((u) => cropMarks(u.rect, u.foldX)),
      instructions: {
        id: "instructions",
        role: "content",
        kind: "text",
        x: round(size.widthMm / 2),
        y: round(size.heightMm - 5.5),
        text: PAPER_INSTRUCTIONS[language],
        font: "sans",
        weight: "regular",
        sizeMm: 2.8,
        anchor: "middle",
        fill: "#444444",
        letterSpacingMm: 0,
      },
      watermark: proof ? PROOF_WATERMARK : null,
      title: `RETURN quick cards (${slice.map((c) => c.card.meta.label).join(", ")}) — page ${index + 1}/${pageCount}`,
    });
  }
  return pages;
}

/** Raster size of a page at `dpi`; pass the result to the canvas and `setPngDpi`. */
export function paperPixelSize(
  page: Pick<PaperPage, "widthMm" | "heightMm">,
  dpi = PAPER_DPI,
): { width: number; height: number } {
  const toPx = (mm: number) => Math.round((mm / 25.4) * dpi);
  return { width: toPx(page.widthMm), height: toPx(page.heightMm) };
}
