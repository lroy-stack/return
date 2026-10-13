import { useId, useMemo, useState } from "react";
import { BRAND } from "../../../shared/brand";
import {
  buildCard,
  CARD_PALETTES,
  CardLayoutError,
  type Card as CardModel,
  type CardSide,
  type CardTheme,
  cardInputFromSettings,
  isProofUrl,
  PROOF_WATERMARK,
  renderSvg,
  urlByteLength,
} from "../../../shared/card";
import type { Tag } from "../../../shared/schemas";
import { CARD_THEMES, LANGUAGES, type Language, type Settings } from "../../../shared/settings";
import { copyText } from "../../lib/clipboard";
import { useI18n, useT } from "../../lib/i18n";
import { Badge } from "../../ui/Badge";
import { Button, IconButton } from "../../ui/Button";
import { Card, SectionHeading } from "../../ui/Card";
import { Select, Toggle } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/Page";
import { useToast } from "../../ui/Toast";
import { downloadBlob, fileStem, svgDataUrl, svgToPng } from "./export";
import { type PrintKey, type PrintT, printTranslator } from "./strings";

const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch", es: "Español" };
/** NTAG213 has 144 bytes of user memory; leave room for NDEF/TLV overhead and future query strings. */
const NFC_WARN_BYTES = 120;

type Busy = null | "pdf" | `${"svg" | "png"}-${"front" | "back"}`;

type Built = { ok: true; card: CardModel } | { ok: false; message: string };

function tryBuild(
  tag: Tag,
  settings: Settings,
  overrides: Parameters<typeof cardInputFromSettings>[2],
): Built {
  try {
    return { ok: true, card: buildCard(cardInputFromSettings(tag, settings, overrides)) };
  } catch (error) {
    if (error instanceof CardLayoutError) return { ok: false, message: error.message };
    throw error;
  }
}

export function PrintStudio({ tags, settings }: { tags: Tag[]; settings: Settings }) {
  const { lang } = useI18n();
  const t = useT();
  const p = useMemo(() => printTranslator(lang), [lang]);
  const toast = useToast();

  const active = useMemo(() => tags.filter((tag) => tag.status === "active"), [tags]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(active.map((tag) => tag.id)));
  const [previewId, setPreviewId] = useState<string | null>(() => active[0]?.id ?? null);
  const [theme, setTheme] = useState<CardTheme>(settings.tags.cardTheme);
  const [language, setLanguage] = useState<Language>(settings.tags.cardLanguage);
  const [showReward, setShowReward] = useState(false);
  const [marks, setMarks] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);

  const overrides = useMemo(() => ({ theme, language, showReward }), [theme, language, showReward]);
  const selectedTags = useMemo(() => active.filter((tag) => selected.has(tag.id)), [active, selected]);
  const previewTag = active.find((tag) => tag.id === previewId) ?? null;
  const built = useMemo(
    () => (previewTag ? tryBuild(previewTag, settings, overrides) : null),
    [previewTag, settings, overrides],
  );

  // Any non-live URL among what is shown or exported turns every export into a stamped proof.
  const proofHosts = useMemo(() => {
    const shown = previewTag ? [...selectedTags, previewTag] : selectedTags;
    return [...new Set(shown.filter((tag) => isProofUrl(tag.url)).map((tag) => hostOf(tag.url)))];
  }, [selectedTags, previewTag]);
  const watermark = proofHosts.length > 0 ? PROOF_WATERMARK : undefined;

  const svgs = useMemo(() => {
    if (!built?.ok) return null;
    return {
      front: renderSvg(built.card.front, { marks, watermark }),
      back: renderSvg(built.card.back, { marks, watermark }),
    };
  }, [built, marks, watermark]);

  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>) {
    setBusy(kind);
    try {
      await task();
    } catch (error) {
      toast(p("exportFailed", { message: error instanceof Error ? error.message : String(error) }), "error");
    } finally {
      setBusy(null);
    }
  }

  function downloadSide(format: "svg" | "png", face: "front" | "back") {
    if (!built?.ok || !svgs) return;
    const side: CardSide = built.card[face];
    const name = `return-card-${fileStem(built.card.meta.label)}-${face}${watermark ? "-proof" : ""}`;
    void run(`${format}-${face}`, async () => {
      if (format === "svg") {
        downloadBlob(new Blob([svgs[face]], { type: "image/svg+xml" }), `${name}.svg`);
      } else {
        // PNGs always come from the SVG with the current marks setting, so they match the preview.
        downloadBlob(await svgToPng(svgs[face], side), `${name}.png`);
      }
    });
  }

  function downloadPdf() {
    void run("pdf", async () => {
      const cards: CardModel[] = [];
      for (const tag of selectedTags) {
        const result = tryBuild(tag, settings, overrides);
        if (!result.ok) throw new Error(`${tag.label}: ${result.message}`);
        cards.push(result.card);
      }
      const { renderPdf } = await import("../../../shared/card/pdf");
      const bytes = await renderPdf(cards, { watermark });
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
        `return-cards-${date}${watermark ? "-proof" : ""}.pdf`,
      );
    });
  }

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title={t("print.title")}
        subtitle={p("subtitle")}
        back={{ to: "/tags", label: t("nav.tags") }}
        actions={
          <Button
            variant="primary"
            icon="download"
            onClick={downloadPdf}
            loading={busy === "pdf"}
            disabled={selectedTags.length === 0 || busy !== null}
            aria-describedby="print-pdf-summary"
          >
            {p("pdf")}
          </Button>
        }
      />
      <p id="print-pdf-summary" className="-mt-3 mb-5 text-sm text-muted tabular-nums">
        {selectedTags.length === 0
          ? p("pdfNone")
          : p("pdfCount", { n: selectedTags.length, pages: selectedTags.length * 2 })}
      </p>

      {proofHosts.length > 0 ? <ProofBanner hosts={proofHosts} p={p} /> : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-6">
          <PreviewPanel p={p} built={built} svgs={svgs} marks={marks} busy={busy} onDownload={downloadSide} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <TagPicker
            p={p}
            tags={tags}
            selected={selected}
            previewId={previewId}
            onToggle={toggle}
            onSelectAll={() => setSelected(new Set(active.map((tag) => tag.id)))}
            onSelectNone={() => setSelected(new Set())}
            onPreview={setPreviewId}
          />
          <Card aria-labelledby="print-appearance">
            <SectionHeading id="print-appearance" title={p("appearance")} description={p("settingsHint")} />
            <div className="flex flex-col gap-4">
              <ThemePicker p={p} t={t} value={theme} onChange={setTheme} />
              <Select
                label={p("language")}
                hint={p("languageHint")}
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                {LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_NAMES[code]}
                  </option>
                ))}
              </Select>
              <Toggle
                label={p("reward")}
                description={p("rewardHint")}
                checked={showReward}
                onChange={setShowReward}
              />
              <Toggle label={p("marks")} description={p("marksHint")} checked={marks} onChange={setMarks} />
            </div>
          </Card>
          <Card aria-labelledby="print-pdf">
            <SectionHeading id="print-pdf" title={p("pdfAbout")} />
            <p className="text-sm text-muted">{p("pdfHint")}</p>
          </Card>
        </div>
      </div>

      <NfcPanel
        p={p}
        tags={selectedTags}
        onCopied={(ok) => toast(ok ? p("copied") : p("copyFailed"), ok ? "success" : "error")}
      />
    </>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function ProofBanner({ hosts, p }: { hosts: string[]; p: PrintT }) {
  return (
    <section
      aria-labelledby="print-proof-title"
      className="mb-5 flex items-start gap-3 rounded-card border-2 border-lost bg-lost-tint p-4 text-fg sm:p-5"
    >
      <Icon name="alert" className="mt-0.5 size-6 shrink-0 text-lost" />
      <div className="min-w-0">
        <h2 id="print-proof-title" className="text-lg font-bold text-lost">
          {p("proofTitle")}
        </h2>
        <p className="mt-1">{p("proofBody", { hosts: hosts.join(", ") })}</p>
      </div>
    </section>
  );
}

function PreviewPanel({
  p,
  built,
  svgs,
  marks,
  busy,
  onDownload,
}: {
  p: PrintT;
  built: Built | null;
  svgs: { front: string; back: string } | null;
  marks: boolean;
  busy: Busy;
  onDownload: (format: "svg" | "png", face: "front" | "back") => void;
}) {
  if (!built) return null;
  if (!built.ok || !svgs) {
    return (
      <Card>
        <p role="alert" className="font-medium text-danger">
          {p("layoutError", { message: built.ok ? "" : built.message })}
        </p>
      </Card>
    );
  }
  const { card } = built;
  const label = card.meta.label;
  const q = card.meta.qr;
  return (
    <Card aria-labelledby="print-preview">
      <SectionHeading
        id="print-preview"
        title={`${p("previewTitle")} · ${label}`}
        description={
          <span className="tabular-nums">
            {p("qrMeta", { size: fmt(q.sizeMm, 1), module: fmt(q.moduleMm, 2), version: q.version })}
          </span>
        }
      />
      <div className="grid gap-4 rounded-xl bg-sunken p-3 sm:p-6">
        <CardFace caption={p("front")} alt={p("frontAlt", { label })} svg={svgs.front} marks={marks} />
        <CardFace caption={p("back")} alt={p("backAlt", { label })} svg={svgs.back} marks={marks} />
      </div>

      {card.meta.warnings.length > 0 ? (
        <div className="mt-4 rounded-xl border border-lost/40 bg-lost-tint p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-lost">
            <Icon name="alert" className="size-4" />
            {p("warnings")}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-6">
            {card.meta.warnings.map((w) => (
              <li key={w}>{p(`warning.${w}` as PrintKey)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <h3 className="text-sm font-semibold">{p("thisCard")}</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["svg", "png"] as const).flatMap((format) =>
            (["front", "back"] as const).map((face) => {
              const key = `${format}${face === "front" ? "Front" : "Back"}` as PrintKey;
              return (
                <Button
                  key={key}
                  size="sm"
                  icon="download"
                  onClick={() => onDownload(format, face)}
                  loading={busy === `${format}-${face}`}
                  disabled={busy !== null}
                >
                  {p(key)}
                </Button>
              );
            }),
          )}
        </div>
        <p className="mt-2 text-sm text-muted">{p("pngHint")}</p>
      </div>
    </Card>
  );
}

/**
 * Without marks the face is cropped to the trim line with the card's 3.18 mm corners, i.e. what the
 * finished card looks like. With marks the full bleed area is shown so trim/safe/hole lines are visible.
 */
function CardFace({
  caption,
  alt,
  svg,
  marks,
}: {
  caption: string;
  alt: string;
  svg: string;
  marks: boolean;
}) {
  return (
    <figure className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-2">
      {marks ? (
        <img
          src={svgDataUrl(svg)}
          alt={alt}
          className="block aspect-[89.6/58] w-full shadow-card"
          draggable={false}
        />
      ) : (
        <div className="relative aspect-[85.6/54] w-full overflow-hidden rounded-[3.715%/5.889%] shadow-float">
          <img
            src={svgDataUrl(svg)}
            alt={alt}
            className="absolute top-[-3.704%] left-[-2.336%] block w-[104.673%] max-w-none"
            draggable={false}
          />
        </div>
      )}
      <figcaption className="text-sm font-medium text-muted">{caption}</figcaption>
    </figure>
  );
}

function fmt(value: number, digits: number): string {
  return value.toFixed(digits);
}

function TagPicker({
  p,
  tags,
  selected,
  previewId,
  onToggle,
  onSelectAll,
  onSelectNone,
  onPreview,
}: {
  p: PrintT;
  tags: Tag[];
  selected: ReadonlySet<string>;
  previewId: string | null;
  onToggle: (id: string, on: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onPreview: (id: string) => void;
}) {
  const baseId = useId();
  return (
    <Card aria-labelledby={`${baseId}-title`}>
      <SectionHeading
        id={`${baseId}-title`}
        title={p("cards")}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={onSelectAll}>
              {p("selectAll")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onSelectNone}>
              {p("selectNone")}
            </Button>
          </>
        }
      />
      <ul className="-mx-1 flex max-h-[26rem] flex-col overflow-y-auto">
        {tags.map((tag) => {
          const revoked = tag.status !== "active";
          const id = `${baseId}-${tag.id}`;
          const shown = previewId === tag.id;
          return (
            <li
              key={tag.id}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-1 ${shown ? "bg-primary-tint/60" : ""}`}
            >
              <input
                id={id}
                type="checkbox"
                className="size-5 shrink-0 accent-primary"
                checked={!revoked && selected.has(tag.id)}
                disabled={revoked}
                onChange={(e) => onToggle(tag.id, e.target.checked)}
              />
              <label htmlFor={id} className={`min-w-0 flex-1 py-2 ${revoked ? "opacity-60" : ""}`}>
                <span className="block font-mono text-[0.95rem] font-semibold tracking-wide">
                  {tag.label}
                </span>
                <span className="block truncate text-sm text-muted">{tag.itemName ?? p("unassigned")}</span>
              </label>
              {revoked ? (
                <Badge>{p("revoked")}</Badge>
              ) : (
                <Button
                  size="sm"
                  variant={shown ? "secondary" : "ghost"}
                  aria-pressed={shown}
                  aria-label={`${p("preview")} ${tag.label}`}
                  onClick={() => onPreview(tag.id)}
                >
                  {p("preview")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function ThemePicker({
  p,
  t,
  value,
  onChange,
}: {
  p: PrintT;
  t: ReturnType<typeof useT>;
  value: CardTheme;
  onChange: (theme: CardTheme) => void;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{p("theme")}</legend>
      <div className="grid grid-cols-3 gap-2">
        {CARD_THEMES.map((theme) => {
          const palette = CARD_PALETTES[theme];
          return (
            <label key={theme} className="group relative block cursor-pointer">
              <input
                type="radio"
                name={name}
                value={theme}
                checked={value === theme}
                onChange={() => onChange(theme)}
                className="peer sr-only"
              />
              <span className="flex flex-col gap-1.5 rounded-xl border border-line-strong bg-raised p-2 transition-colors duration-150 group-hover:bg-sunken peer-checked:border-2 peer-checked:border-primary peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                <ThemeSwatch
                  front={palette.front.background}
                  stub={palette.front.stub}
                  panel={palette.qrLight}
                />
                <span className="flex items-center justify-between gap-1 text-sm font-medium">
                  {t(`theme.card.${theme}`)}
                  {value === theme ? <Icon name="check" className="size-4 text-primary-text" /> : null}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Miniature front: stub band, background and the light QR panel. Decorative (the label names it). */
function ThemeSwatch({ front, stub, panel }: { front: string; stub: string; panel: string }) {
  return (
    <svg viewBox="0 0 85.6 54" className="block aspect-[85.6/54] w-full rounded-md" aria-hidden="true">
      <rect width="85.6" height="54" fill={front} />
      <rect width="12" height="54" fill={stub} />
      <rect
        x="50.6"
        y="11"
        width="32"
        height="32"
        rx="2.4"
        fill={panel}
        stroke={BRAND.line}
        strokeWidth="0.6"
      />
      <rect x="15" y="11" width="14" height="3" rx="1" fill={stub} opacity="0.85" />
      <rect x="15" y="17" width="22" height="4" rx="1" fill={stub} opacity="0.85" />
    </svg>
  );
}

function NfcPanel({ p, tags, onCopied }: { p: PrintT; tags: Tag[]; onCopied: (ok: boolean) => void }) {
  return (
    <Card aria-labelledby="print-nfc" className="mt-5">
      <SectionHeading id="print-nfc" title={p("nfcTitle")} description={p("nfcIntro")} />
      <ol className="list-decimal space-y-1 pl-5 text-[0.95rem]">
        <li>{p("nfcStep1")}</li>
        <li>{p("nfcStep2")}</li>
        <li>{p("nfcStep3")}</li>
      </ol>
      <p className="mt-3 flex items-start gap-2 rounded-xl border border-line-strong bg-sunken p-3 text-sm font-medium">
        <Icon name="lock" className="mt-0.5 size-4 shrink-0" />
        <span>
          {p("nfcNever")} {p("nfcCapacity")}
        </span>
      </p>
      {tags.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{p("nfcEmpty")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {tags.map((tag) => {
            const bytes = urlByteLength(tag.url);
            const tooLong = bytes > NFC_WARN_BYTES;
            return (
              <li key={tag.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 sm:flex-nowrap">
                <span className="w-24 shrink-0 font-mono text-sm font-semibold">{tag.label}</span>
                <span
                  className="min-w-0 flex-1 basis-full font-mono text-sm break-all sm:basis-auto"
                  title={tag.url}
                >
                  {tag.url}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {tooLong ? (
                    <Badge tone="lost" icon="alert">
                      {p("nfcBytes", { n: bytes })}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted tabular-nums">{p("nfcBytes", { n: bytes })}</span>
                  )}
                  <IconButton
                    icon="copy"
                    label={p("copy", { label: tag.label })}
                    onClick={async () => onCopied(await copyText(tag.url))}
                  />
                </span>
                {tooLong ? <p className="basis-full text-sm text-lost">{p("nfcTooLong")}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
