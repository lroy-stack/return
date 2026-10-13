import jsQR from "jsqr";
import { decodePDFRawStream, PDFDocument, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  backPointToPage,
  buildPaperSheet,
  type CardInput,
  flipToBack,
  foldedPosition,
  frontPointAt,
  measureText,
  PAPER_INSTRUCTIONS,
  type PaperPage,
  type PaperUnit,
  PROOF_WATERMARK,
  paperPixelSize,
  type QrElement,
  renderPaperSvg,
} from "../src/shared/card";
import { PAPER_SIZES_MM } from "../src/shared/card/paper";
import { renderPaperPdf } from "../src/shared/card/paper-pdf";
import { readPngDpi, setPngDpi } from "../src/shared/card/png";

const PT_PER_MM = 72 / 25.4;

const input = (i: number, extra: Partial<CardInput> = {}): CardInput => ({
  url: `https://return.example.com/t/01j9x3k2m4n5p6q7r8s9t0v1w${i}`,
  label: `RT-00${i}`,
  theme: "petrol",
  language: "en",
  ownerName: "Lucía Müller",
  printedEmail: "lucia.mueller@example.com",
  cardMessage: null,
  ...extra,
});
const inputs = (count: number, extra: Partial<CardInput> = {}) =>
  Array.from({ length: count }, (_, i) => input(i + 1, extra));

function decodeQr(qr: QrElement, px = 8): string | null {
  const n = qr.matrix.size;
  const size = n * px;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const row = qr.matrix.modules[Math.floor(y / px)];
    for (let x = 0; x < size; x++) {
      const v = row?.[Math.floor(x / px)] ? 0 : 255;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return jsQR(data, size, size, { inversionAttempts: "dontInvert" })?.data ?? null;
}

const qrOf = (side: { elements: readonly unknown[] }) =>
  side.elements.find((e): e is QrElement => (e as QrElement).kind === "qr") as QrElement;

const allUnits = (pages: PaperPage[]) => pages.flatMap((p) => p.units);

describe("paper sheet layout", () => {
  it.each(["a4", "letter"] as const)(
    "fits 4 fold-over units per %s page, then starts a new page",
    (paper) => {
      const pages = buildPaperSheet(inputs(7), { paper, layout: "fold" });
      expect(pages.map((p) => p.units.length)).toEqual([4, 3]);
      expect(pages.every((p) => p.pageCount === 2)).toBe(true);
      expect(pages.map((p) => p.index)).toEqual([0, 1]);
      expect(allUnits(pages).map((u) => u.card.meta.label)).toEqual(inputs(7).map((i) => i.label));
    },
  );

  it("uses the true page sizes", () => {
    const [a4] = buildPaperSheet(inputs(1), { paper: "a4", layout: "fold" });
    const [letter] = buildPaperSheet(inputs(1), { paper: "letter", layout: "fold" });
    expect([a4?.widthMm, a4?.heightMm]).toEqual([210, 297]);
    expect([letter?.widthMm, letter?.heightMm]).toEqual([215.9, 279.4]);
  });

  it("rejects an empty selection and unknown layouts", () => {
    expect(() => buildPaperSheet([], { paper: "a4", layout: "fold" })).toThrow(/at least one card/);
    expect(() => buildPaperSheet(inputs(1), { paper: "a4", layout: "tent" as "fold" })).toThrow(
      /Unsupported/,
    );
  });

  it.each(["a4", "letter"] as const)(
    "keeps units, marks and the guide inside the margins on %s without overlap",
    (paper) => {
      const pages = buildPaperSheet(inputs(9), { paper, layout: "fold" });
      for (const page of pages) {
        const m = page.marginMm;
        const inside = (x: number, y: number) =>
          x >= m - 1e-6 && y >= m - 1e-6 && x <= page.widthMm - m + 1e-6 && y <= page.heightMm - m + 1e-6;
        const foot = page.units.map((u) => u.rect);
        for (const r of foot) {
          expect(inside(r.x, r.y)).toBe(true);
          expect(inside(r.x + r.w, r.y + r.h)).toBe(true);
        }
        for (const mark of page.marks) {
          if (mark.kind === "line") {
            expect(inside(mark.x1, mark.y1)).toBe(true);
            expect(inside(mark.x2, mark.y2)).toBe(true);
          }
        }
        foot.forEach((a, i) => {
          for (const b of foot.slice(i + 1)) {
            const apart = a.y + a.h <= b.y || b.y + b.h <= a.y || a.x + a.w <= b.x || b.x + b.w <= a.x;
            expect(apart).toBe(true);
          }
        });
        // The cutting guide lives in the bottom margin, below every card and mark.
        const lowest = Math.max(...page.units.map((u) => u.rect.y + u.rect.h + 5));
        expect(page.instructions.y).toBeGreaterThan(page.heightMm - m);
        expect(lowest).toBeLessThanOrEqual(page.heightMm - m);
        const width = measureText(page.instructions.text, {
          font: "sans",
          weight: "regular",
          sizeMm: page.instructions.sizeMm,
          letterSpacingMm: 0,
        });
        expect(width).toBeLessThan(page.widthMm - 2 * m);
      }
    },
  );

  it("keeps the true physical card size (85.6 × 54 mm per face) and a 2 × width unit", () => {
    for (const unit of allUnits(buildPaperSheet(inputs(5), { paper: "a4", layout: "fold" }))) {
      for (const face of [unit.front, unit.back]) {
        expect(face.w).toBeCloseTo(85.6, 6);
        expect(face.h).toBeCloseTo(54, 6);
      }
      expect(unit.rect.w).toBeCloseTo(171.2, 6);
      expect(unit.back.x).toBeCloseTo(unit.front.x + unit.front.w, 6);
      expect(unit.foldX).toBeCloseTo(unit.back.x, 6);
    }
  });

  it("draws 3 mm crop marks offset 2 mm from the trim, plus fold ticks", () => {
    const [page] = buildPaperSheet(inputs(1), { paper: "a4", layout: "fold" });
    const unit = page?.units[0] as PaperUnit;
    const solid = page?.marks.filter((m) => m.kind === "line" && !m.dash) ?? [];
    expect(solid).toHaveLength(8);
    for (const m of solid) {
      if (m.kind !== "line") continue;
      expect(Math.hypot(m.x2 - m.x1, m.y2 - m.y1)).toBeCloseTo(3, 6);
    }
    const topLeftH = solid.find((m) => m.kind === "line" && m.y1 === unit.rect.y && m.x2 < unit.rect.x);
    expect(topLeftH?.kind === "line" && unit.rect.x - Math.max(topLeftH.x1, topLeftH.x2)).toBeCloseTo(2, 6);
    expect(page?.marks.filter((m) => m.dash)).toHaveLength(2);
  });

  it("marks the fold and both punch holes with dashed strokes", () => {
    const [page] = buildPaperSheet(inputs(1), { paper: "a4", layout: "fold" });
    const unit = page?.units[0] as PaperUnit;
    expect(
      unit.foldLine.every((m) => m.kind === "line" && m.dash && m.x1 === unit.foldX && m.x2 === unit.foldX),
    ).toBe(true);
    const circles = unit.punch.filter((m) => m.kind === "circle");
    expect(circles).toHaveLength(4);
    expect(circles.every((c) => c.kind === "circle" && c.dash && c.r === 2.5)).toBe(true);
  });
});

describe("fold-over pairing", () => {
  it("puts every back point directly behind the matching flipToBack point of the front", () => {
    const [page] = buildPaperSheet(inputs(1), { paper: "a4", layout: "fold" });
    const unit = page?.units[0] as PaperUnit;
    const t = { widthMm: 85.6, heightMm: 54 };
    for (const b of [
      { x: 0, y: 0 },
      { x: 10, y: 7 },
      { x: 85.6, y: 54 },
      { x: 42.8, y: 40 },
    ]) {
      const onPage = backPointToPage(unit, b);
      expect(onPage.x).toBeGreaterThanOrEqual(unit.back.x - 1e-9);
      expect(onPage.x).toBeLessThanOrEqual(unit.back.x + unit.back.w + 1e-9);
      const behind = frontPointAt(unit, foldedPosition(unit, onPage));
      // The front point `behind` is what the finder sees when turning the card; its flip is b.
      const turned = flipToBack(behind, t, "long-axis");
      expect(turned.x).toBeCloseTo(b.x, 6);
      expect(turned.y).toBeCloseTo(b.y, 6);
    }
  });

  it("makes the two punch holes coincide after folding", () => {
    const [page] = buildPaperSheet(inputs(1), { paper: "letter", layout: "fold" });
    const unit = page?.units[0] as PaperUnit;
    const [front, back] = [unit.punch[0], unit.punch[2]];
    if (front?.kind !== "circle" || back?.kind !== "circle") throw new Error("expected circles");
    const folded = foldedPosition(unit, { x: back.cx, y: back.cy });
    expect(folded.x).toBeCloseTo(front.cx, 6);
    expect(folded.y).toBeCloseTo(front.cy, 6);
  });

  it("rotates the back panel by 180° in the SVG", () => {
    const [page] = buildPaperSheet(inputs(1), { paper: "a4", layout: "fold" });
    const unit = page?.units[0] as PaperUnit;
    const svg = renderPaperSvg(page as PaperPage);
    expect(svg).toContain(
      `id="${unit.id}-back-art" transform="translate(${unit.back.x + unit.back.w} ${unit.back.y + unit.back.h}) rotate(180)"`,
    );
    expect(svg).toContain(`id="${unit.id}-front-art" transform="translate(${unit.front.x} ${unit.front.y})"`);
  });
});

describe("QR codes", () => {
  it.each(["a4", "letter"] as const)("every QR on every %s page decodes to its exact URL", (paper) => {
    const list = inputs(6);
    const pages = buildPaperSheet(list, { paper, layout: "fold" });
    const units = allUnits(pages);
    expect(units).toHaveLength(6);
    units.forEach((unit, i) => {
      expect(decodeQr(qrOf(unit.card.front))).toBe(list[i]?.url);
    });
  });

  it("decodes proof URLs too", () => {
    const url = "http://localhost:8787/t/abc";
    const [page] = buildPaperSheet([input(1, { url })], { paper: "a4", layout: "fold" });
    expect(decodeQr(qrOf((page as PaperPage).units[0]?.card.front ?? { elements: [] }))).toBe(url);
  });
});

describe("SVG", () => {
  const svgOf = (extra: Partial<CardInput> = {}, paper: "a4" | "letter" = "a4") =>
    renderPaperSvg(buildPaperSheet(inputs(2, extra), { paper, layout: "fold" })[0] as PaperPage);

  it("is a millimetre-unit standalone document with a white background", () => {
    const svg = svgOf();
    expect(svg).toContain('width="210mm" height="297mm" viewBox="0 0 210 297"');
    expect(svg).toContain('<rect width="210" height="297" fill="#ffffff"/>');
    expect(svgOf({}, "letter")).toContain('width="215.9mm" height="279.4mm" viewBox="0 0 215.9 279.4"');
  });

  it("has no scripts and no external references", () => {
    const svg = svgOf();
    expect(svg).not.toMatch(/<script|<image|<foreignObject|javascript:|@import/i);
    expect(svg).not.toMatch(/(?:href|src)=/i);
    expect(svg.match(/url\(([^)]*)\)/g)?.every((u) => u.startsWith("url(#"))).toBe(true);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  });

  it("escapes user text", () => {
    const svg = svgOf({ ownerName: '<script>alert("x")</script> & Co', label: "A&B<1>" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("A&amp;B&lt;1&gt;");
  });

  it.each(["en", "de", "es"] as const)("prints the %s cutting guide in the margin", (language) => {
    const svg = svgOf({ language });
    expect(svg).toContain(PAPER_INSTRUCTIONS[language]);
  });

  it("stamps the watermark only in proof mode", () => {
    expect(svgOf()).not.toContain("proof-watermark");
    for (const url of ["http://return.example.com/t/x", "https://localhost/t/x", "https://return.test/t/x"]) {
      const pages = buildPaperSheet([input(1), input(2, { url })], { paper: "a4", layout: "fold" });
      expect(pages.every((p) => p.watermark === PROOF_WATERMARK)).toBe(true);
      const svg = renderPaperSvg(pages[0] as PaperPage);
      expect(svg).toContain("proof-watermark");
      expect(svg).toContain(PROOF_WATERMARK);
    }
  });
});

describe("PDF", () => {
  it.each(["a4", "letter"] as const)("has one page per sheet at the paper size (%s)", async (paper) => {
    const pages = buildPaperSheet(inputs(7), { paper, layout: "fold" });
    const doc = await PDFDocument.load(await renderPaperPdf(pages));
    expect(doc.getPageCount()).toBe(2);
    const size = PAPER_SIZES_MM[paper];
    for (const page of doc.getPages()) {
      expect(page.getWidth()).toBeCloseTo(size.widthMm * PT_PER_MM, 3);
      expect(page.getHeight()).toBeCloseTo(size.heightMm * PT_PER_MM, 3);
    }
  });

  it("refuses an empty page list", async () => {
    await expect(renderPaperPdf([])).rejects.toThrow(/at least one card/);
  });

  it("stamps the proof text only in proof mode", async () => {
    const hex = (s: string) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    const content = async (list: CardInput[]) => {
      const doc = await PDFDocument.load(
        await renderPaperPdf(buildPaperSheet(list, { paper: "a4", layout: "fold" })),
      );
      const parts: string[] = [];
      for (const [, obj] of doc.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFRawStream) {
          parts.push(new TextDecoder("latin1").decode(decodePDFRawStream(obj).decode()).toLowerCase());
        }
      }
      return parts.join("\n");
    };
    expect(await content(inputs(1))).not.toContain(hex("PROOF"));
    expect(await content([input(1, { url: "http://localhost/t/x" })])).toContain(hex("PROOF"));
  });
});

describe("PNG export helpers", () => {
  it("sizes pages at 300 dpi and the pHYs chunk declares it", () => {
    const [a4] = buildPaperSheet(inputs(1), { paper: "a4", layout: "fold" });
    const [letter] = buildPaperSheet(inputs(1), { paper: "letter", layout: "fold" });
    expect(paperPixelSize(a4 as PaperPage)).toEqual({ width: 2480, height: 3508 });
    expect(paperPixelSize(letter as PaperPage)).toEqual({ width: 2550, height: 3300 });
    expect(paperPixelSize(a4 as PaperPage, 150)).toEqual({ width: 1240, height: 1754 });
    // Minimal valid PNG (1×1) to exercise the shared pHYs writer.
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    expect(readPngDpi(setPngDpi(png, 300))).toBe(300);
  });
});
