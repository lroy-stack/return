/**
 * Standalone SVG for one paper page: millimetre units, white background, no scripts and no external
 * references (the only `url(#…)` targets are clip paths defined inside the file).
 */
import { escapeXml } from "../qr";
import { round } from "./metrics";
import type { PaperMark, PaperPage, PaperRect, PaperUnit } from "./paper";
import { renderElement, renderWatermark } from "./svg";
import type { CardSide } from "./types";

const n = (v: number) => String(round(v));

function renderMark(m: PaperMark): string {
  const dash = m.dash
    ? ` stroke-dasharray="${n(m.dash[0])} ${n(m.dash[1])}"${m.dashPhaseMm ? ` stroke-dashoffset="${n(-m.dashPhaseMm)}"` : ""}`
    : "";
  const stroke = `stroke="${escapeXml(m.color)}" stroke-width="${n(m.widthMm)}"${dash}`;
  return m.kind === "line"
    ? `<line x1="${n(m.x1)}" y1="${n(m.y1)}" x2="${n(m.x2)}" y2="${n(m.y2)}" ${stroke}/>`
    : `<circle cx="${n(m.cx)}" cy="${n(m.cy)}" r="${n(m.r)}" fill="none" ${stroke}/>`;
}

function renderPanel(
  id: string,
  side: CardSide,
  rect: PaperRect,
  rotated: boolean,
  watermark: string | null,
): string {
  const transform = rotated
    ? `translate(${n(rect.x + rect.w)} ${n(rect.y + rect.h)}) rotate(180)`
    : `translate(${n(rect.x)} ${n(rect.y)})`;
  const body = side.elements.map(renderElement).join("");
  const stamp = watermark ? renderWatermark(side, watermark) : "";
  return (
    `<clipPath id="${id}"><rect width="${n(rect.w)}" height="${n(rect.h)}"/></clipPath>` +
    `<g id="${id}-art" transform="${transform}" clip-path="url(#${id})">${body}${stamp}</g>`
  );
}

function renderUnit(unit: PaperUnit, watermark: string | null): string {
  return (
    `<g id="${unit.id}">` +
    renderPanel(`${unit.id}-front`, unit.card.front, unit.front, false, watermark) +
    renderPanel(`${unit.id}-back`, unit.card.back, unit.back, true, watermark) +
    `<g id="${unit.id}-fold">${unit.foldLine.map(renderMark).join("")}</g>` +
    `<g id="${unit.id}-punch">${unit.punch.map(renderMark).join("")}</g>` +
    `</g>`
  );
}

export function renderPaperSvg(page: PaperPage): string {
  const w = n(page.widthMm);
  const h = n(page.heightMm);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">` +
    `<title>${escapeXml(page.title)}</title>` +
    `<rect width="${w}" height="${h}" fill="#ffffff"/>` +
    page.units.map((u) => renderUnit(u, page.watermark)).join("") +
    `<g id="marks">${page.marks.map(renderMark).join("")}</g>` +
    `<g id="instructions">${renderElement(page.instructions)}</g>` +
    `</svg>`
  );
}
