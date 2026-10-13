/**
 * Card layout: turns a tag + settings into a pure, renderer-agnostic model of both faces.
 *
 * Geometry (defaults, millimetres): CR80 85.6 × 54, r 3.18 corners, 2 bleed, 3 safe margin.
 * Hole Ø5 centred 6 from the left short edge at mid-height, plus a 2 clearance ring (keep-out
 * x 1.5–10.5). A 12 wide "stub" band carries the hole; content starts 3 further in (x = 15).
 * Front: QR (30 incl. quiet zone, modules ≥ 0.5) on a warm-white panel at the far end from the
 * hole, so the strap never covers it; label + name top-left, return message bottom-left, both
 * aligned to the panel's top and bottom edges. Back: brand + label row, hairline, then the printed
 * fallback email and the typeable URL, vertically centred; optional reward line at the bottom.
 */
import { encodeQr } from "../qr";
import { BRAND_MARK, CARD_COPY, defaultSecondaryLanguage, REWARD_LINE } from "./copy";
import { flipToBack } from "./geometry";
import { ascentEm, descentEm, type FitResult, fitText, LINE_HEIGHT, measureText, round } from "./metrics";
import { CARD_PALETTES, type FacePalette } from "./themes";
import type {
  Card,
  CardElement,
  CardInput,
  CardSide,
  CardTemplate,
  CardWarning,
  Circle,
  FontFamily,
  FontWeight,
  QrElement,
  TextElement,
} from "./types";
import { displayUrl, isProofUrl } from "./url";

export const DEFAULT_TEMPLATE: CardTemplate = {
  widthMm: 85.6,
  heightMm: 54,
  bleedMm: 2,
  safeMm: 3,
  cornerRadiusMm: 3.18,
  hole: { edge: "left", fromEdgeMm: 6, yMm: 27, diameterMm: 5, clearanceMm: 2 },
  flip: "long-axis",
  qrMm: 30,
  minModuleMm: 0.5,
};

/** Millimetres per typographic point. */
export const MM_PER_PT = 25.4 / 72;

const QR_PANEL_PAD = 1;
const QR_PANEL_RADIUS = 2.4;
const QR_PANEL_STROKE = 0.25;
/** Space between the stub edge and the hole's keep-out ring. */
const STUB_EXTRA = 1.5;
/** Space between the stub and the content column. */
const STUB_GUTTER = 3;
/** Space between the text column and the QR panel. */
const PANEL_GUTTER = 3.5;
const MIN_TEXT_COLUMN = 20;

export class CardLayoutError extends Error {
  constructor(
    readonly code: "url_too_long" | "invalid_template",
    message: string,
  ) {
    super(message);
    this.name = "CardLayoutError";
  }
}

export function resolveTemplate(partial: CardInput["template"] = {}): CardTemplate {
  const t: CardTemplate = {
    ...DEFAULT_TEMPLATE,
    ...partial,
    hole: { ...DEFAULT_TEMPLATE.hole, ...partial.hole },
  };
  const keepOut = t.hole.diameterMm / 2 + t.hole.clearanceMm;
  const valid =
    t.widthMm > 0 &&
    t.heightMm > 0 &&
    t.bleedMm >= 0 &&
    t.safeMm >= 0 &&
    t.hole.diameterMm > 0 &&
    t.hole.fromEdgeMm - t.hole.diameterMm / 2 > 0 &&
    t.hole.fromEdgeMm + keepOut < t.widthMm / 3 &&
    t.hole.yMm - t.hole.diameterMm / 2 > 0 &&
    t.hole.yMm + t.hole.diameterMm / 2 < t.heightMm;
  if (!valid) throw new CardLayoutError("invalid_template", "The card template geometry is inconsistent.");
  return t;
}

// ------------------------------------------------------------------ text blocks ----

interface TextStyle {
  font: FontFamily;
  weight: FontWeight;
  fill: string;
}

interface Block {
  id: string;
  fit: FitResult;
  style: TextStyle;
  /** Space above this block (ignored for the first block of a stack). */
  gapBefore: number;
}

function blockHeight(b: Block): number {
  const s = b.fit.sizeMm;
  const first = b.fit.lines[0] ?? "";
  return (ascentEm(first) + descentEm()) * s + (b.fit.lines.length - 1) * LINE_HEIGHT * s;
}

function stackHeight(blocks: Block[]): number {
  return blocks.reduce((sum, b, i) => sum + blockHeight(b) + (i === 0 ? 0 : b.gapBefore), 0);
}

/** Lay blocks out top-down from `top`; returns the elements and the bottom edge of the last line. */
function stack(blocks: Block[], x: number, top: number): { elements: TextElement[]; bottom: number } {
  const elements: TextElement[] = [];
  let y = top;
  blocks.forEach((b, i) => {
    if (i > 0) y += b.gapBefore;
    const s = b.fit.sizeMm;
    let baseline = y + ascentEm(b.fit.lines[0] ?? "") * s;
    b.fit.lines.forEach((line, li) => {
      if (li > 0) baseline += LINE_HEIGHT * s;
      elements.push(textEl(b.fit.lines.length > 1 ? `${b.id}.${li}` : b.id, line, x, baseline, s, b.style));
    });
    y = baseline + descentEm() * s;
  });
  return { elements, bottom: y };
}

function textEl(
  id: string,
  text: string,
  x: number,
  baseline: number,
  sizeMm: number,
  style: TextStyle,
  extra: Partial<Pick<TextElement, "anchor" | "letterSpacingMm">> = {},
): TextElement {
  return {
    kind: "text",
    id,
    role: "content",
    x: round(x),
    y: round(baseline),
    text,
    font: style.font,
    weight: style.weight,
    sizeMm: round(sizeMm),
    anchor: extra.anchor ?? "start",
    fill: style.fill,
    letterSpacingMm: round(extra.letterSpacingMm ?? 0),
  };
}

// ---------------------------------------------------------------- shapes ----

function bleedRect(id: string, t: CardTemplate, x0: number, x1: number, fill: string): CardElement {
  return {
    kind: "rect",
    id,
    role: "background",
    x: round(x0),
    y: -t.bleedMm,
    w: round(x1 - x0),
    h: t.heightMm + 2 * t.bleedMm,
    r: 0,
    fill,
  };
}

const GLYPH = { stroke: 0.34, radii: [0.85, 1.45, 2.05], dot: 0.38, angle: (48 * Math.PI) / 180 } as const;
const GLYPH_OUTER = 2.05;
export const NFC_GLYPH_HALF_HEIGHT = GLYPH_OUTER * Math.sin(GLYPH.angle) + GLYPH.stroke;
const NFC_GLYPH_WIDTH = GLYPH_OUTER + GLYPH.stroke + GLYPH.dot;

/** Contactless hint: a dot with three arcs opening to the right. `right` is the glyph's right edge. */
function nfcGlyph(right: number, cy: number, color: string): CardElement[] {
  const cx = right - GLYPH_OUTER - GLYPH.stroke;
  const d = GLYPH.radii
    .map((r) => {
      const dx = round(r * Math.cos(GLYPH.angle));
      const dy = round(r * Math.sin(GLYPH.angle));
      return `M${round(cx + dx)} ${round(cy - dy)}A${r} ${r} 0 0 1 ${round(cx + dx)} ${round(cy + dy)}`;
    })
    .join("");
  return [
    {
      kind: "circle",
      id: "nfc.dot",
      role: "content",
      cx: round(cx),
      cy: round(cy),
      r: GLYPH.dot,
      fill: color,
    },
    {
      kind: "path",
      id: "nfc.arcs",
      role: "content",
      d,
      fill: null,
      stroke: color,
      strokeWidthMm: GLYPH.stroke,
      lineCap: "round",
      bounds: {
        x: round(cx - GLYPH.dot),
        y: round(cy - NFC_GLYPH_HALF_HEIGHT),
        w: round(NFC_GLYPH_WIDTH),
        h: round(2 * NFC_GLYPH_HALF_HEIGHT),
      },
    },
  ];
}

// ---------------------------------------------------------------- faces ----

interface FaceFrame {
  t: CardTemplate;
  hole: Circle;
  holeEdge: "left" | "right";
  /** Content column (outside the stub) in x. */
  colX0: number;
  colX1: number;
  stub: CardElement;
}

function frame(t: CardTemplate, hole: Circle, palette: FacePalette): FaceFrame {
  const holeEdge = hole.cx < t.widthMm / 2 ? "left" : "right";
  const fromEdge = holeEdge === "left" ? hole.cx : t.widthMm - hole.cx;
  const stubInner = fromEdge + hole.r + t.hole.clearanceMm + STUB_EXTRA;
  const stub =
    holeEdge === "left"
      ? bleedRect("stub", t, -t.bleedMm, stubInner, palette.stub)
      : bleedRect("stub", t, t.widthMm - stubInner, t.widthMm + t.bleedMm, palette.stub);
  const colX0 = holeEdge === "left" ? Math.max(t.safeMm, stubInner + STUB_GUTTER) : t.safeMm;
  const colX1 =
    holeEdge === "left"
      ? t.widthMm - t.safeMm
      : Math.min(t.widthMm - t.safeMm, t.widthMm - stubInner - STUB_GUTTER);
  return { t, hole, holeEdge, colX0, colX1, stub };
}

function side(face: "front" | "back", f: FaceFrame, elements: CardElement[], title: string): CardSide {
  return {
    face,
    widthMm: f.t.widthMm,
    heightMm: f.t.heightMm,
    bleedMm: f.t.bleedMm,
    safeMm: f.t.safeMm,
    cornerRadiusMm: f.t.cornerRadiusMm,
    holes: [{ cx: round(f.hole.cx), cy: round(f.hole.cy), r: round(f.hole.r) }],
    holeClearanceMm: f.t.hole.clearanceMm,
    elements,
    title,
  };
}

interface FrontText {
  label: string;
  name: string | null;
  headline: string;
  message: string;
  secondary: string | null;
}

function layoutFront(
  f: FaceFrame,
  input: CardInput,
  qr: Omit<QrElement, "x" | "y">,
  text: FrontText,
  warnings: Set<CardWarning>,
): CardElement[] {
  const { t } = f;
  const palette = CARD_PALETTES[input.theme];
  const p = palette.front;
  const panelSize = qr.sizeMm + 2 * QR_PANEL_PAD;
  // A hairline around the panel is centred on its edge; keep its outer half inside the column too.
  const strokeInset = palette.qrPanelStroke ? QR_PANEL_STROKE / 2 : 0;
  const panelX = f.holeEdge === "left" ? f.colX1 - panelSize - strokeInset : f.colX0 + strokeInset;
  const panelY = (t.heightMm - panelSize) / 2;
  const textX0 = f.holeEdge === "left" ? f.colX0 : panelX + panelSize + PANEL_GUTTER;
  const textX1 = f.holeEdge === "left" ? panelX - PANEL_GUTTER : f.colX1;
  const textW = textX1 - textX0;
  if (panelY < t.safeMm || textW < MIN_TEXT_COLUMN) {
    throw new CardLayoutError(
      "url_too_long",
      "The tag URL is too long to print a scannable QR on this card.",
    );
  }

  const panel: CardElement = {
    kind: "rect",
    id: "qr.panel",
    role: "content",
    x: round(panelX),
    y: round(panelY),
    w: round(panelSize),
    h: round(panelSize),
    r: QR_PANEL_RADIUS,
    fill: qr.light,
    ...(palette.qrPanelStroke ? { stroke: palette.qrPanelStroke, strokeWidthMm: QR_PANEL_STROKE } : {}),
  };
  const qrEl: QrElement = { ...qr, x: round(panelX + QR_PANEL_PAD), y: round(panelY + QR_PANEL_PAD) };

  // Try the calm composition first (text aligned to the QR panel); widen to the safe area and then
  // drop optional lines only if a long name or message would collide.
  const attempts = [
    { top: panelY, bottom: panelY + panelSize, secondary: true, messageLines: 2 },
    { top: t.safeMm, bottom: t.heightMm - t.safeMm, secondary: true, messageLines: 2 },
    { top: t.safeMm, bottom: t.heightMm - t.safeMm, secondary: false, messageLines: 2 },
    { top: t.safeMm, bottom: t.heightMm - t.safeMm, secondary: false, messageLines: 1 },
  ];

  for (const [i, a] of attempts.entries()) {
    const last = i === attempts.length - 1;
    const local = new Set<CardWarning>();

    // Top block: label (+ NFC glyph on the same row), then the owner's name.
    const labelFit = fitText({
      text: text.label,
      font: "sans",
      weight: "bold",
      maxSizeMm: 3.2,
      minSizeMm: 2.4,
      maxWidthMm: textW - NFC_GLYPH_WIDTH - 2,
      maxLines: 1,
      letterSpacingEm: 0.08,
    });
    if (labelFit.truncated) local.add("label_truncated");
    const labelSize = labelFit.sizeMm;
    // Cap top aligns with the band top; the NFC glyph is centred on the label's cap height.
    const capMiddle = 0.36 * labelSize;
    const baseline0 = a.top + ascentEm(labelFit.lines[0] ?? "") * labelSize;
    const labelBaseline = baseline0 + Math.max(0, t.safeMm - (baseline0 - capMiddle - NFC_GLYPH_HALF_HEIGHT));
    const top: CardElement[] = [
      textEl(
        "label",
        labelFit.lines[0] ?? "",
        textX0,
        labelBaseline,
        labelSize,
        {
          font: "sans",
          weight: "bold",
          fill: p.accent,
        },
        { letterSpacingMm: labelFit.letterSpacingMm },
      ),
      ...nfcGlyph(textX1, labelBaseline - capMiddle, p.graphic),
    ];
    let topBottom = Math.max(
      labelBaseline + descentEm() * labelSize,
      labelBaseline - capMiddle + NFC_GLYPH_HALF_HEIGHT,
    );
    if (text.name) {
      const nameFit = fitText({
        text: text.name,
        font: "sans",
        weight: "bold",
        maxSizeMm: 3.9,
        minSizeMm: 2.5,
        maxWidthMm: textW,
        maxLines: 1,
      });
      if (nameFit.truncated) local.add("name_truncated");
      const placed = stack(
        [{ id: "name", fit: nameFit, style: { font: "sans", weight: "bold", fill: p.strong }, gapBefore: 0 }],
        textX0,
        topBottom + 1.6,
      );
      top.push(...placed.elements);
      topBottom = placed.bottom;
    }

    // Bottom block: headline, message, small second-language line; stacked up from `a.bottom`.
    const blocks: Block[] = [];
    const headlineFit = fitText({
      text: text.headline,
      font: "sans",
      weight: "bold",
      maxSizeMm: 2.9,
      minSizeMm: 2.3,
      maxWidthMm: textW,
      maxLines: 2,
      balance: true,
    });
    blocks.push({
      id: "headline",
      fit: headlineFit,
      style: { font: "sans", weight: "bold", fill: p.text },
      gapBefore: 0,
    });
    const messageFit = fitText({
      text: text.message,
      font: "sans",
      weight: "regular",
      maxSizeMm: 2.35,
      minSizeMm: 1.95,
      maxWidthMm: textW,
      maxLines: a.messageLines,
      balance: true,
    });
    if (messageFit.truncated) local.add("message_truncated");
    if (messageFit.lines.length > 0) {
      blocks.push({
        id: "message",
        fit: messageFit,
        style: { font: "sans", weight: "regular", fill: p.text },
        gapBefore: 0.9,
      });
    }
    if (text.secondary && a.secondary) {
      const secondaryFit = fitText({
        text: text.secondary,
        font: "sans",
        weight: "regular",
        maxSizeMm: 2.0,
        minSizeMm: 1.8,
        maxWidthMm: textW,
        maxLines: 2,
        balance: true,
      });
      blocks.push({
        id: "secondary",
        fit: secondaryFit,
        style: { font: "sans", weight: "regular", fill: p.muted },
        gapBefore: 1.5,
      });
    } else if (text.secondary) {
      local.add("secondary_line_dropped");
    }
    const bottomTop = a.bottom - stackHeight(blocks);
    if (bottomTop >= topBottom + 2 || last) {
      for (const w of local) warnings.add(w);
      const bottom = stack(blocks, textX0, bottomTop);
      return [
        bleedRect("background", t, -t.bleedMm, t.widthMm + t.bleedMm, p.background),
        f.stub,
        panel,
        qrEl,
        ...top,
        ...bottom.elements,
      ];
    }
  }
  throw new CardLayoutError("invalid_template", "No front layout attempt was evaluated.");
}

function layoutBack(
  f: FaceFrame,
  input: CardInput,
  text: { label: string; email: string | null; url: string; emailCaption: string; urlCaption: string },
  warnings: Set<CardWarning>,
): CardElement[] {
  const { t } = f;
  const palette = CARD_PALETTES[input.theme];
  const p = palette.back;
  const x0 = f.colX0;
  const x1 = f.colX1;
  const width = x1 - x0;
  const bandTop = t.safeMm + 1.5;
  const bandBottom = t.heightMm - t.safeMm - 1.5;

  // Top row: wordmark left, label right.
  const brandSize = 2.5;
  const brandSpacing = 0.3 * brandSize;
  const brandBaseline = bandTop + ascentEm(BRAND_MARK) * brandSize;
  const brandW = measureText(BRAND_MARK, {
    font: "sans",
    weight: "bold",
    sizeMm: brandSize,
    letterSpacingMm: brandSpacing,
  });
  const labelFit = fitText({
    text: text.label,
    font: "sans",
    weight: "bold",
    maxSizeMm: 2.5,
    minSizeMm: 2.0,
    maxWidthMm: width - brandW - 4,
    maxLines: 1,
  });
  if (labelFit.truncated) warnings.add("label_truncated");
  const rowBottom = brandBaseline + descentEm() * brandSize;
  const ruleY = rowBottom + 1.4;
  const elements: CardElement[] = [
    bleedRect("background", t, -t.bleedMm, t.widthMm + t.bleedMm, p.background),
    f.stub,
    textEl(
      "brand",
      BRAND_MARK,
      x0,
      brandBaseline,
      brandSize,
      { font: "sans", weight: "bold", fill: palette.brandMark },
      { letterSpacingMm: brandSpacing },
    ),
    textEl(
      "label",
      labelFit.lines[0] ?? "",
      x1,
      brandBaseline,
      labelFit.sizeMm,
      {
        font: "sans",
        weight: "bold",
        fill: p.muted,
      },
      { anchor: "end" },
    ),
    {
      kind: "rect",
      id: "rule",
      role: "content",
      x: round(x0),
      y: round(ruleY),
      w: round(width),
      h: 0.2,
      r: 0,
      fill: p.graphic,
    },
  ];

  // Bottom: optional reward line.
  let groupBottom = bandBottom;
  if (input.showReward) {
    const rewardFit = fitText({
      text: REWARD_LINE,
      font: "sans",
      weight: "bold",
      maxSizeMm: 2.3,
      minSizeMm: 1.9,
      maxWidthMm: width,
      maxLines: 1,
    });
    const rewardBlock: Block = {
      id: "reward",
      fit: rewardFit,
      style: { font: "sans", weight: "bold", fill: p.accent },
      gapBefore: 0,
    };
    const placed = stack([rewardBlock], x0, bandBottom - blockHeight(rewardBlock));
    elements.push(...placed.elements);
    groupBottom = bandBottom - blockHeight(rewardBlock) - 2;
  }

  // Middle: fallback email, then the typeable URL, centred in the remaining space.
  const caption = (id: string, value: string): Block => ({
    id,
    fit: fitText({
      text: value,
      font: "sans",
      weight: "regular",
      maxSizeMm: 2.1,
      minSizeMm: 1.8,
      maxWidthMm: width,
      maxLines: 1,
    }),
    style: { font: "sans", weight: "regular", fill: p.muted },
    gapBefore: 2.8,
  });
  const blocks: Block[] = [];
  if (text.email) {
    const emailFit = fitText({
      text: text.email,
      font: "sans",
      weight: "bold",
      maxSizeMm: 3.6,
      minSizeMm: 2.3,
      maxWidthMm: width,
      maxLines: 2,
      breaks: "email",
    });
    if (emailFit.truncated) warnings.add("email_truncated");
    blocks.push(caption("caption.email", text.emailCaption), {
      id: "email",
      fit: emailFit,
      style: { font: "sans", weight: "bold", fill: p.strong },
      gapBefore: 0.9,
    });
  } else {
    warnings.add("no_printed_email");
  }
  const urlFit = fitText({
    text: text.url,
    font: "mono",
    weight: "bold",
    maxSizeMm: 3.0,
    minSizeMm: 2.0,
    maxWidthMm: width,
    maxLines: 3,
    breaks: "url",
  });
  if (urlFit.truncated) warnings.add("url_truncated");
  blocks.push(caption("caption.url", text.urlCaption), {
    id: "url",
    fit: urlFit,
    style: { font: "mono", weight: "bold", fill: p.strong },
    gapBefore: 0.9,
  });
  const groupTop = ruleY + 0.2 + 2;
  const free = groupBottom - groupTop - stackHeight(blocks);
  elements.push(...stack(blocks, x0, groupTop + Math.max(0, free / 2)).elements);
  return elements;
}

// ---------------------------------------------------------------- entry ----

export function buildCard(input: CardInput): Card {
  const t = resolveTemplate(input.template);
  const palette = CARD_PALETTES[input.theme];
  const copy = CARD_COPY[input.language];
  const secondaryLang =
    input.secondaryLanguage === undefined
      ? defaultSecondaryLanguage(input.language)
      : input.secondaryLanguage;
  const warnings = new Set<CardWarning>();

  const matrix = encodeQr(input.url, "M");
  let sizeMm = t.qrMm;
  if (sizeMm / matrix.size < t.minModuleMm) sizeMm = matrix.size * t.minModuleMm;
  const qr: Omit<QrElement, "x" | "y"> = {
    kind: "qr",
    id: "qr",
    role: "content",
    sizeMm: round(sizeMm, 4),
    moduleMm: sizeMm / matrix.size,
    matrix,
    dark: palette.qrDark,
    light: palette.qrLight,
  };

  const frontHole: Circle = {
    cx: t.hole.edge === "left" ? t.hole.fromEdgeMm : t.widthMm - t.hole.fromEdgeMm,
    cy: t.hole.yMm,
    r: t.hole.diameterMm / 2,
  };
  const flipped = flipToBack({ x: frontHole.cx, y: frontHole.cy }, t, t.flip);
  const backHole: Circle = { cx: flipped.x, cy: flipped.y, r: frontHole.r };

  const label = input.label.trim();
  const name = input.ownerName?.trim() || null;
  const email = input.printedEmail?.trim() || null;
  const shownUrl = displayUrl(input.url);

  const frontFrame = frame(t, frontHole, palette.front);
  const backFrame = frame(t, backHole, palette.back);
  const front = layoutFront(
    frontFrame,
    input,
    qr,
    {
      label,
      name,
      headline: copy.headline,
      message: input.cardMessage?.trim() || copy.message,
      secondary: secondaryLang && secondaryLang !== input.language ? CARD_COPY[secondaryLang].headline : null,
    },
    warnings,
  );
  const back = layoutBack(
    backFrame,
    input,
    { label, email, url: shownUrl, emailCaption: copy.emailCaption, urlCaption: copy.urlCaption },
    warnings,
  );

  return {
    front: side("front", frontFrame, front, `RETURN card ${label} — front`),
    back: side("back", backFrame, back, `RETURN card ${label} — back`),
    meta: {
      label,
      url: input.url,
      displayUrl: shownUrl,
      proof: isProofUrl(input.url),
      qr: { version: matrix.version, modules: matrix.size, moduleMm: qr.moduleMm, sizeMm: qr.sizeMm },
      warnings: [...warnings],
    },
  };
}
