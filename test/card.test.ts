import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import {
  boxesOverlap,
  boxInside,
  boxIntersectsCircle,
  buildCard,
  type Card,
  type CardElement,
  type CardInput,
  CardLayoutError,
  type CardSide,
  cardInputFromSettings,
  DEFAULT_TEMPLATE,
  displayUrl,
  elementBounds,
  fitText,
  isProofUrl,
  keepOutZones,
  measureText,
  PROOF_WATERMARK,
  type QrElement,
  renderSvg,
  safeBox,
  type TextElement,
} from "../src/shared/card";
import type { Tag } from "../src/shared/schemas";
import { CARD_THEMES, DEFAULT_SETTINGS, type Settings } from "../src/shared/settings";

const TOKEN = "01j9x3k2m4n5p6q7r8s9t0v1w2";
const URL_LIVE = `https://return.example.com/t/${TOKEN}`;

const BASE: CardInput = {
  url: URL_LIVE,
  label: "RT-001",
  theme: "petrol",
  language: "en",
  ownerName: "Lucía Müller",
  printedEmail: "lucia.mueller@example.com",
  cardMessage: null,
};

const LONG: Partial<CardInput> = {
  label: "TRAVELLER-123456",
  ownerName: "Maximilian Alexander Friedrich von Hohenzollern-Sigmaringen und Württemberg",
  printedEmail:
    "a.very.long.local.part.for.lost.luggage.testing@subdomain.example-mail-provider-with-long-name.com",
  cardMessage:
    "Thank you so much! I travel a lot and this bag has all my camera gear inside, a reward is offered",
};

const VARIANTS: Array<[string, Partial<CardInput>]> = [
  ["regular", {}],
  ["long texts", LONG],
  ["no name, no email", { ownerName: null, printedEmail: null }],
  ["reward", { showReward: true }],
  ["reward + long texts", { ...LONG, showReward: true }],
  ["german", { language: "de", ownerName: "Jürgen Weiß" }],
  ["spanish", { language: "es", ownerName: "Señora Íñiguez" }],
];

const TEMPLATES: Array<[string, CardInput["template"]]> = [
  ["default (hole left, centred)", undefined],
  ["hole right", { hole: { edge: "right" } }],
  ["corner hole", { hole: { yMm: 10 } }],
  ["short-axis flip, low hole", { flip: "short-axis", hole: { yMm: 44, edge: "right" } }],
];

const qrOf = (side: CardSide): QrElement => {
  const qr = side.elements.find((e): e is QrElement => e.kind === "qr");
  if (!qr) throw new Error("no qr element");
  return qr;
};
const texts = (side: CardSide): TextElement[] =>
  side.elements.filter((e): e is TextElement => e.kind === "text");
const textOf = (side: CardSide, prefix: string): string =>
  texts(side)
    .filter((t) => t.id === prefix || t.id.startsWith(`${prefix}.`))
    .map((t) => t.text)
    .join("");

function hexToRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Rasterise the QR element's own matrix and colours (8 px per module, quiet zone included). */
function decodeQr(qr: QrElement, px = 8): string | null {
  const n = qr.matrix.size;
  const size = n * px;
  const data = new Uint8ClampedArray(size * size * 4);
  const dark = hexToRgb(qr.dark);
  const light = hexToRgb(qr.light);
  for (let y = 0; y < size; y++) {
    const row = qr.matrix.modules[Math.floor(y / px)];
    for (let x = 0; x < size; x++) {
      const [r, g, b] = row?.[Math.floor(x / px)] ? dark : light;
      const i = (y * size + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return jsQR(data, size, size, { inversionAttempts: "dontInvert" })?.data ?? null;
}

function layoutProblems(side: CardSide): string[] {
  const problems: string[] = [];
  const safe = safeBox(side);
  const zones = keepOutZones(side);
  const content = side.elements.filter((e) => e.role === "content");
  for (const el of content) {
    const b = elementBounds(el);
    if (!boxInside(b, safe)) problems.push(`${side.face}:${el.id} leaves the safe area ${JSON.stringify(b)}`);
    for (const z of zones) {
      if (boxIntersectsCircle(b, z)) problems.push(`${side.face}:${el.id} touches the hole zone`);
    }
  }
  // Text never collides with other content (the QR sits inside its own panel, which is fine).
  for (const t of content.filter((e) => e.kind === "text")) {
    for (const other of content) {
      if (other === t) continue;
      if (boxesOverlap(elementBounds(t), elementBounds(other))) {
        problems.push(`${side.face}:${t.id} overlaps ${other.id}`);
      }
    }
  }
  return problems;
}

describe("card QR", () => {
  it.each(CARD_THEMES)("decodes back to the exact tag URL (%s theme)", (theme) => {
    const card = buildCard({ ...BASE, theme });
    expect(decodeQr(qrOf(card.front))).toBe(URL_LIVE);
  });

  it("decodes a localhost proof URL and a long URL whose modules had to grow", () => {
    const proof = `http://localhost:8787/t/${TOKEN}`;
    expect(decodeQr(qrOf(buildCard({ ...BASE, url: proof }).front))).toBe(proof);
    const long = `https://found.a-rather-long-travel-domain-name-for-testing-the-module-size.example.org/t/${TOKEN}?src=card-v1&lang=en`;
    const card = buildCard({ ...BASE, url: long });
    expect(card.meta.qr.version).toBeGreaterThan(4);
    expect(decodeQr(qrOf(card.front))).toBe(long);
  });

  it("is at least 20 mm with modules of at least 0.5 mm and a 4-module quiet zone", () => {
    for (const url of [URL_LIVE, `https://x.example.org/t/${TOKEN}?${"a".repeat(80)}`]) {
      const qr = qrOf(buildCard({ ...BASE, url }).front);
      expect(qr.sizeMm).toBeGreaterThanOrEqual(20);
      expect(qr.moduleMm).toBeGreaterThanOrEqual(0.5);
      expect(qr.moduleMm * qr.matrix.size).toBeCloseTo(qr.sizeMm, 3);
      const m = qr.matrix.modules;
      const n = qr.matrix.size;
      for (let i = 0; i < 4; i++) {
        expect(m[i]?.some(Boolean)).toBe(false);
        expect(m[n - 1 - i]?.some(Boolean)).toBe(false);
        expect(m.some((row) => row[i] || row[n - 1 - i])).toBe(false);
      }
    }
  });

  it.each(CARD_THEMES)(
    "sits inside the safe area, clear of the hole, on a high-contrast light panel (%s)",
    (theme) => {
      const card = buildCard({ ...BASE, theme });
      const qr = qrOf(card.front);
      const box = elementBounds(qr);
      expect(boxInside(box, safeBox(card.front))).toBe(true);
      for (const z of keepOutZones(card.front)) expect(boxIntersectsCircle(box, z)).toBe(false);
      expect(contrast(qr.dark, qr.light)).toBeGreaterThanOrEqual(7);
      // Dark modules on a light ground, never inverted.
      expect(luminance(qr.dark)).toBeLessThan(luminance(qr.light));
      const panel = card.front.elements.find((e) => e.id === "qr.panel");
      expect(panel?.kind).toBe("rect");
      if (panel?.kind === "rect") {
        expect(panel.fill).toBe(qr.light);
        expect(boxInside(box, elementBounds(panel))).toBe(true);
        // The rounded corner must not clip the quiet zone: pad ≥ r·(1 − 1/√2).
        expect(qr.x - panel.x).toBeGreaterThanOrEqual(panel.r * (1 - Math.SQRT1_2));
      }
    },
  );

  it("refuses URLs too long for a scannable QR on the card", () => {
    expect(() => buildCard({ ...BASE, url: `https://example.org/t/${"x".repeat(900)}` })).toThrow(
      CardLayoutError,
    );
  });
});

describe("card layout", () => {
  for (const [templateName, template] of TEMPLATES) {
    for (const theme of CARD_THEMES) {
      it.each(VARIANTS)(
        `keeps content in the safe area and out of the hole: ${templateName}, ${theme}, %s`,
        (_, v) => {
          const card = buildCard({ ...BASE, ...v, theme, template });
          expect(layoutProblems(card.front)).toEqual([]);
          expect(layoutProblems(card.back)).toEqual([]);
        },
      );
    }
  }

  it("lets only background elements reach into the bleed", () => {
    const card = buildCard(BASE);
    const bg = card.front.elements.filter((e) => e.role === "background");
    expect(bg.map((e) => e.id)).toEqual(["background", "stub"]);
    const full = elementBounds(bg[0] as CardElement);
    expect(full).toEqual({ x: -2, y: -2, w: 89.6, h: 58 });
  });

  it("puts the expected content on each face", () => {
    const card = buildCard({ ...BASE, showReward: true });
    expect(textOf(card.front, "label")).toBe("RT-001");
    expect(textOf(card.front, "name")).toBe("Lucía Müller");
    expect(texts(card.front).find((t) => t.id.startsWith("headline"))).toBeDefined();
    expect(textOf(card.front, "message").replace(/\s/g, "")).toBe("Noapporaccountneeded.");
    expect(textOf(card.front, "secondary")).toContain("Gefunden?");
    expect(card.front.elements.some((e) => e.id === "nfc.arcs")).toBe(true);

    expect(textOf(card.back, "brand")).toBe("RETURN");
    expect(textOf(card.back, "label")).toBe("RT-001");
    expect(textOf(card.back, "email")).toBe("lucia.mueller@example.com");
    expect(textOf(card.back, "url")).toBe(`return.example.com/t/${TOKEN}`);
    const urlLines = texts(card.back).filter((t) => t.id.startsWith("url.") || t.id === "url");
    expect(urlLines.every((t) => t.font === "mono")).toBe(true);
    expect(textOf(card.back, "reward")).toBe("Reward · Belohnung · Recompensa");
    expect(card.meta.warnings).toEqual([]);
  });

  it("hides the reward line by default and the name when not provided", () => {
    const card = buildCard({ ...BASE, ownerName: null });
    expect(textOf(card.back, "reward")).toBe("");
    expect(textOf(card.front, "name")).toBe("");
  });

  it("shrinks, then truncates with an ellipsis and reports it", () => {
    const card = buildCard({ ...BASE, ...LONG });
    const name = texts(card.front).find((t) => t.id === "name");
    expect(name?.text.endsWith("…")).toBe(true);
    expect(name?.sizeMm).toBe(2.5);
    expect(card.meta.warnings).toEqual(expect.arrayContaining(["name_truncated", "message_truncated"]));
    // A long email wraps after the "@" before it is ever truncated.
    const email = buildCard({ ...BASE, printedEmail: "senora.iniguez.long.address@correo-ejemplo.es" });
    const lines = texts(email.back).filter((t) => t.id.startsWith("email."));
    expect(lines.map((t) => t.text)).toEqual(["senora.iniguez.long.address@", "correo-ejemplo.es"]);
  });

  it("warns when there is no printed fallback email", () => {
    expect(buildCard({ ...BASE, printedEmail: null }).meta.warnings).toContain("no_printed_email");
  });

  it("uses the card language, a different second language and the custom message", () => {
    const de = buildCard({ ...BASE, language: "de", cardMessage: "Finderlohn garantiert." });
    expect(
      texts(de.front)
        .filter((t) => t.id.startsWith("headline"))
        .map((t) => t.text)
        .join(" "),
    ).toBe("Gefunden? Bitte scannen oder antippen");
    expect(textOf(de.front, "message")).toBe("Finderlohn garantiert.");
    expect(textOf(de.front, "secondary").replace(/\s/g, "")).toBe("Iffound,pleasescanortap");
    const es = buildCard({ ...BASE, language: "es", secondaryLanguage: null });
    expect(textOf(es.front, "secondary")).toBe("");
  });

  it("maps settings to card input (name toggle, localized message with English fallback)", () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      identity: { ...DEFAULT_SETTINGS.identity, publicName: "Lucía" },
      tags: {
        ...DEFAULT_SETTINGS.tags,
        cardTheme: "sage",
        cardLanguage: "es",
        showNameOnCard: false,
        printedEmail: "found@example.com",
        cardMessage: { en: "Thanks!", de: "", es: "" },
      },
    };
    const tag = { label: "RT-007", url: URL_LIVE } as Tag;
    const input = cardInputFromSettings(tag, settings);
    expect(input).toMatchObject({
      theme: "sage",
      language: "es",
      ownerName: null,
      printedEmail: "found@example.com",
      cardMessage: "Thanks!",
      showReward: false,
    });
    expect(cardInputFromSettings(tag, settings, { theme: "warm", language: "de" }).theme).toBe("warm");
  });
});

describe("hole alignment", () => {
  const cases: Array<[string, CardInput["template"]]> = [
    ["default", undefined],
    ["off-centre", { hole: { yMm: 10 } }],
    ["right edge, low", { hole: { edge: "right", yMm: 40, fromEdgeMm: 7 } }],
    ["short-axis flip", { flip: "short-axis", hole: { yMm: 12 } }],
  ];

  it.each(cases)("the back hole is where the front hole lands after the flip (%s)", (_, template) => {
    const card = buildCard({ ...BASE, template });
    const t = { ...DEFAULT_TEMPLATE, ...template, hole: { ...DEFAULT_TEMPLATE.hole, ...template?.hole } };
    const [front] = card.front.holes;
    const [back] = card.back.holes;
    if (!front || !back) throw new Error("missing holes");
    const expectedFrontX = t.hole.edge === "left" ? t.hole.fromEdgeMm : t.widthMm - t.hole.fromEdgeMm;
    expect(front.cx).toBeCloseTo(expectedFrontX, 6);
    expect(front.cy).toBeCloseTo(t.hole.yMm, 6);
    expect(front.r).toBeCloseTo(t.hole.diameterMm / 2, 6);
    // Rotating the card 180° about the long (horizontal) axis maps (x, y) → (x, H − y);
    // about the short (vertical) axis it maps (x, y) → (W − x, y).
    const expected =
      t.flip === "long-axis"
        ? { cx: front.cx, cy: t.heightMm - front.cy }
        : { cx: t.widthMm - front.cx, cy: front.cy };
    expect(back.cx).toBeCloseTo(expected.cx, 6);
    expect(back.cy).toBeCloseTo(expected.cy, 6);
    expect(back.r).toBeCloseTo(front.r, 6);
    // Flipping again is the identity: the punched hole is one physical hole.
    const again =
      t.flip === "long-axis"
        ? { cx: back.cx, cy: t.heightMm - back.cy }
        : { cx: t.widthMm - back.cx, cy: back.cy };
    expect(again.cx).toBeCloseTo(front.cx, 6);
    expect(again.cy).toBeCloseTo(front.cy, 6);
  });

  it("keeps the default centred hole on the same edge after a long-axis flip", () => {
    const card = buildCard(BASE);
    expect(card.back.holes).toEqual(card.front.holes);
    expect(card.front.holes[0]).toEqual({ cx: 6, cy: 27, r: 2.5 });
  });
});

describe("card SVG", () => {
  const hostile = `<script>&"'`;
  const all = (card: Card, opts = {}) => [renderSvg(card.front, opts), renderSvg(card.back, opts)];

  function assertWellFormed(svg: string) {
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg.match(/<svg[\s>]/g)).toHaveLength(1);
    const stack: string[] = [];
    for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)) {
      const [, closing, name, selfClosing] = m;
      if (selfClosing) continue;
      if (closing) expect(stack.pop()).toBe(name);
      else stack.push(name ?? "");
    }
    expect(stack).toEqual([]);
    // Every ampersand starts an entity; no stray "<" outside tags.
    expect(svg.replace(/&(amp|lt|gt|quot|apos);/g, "")).not.toContain("&");
    expect(svg.replace(/<[^>]*>/g, "")).not.toContain("<");
  }

  it("is a single, well-formed, script-free document with no external references", () => {
    for (const theme of CARD_THEMES) {
      const card = buildCard({ ...BASE, theme, showReward: true });
      for (const svg of all(card, { marks: true, watermark: PROOF_WATERMARK })) {
        assertWellFormed(svg);
        expect(svg.toLowerCase()).not.toContain("<script");
        expect(svg).not.toMatch(/href|url\(|<image|<foreignObject|\son[a-z]+=/i);
        expect(svg).toContain('viewBox="-2 -2 89.6 58"');
        expect(svg).toContain('width="89.6mm" height="58mm"');
      }
    }
  });

  it("escapes user text", () => {
    const card = buildCard({
      ...BASE,
      label: hostile,
      ownerName: hostile,
      cardMessage: hostile,
      printedEmail: `x${hostile}@example.com`,
    });
    for (const svg of all(card)) {
      assertWellFormed(svg);
      expect(svg).not.toContain("<script");
      expect(svg).toContain("&lt;script&gt;&amp;&quot;&apos;");
    }
  });

  it("preserves umlauts, ß and ñ", () => {
    const svg = renderSvg(buildCard({ ...BASE, ownerName: "Señora Müller-Weiß" }).front);
    expect(svg).toContain("Señora Müller-Weiß");
    const de = renderSvg(buildCard({ ...BASE, language: "de" }).back);
    expect(de).toContain("Gefunden? Bitte E-Mail an");
    expect(de).toContain("öffnen");
  });

  it("adds the proof watermark and marks only when requested", () => {
    const card = buildCard(BASE);
    const plain = renderSvg(card.front);
    expect(plain).not.toContain("PROOF");
    expect(plain).not.toContain("proof-marks");
    const proof = renderSvg(card.front, { watermark: PROOF_WATERMARK });
    expect(proof).toContain('id="proof-watermark"');
    expect(proof).toContain("PROOF — NOT FOR PRINT");
    const marks = renderSvg(card.back, { marks: true });
    expect(marks).toContain('id="proof-marks"');
    expect(marks).toMatch(/<circle cx="6" cy="27" r="2.5"/);
  });
});

describe("proof detection and display URL", () => {
  it.each([
    [`https://return.example.com/t/${TOKEN}`, false],
    [`https://rtn.li/t/${TOKEN}`, false],
    [`http://return.example.com/t/${TOKEN}`, true],
    [`https://localhost:8787/t/${TOKEN}`, true],
    [`http://127.0.0.1:5173/t/${TOKEN}`, true],
    [`https://return.test/t/${TOKEN}`, true],
    [`https://app.return.test/t/${TOKEN}`, true],
    [`https://[::1]/t/${TOKEN}`, true],
    ["not a url", true],
  ])("isProofUrl(%s) = %s", (url, proof) => {
    expect(isProofUrl(url)).toBe(proof);
  });

  it("marks the card meta as proof", () => {
    expect(buildCard({ ...BASE, url: `http://localhost:8787/t/${TOKEN}` }).meta.proof).toBe(true);
    expect(buildCard(BASE).meta.proof).toBe(false);
  });

  it("prints host and path without the scheme", () => {
    expect(displayUrl(`https://return.example.com/t/${TOKEN}`)).toBe(`return.example.com/t/${TOKEN}`);
    expect(displayUrl(`http://localhost:8787/t/${TOKEN}`)).toBe(`localhost:8787/t/${TOKEN}`);
  });
});

describe("text fitting", () => {
  const spec = {
    font: "sans",
    weight: "bold",
    maxSizeMm: 3,
    minSizeMm: 2,
    maxWidthMm: 30,
    maxLines: 1,
  } as const;

  it("keeps the maximum size when the text fits", () => {
    expect(fitText({ ...spec, text: "RT-001" })).toMatchObject({
      sizeMm: 3,
      lines: ["RT-001"],
      truncated: false,
    });
  });

  it("shrinks before truncating", () => {
    const text = "Lucía Müller-Fernández";
    const fit = fitText({ ...spec, text });
    expect(fit.sizeMm).toBeLessThan(3);
    expect(fit.sizeMm).toBeGreaterThanOrEqual(2);
    expect(fit.lines).toEqual([text]);
    expect(measureText(text, { font: "sans", weight: "bold", sizeMm: fit.sizeMm })).toBeLessThanOrEqual(30);
  });

  it("truncates with an ellipsis at the minimum size and never exceeds the width", () => {
    const fit = fitText({ ...spec, text: "W".repeat(60), maxLines: 2 });
    expect(fit.truncated).toBe(true);
    expect(fit.sizeMm).toBe(2);
    expect(fit.lines).toHaveLength(2);
    expect(fit.lines[1]?.endsWith("…")).toBe(true);
    for (const line of fit.lines) {
      expect(measureText(line, { font: "sans", weight: "bold", sizeMm: 2 })).toBeLessThanOrEqual(30);
    }
  });

  it("measures wide capitals wider than narrow lowercase", () => {
    const at = { font: "sans", weight: "regular", sizeMm: 3 } as const;
    expect(measureText("WWWW", at)).toBeGreaterThan(measureText("iiii", at) * 3);
    expect(measureText("Müller", at)).toBeCloseTo(measureText("Muller", at), 6);
    expect(measureText("abc", { ...at, font: "mono" })).toBeCloseTo(3 * 0.6 * 3 * 1.03, 6);
  });
});
