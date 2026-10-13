import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildCard, type CardInput, measureText, PROOF_WATERMARK } from "../src/shared/card";
import { renderPdf, toWinAnsi } from "../src/shared/card/pdf";
import { readPngDpi, setPngDpi } from "../src/shared/card/png";
import { CARD_THEMES } from "../src/shared/settings";

const PT_PER_MM = 72 / 25.4;
const BASE: CardInput = {
  url: "https://return.example.com/t/01j9x3k2m4n5p6q7r8s9t0v1w2",
  label: "RT-001",
  theme: "petrol",
  language: "de",
  ownerName: "Señora Müller",
  printedEmail: "lucia.mueller@example.com",
  cardMessage: "Finderlohn garantiert — ¡gracias!",
  showReward: true,
};

describe("card PDF", () => {
  it("has one page per face, sized card + bleed, with TrimBox and BleedBox", async () => {
    const cards = CARD_THEMES.map((theme, i) => buildCard({ ...BASE, theme, label: `RT-00${i + 1}` }));
    const bytes = await renderPdf(cards, { watermark: PROOF_WATERMARK });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(6);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(89.6 * PT_PER_MM, 3);
      expect(height).toBeCloseTo(58 * PT_PER_MM, 3);
      const trim = page.getTrimBox();
      expect(trim.x).toBeCloseTo(2 * PT_PER_MM, 3);
      expect(trim.y).toBeCloseTo(2 * PT_PER_MM, 3);
      expect(trim.width).toBeCloseTo(85.6 * PT_PER_MM, 3);
      expect(trim.height).toBeCloseTo(54 * PT_PER_MM, 3);
      expect(page.getBleedBox()).toMatchObject({ x: 0, y: 0 });
      expect(page.getBleedBox().width).toBeCloseTo(width, 3);
    }
  });

  it("exports characters outside WinAnsi instead of failing", async () => {
    const card = buildCard({ ...BASE, ownerName: "李小龍 😀", label: "RT-٠٠١" });
    await expect(renderPdf([card])).resolves.toBeInstanceOf(Uint8Array);
  });

  it("refuses an empty selection", async () => {
    await expect(renderPdf([])).rejects.toThrow(/at least one card/);
  });

  it("keeps German and Spanish characters and replaces the rest", () => {
    expect(toWinAnsi("Müller · Señora · Weiß · ¿Qué? — 20 €")).toBe("Müller · Señora · Weiß · ¿Qué? — 20 €");
    expect(toWinAnsi("Müller")).toBe("Müller");
    expect(toWinAnsi("李 😀")).toBe("? ?");
  });
});

describe("width estimation", () => {
  it("never underestimates the real Helvetica/Courier widths, and stays within 10 %", async () => {
    const doc = await PDFDocument.create();
    const samples = [
      "RT-001",
      "Lucía Müller",
      "If found, please scan or tap",
      "Gefunden? Bitte scannen oder antippen",
      "¿Lo encontró? Escanee o acerque el móvil",
      "WWWMMM iiill",
      "Reward · Belohnung · Recompensa",
    ];
    const fonts = [
      ["sans", "regular", StandardFonts.Helvetica],
      ["sans", "bold", StandardFonts.HelveticaBold],
      ["mono", "regular", StandardFonts.Courier],
      ["mono", "bold", StandardFonts.CourierBold],
    ] as const;
    for (const [font, weight, name] of fonts) {
      const pdfFont = await doc.embedFont(name);
      for (const text of samples) {
        const real = pdfFont.widthOfTextAtSize(text, 10);
        const estimate = measureText(text, { font, weight, sizeMm: 10 });
        expect(estimate, `${name}: ${text}`).toBeGreaterThanOrEqual(real);
        expect(estimate / real, `${name}: ${text}`).toBeLessThanOrEqual(1.1);
      }
    }
  });
});

describe("PNG resolution", () => {
  // 1×1 transparent PNG without a pHYs chunk.
  const png = Uint8Array.from(
    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0),
  );

  it("declares 300 dpi in a pHYs chunk right after IHDR", () => {
    expect(readPngDpi(png)).toBeNull();
    const out = setPngDpi(png, 300);
    expect(readPngDpi(out)).toBe(300);
    expect(String.fromCharCode(...out.subarray(37, 41))).toBe("pHYs");
    expect(out.length).toBe(png.length + 21);
  });

  it("replaces an existing pHYs chunk instead of adding a second one", () => {
    const twice = setPngDpi(setPngDpi(png, 72), 300);
    expect(readPngDpi(twice)).toBe(300);
    expect(twice.length).toBe(png.length + 21);
  });

  it("rejects non-PNG input", () => {
    expect(() => setPngDpi(new Uint8Array(40), 300)).toThrow(/Not a PNG/);
  });
});
