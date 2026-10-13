import { ascentEm, descentEm, measureText } from "./metrics";
import type { Box, CardElement, CardSide, CardTemplate, Circle, FlipAxis } from "./types";

/** Conservative axis-aligned bounds of an element in trim-space millimetres. */
export function elementBounds(el: CardElement): Box {
  switch (el.kind) {
    case "rect": {
      const s = (el.stroke ? (el.strokeWidthMm ?? 0) : 0) / 2;
      return { x: el.x - s, y: el.y - s, w: el.w + 2 * s, h: el.h + 2 * s };
    }
    case "circle":
      return { x: el.cx - el.r, y: el.cy - el.r, w: 2 * el.r, h: 2 * el.r };
    case "qr":
      return { x: el.x, y: el.y, w: el.sizeMm, h: el.sizeMm };
    case "path":
      return el.bounds;
    case "text": {
      const w = measureText(el.text, {
        font: el.font,
        weight: el.weight,
        sizeMm: el.sizeMm,
        letterSpacingMm: el.letterSpacingMm,
      });
      const x = el.anchor === "start" ? el.x : el.anchor === "end" ? el.x - w : el.x - w / 2;
      const top = el.y - ascentEm(el.text) * el.sizeMm;
      return { x, y: top, w, h: (ascentEm(el.text) + descentEm()) * el.sizeMm };
    }
    default: {
      const never: never = el;
      throw new Error(`Unknown element ${JSON.stringify(never)}`);
    }
  }
}

export function safeBox(side: Pick<CardSide, "widthMm" | "heightMm" | "safeMm">): Box {
  return {
    x: side.safeMm,
    y: side.safeMm,
    w: side.widthMm - 2 * side.safeMm,
    h: side.heightMm - 2 * side.safeMm,
  };
}

const EPS = 1e-6;

export function boxInside(inner: Box, outer: Box): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.h <= outer.y + outer.h + EPS
  );
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

export function boxIntersectsCircle(box: Box, c: Circle): boolean {
  const nx = Math.max(box.x, Math.min(c.cx, box.x + box.w));
  const ny = Math.max(box.y, Math.min(c.cy, box.y + box.h));
  return (nx - c.cx) ** 2 + (ny - c.cy) ** 2 < c.r * c.r - EPS;
}

/** Hole plus clearance: the area no content may touch. */
export function keepOutZones(side: Pick<CardSide, "holes" | "holeClearanceMm">): Circle[] {
  return side.holes.map((h) => ({ cx: h.cx, cy: h.cy, r: h.r + side.holeClearanceMm }));
}

/**
 * Where a point on the front lands on the back after the card is turned over, in the back's own
 * (upright) coordinates.
 */
export function flipToBack(
  p: { x: number; y: number },
  t: Pick<CardTemplate, "widthMm" | "heightMm">,
  axis: FlipAxis,
): { x: number; y: number } {
  return axis === "long-axis" ? { x: p.x, y: t.heightMm - p.y } : { x: t.widthMm - p.x, y: p.y };
}
