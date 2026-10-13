import { useMemo, useState } from "react";
import { buildPaperSheet, type CardInput, type PaperSize, renderPaperSvg } from "../../../shared/card";
import { CARD_PALETTES } from "../../../shared/card/themes";
import { CARD_THEMES, LANGUAGES, type Language } from "../../../shared/settings";
import { StatusPill } from "../../ui/Badge";
import { SegmentedControl } from "../../ui/Field";
import { Select } from "../../ui/Select";
import { svgDataUrl } from "../print/export";
import { Row } from "./parts";

type CardTheme = (typeof CARD_THEMES)[number];

const LANGUAGE_LABEL: Record<Language, string> = { en: "English", de: "Deutsch", es: "Español" };
const THEME_LABEL: Record<CardTheme, string> = { petrol: "Petrol", sage: "Sage", warm: "Warm" };

/**
 * The real paper output (src/shared/card: buildPaperSheet → renderPaperSvg), the same code the Quick card flow
 * prints, with sample data and no API calls. Replaces the old hand-drawn mock (engineering audit L8).
 */
export function PaperSpecimen() {
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [copies, setCopies] = useState<"1" | "2">("1");
  const [theme, setTheme] = useState<CardTheme>("petrol");
  const [language, setLanguage] = useState<Language>("en");
  const [live, setLive] = useState<"live" | "proof">("live");

  const page = useMemo(() => {
    const input: CardInput = {
      url:
        live === "live"
          ? "https://return.example.com/t/K7Q2M9X4P1R8T6W3Y5Z0A2B4C6"
          : "http://localhost:5173/t/K7Q2M9X4P1R8T6W3Y5Z0A2B4C6",
      label: "RT003",
      theme,
      language,
      ownerName: "Lucía",
      printedEmail: "lucia@example.org",
      cardMessage: null,
    };
    const [first] = buildPaperSheet(
      Array.from({ length: Number(copies) }, () => input),
      { paper, layout: "fold" },
    );
    return first ?? null;
  }, [paper, copies, theme, language, live]);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:items-start">
      <div className="flex flex-col gap-4">
        <Row label="paper · copies" wrap={false}>
          <SegmentedControl
            label="Paper"
            block
            value={paper}
            onChange={setPaper}
            options={[
              { value: "a4", label: "A4" },
              { value: "letter", label: "Letter" },
            ]}
          />
          <SegmentedControl
            label="Copies"
            block
            value={copies}
            onChange={setCopies}
            options={[
              { value: "1", label: "1 card" },
              { value: "2", label: "2 (spare)" },
            ]}
          />
        </Row>
        <Select<CardTheme>
          label="Colour"
          options={CARD_THEMES.map((c) => ({
            value: c,
            label: THEME_LABEL[c],
            leading: (
              <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
                <circle
                  cx="10"
                  cy="10"
                  r="9"
                  fill={CARD_PALETTES[c].front.background}
                  className="stroke-line-strong"
                />
              </svg>
            ),
          }))}
          value={theme}
          onChange={setTheme}
        />
        <Select<Language>
          label="Card language"
          options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))}
          value={language}
          onChange={setLanguage}
        />
        <SegmentedControl
          label="Address"
          block
          value={live}
          onChange={setLive}
          options={[
            { value: "live", label: "Live https" },
            { value: "proof", label: "Local (proof)" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          {page?.watermark ? (
            <StatusPill tone="warning">Proof watermark</StatusPill>
          ) : (
            <StatusPill tone="success">Print-ready</StatusPill>
          )}
          <StatusPill tone="info">{page ? `${page.widthMm} × ${page.heightMm} mm` : "—"}</StatusPill>
        </div>
      </div>
      {page ? (
        <img
          src={svgDataUrl(renderPaperSvg(page))}
          alt={`${paper === "a4" ? "A4" : "Letter"} page with ${copies} fold-over card${copies === "2" ? "s" : ""}, ${THEME_LABEL[theme]}, ${LANGUAGE_LABEL[language]}`}
          width={page.widthMm}
          height={page.heightMm}
          className="mx-auto h-auto w-full max-w-md rounded-lg bg-white shadow-float ring-1 ring-black/5"
        />
      ) : null}
    </div>
  );
}
