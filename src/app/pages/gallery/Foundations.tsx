import { cx } from "../../ui/cx";
import { Row, Specimen, samplePhoto } from "./parts";

const SWATCHES: ReadonlyArray<{ token: string; cls: string; text?: string; note: string; noText?: boolean }> =
  [
    { token: "surface", cls: "bg-surface", note: "App canvas" },
    { token: "raised", cls: "bg-raised", note: "Cards, lists, fields" },
    { token: "sunken", cls: "bg-sunken", note: "Wells, skeletons" },
    { token: "fill", cls: "bg-fill", note: "Secondary controls" },
    { token: "fg", cls: "bg-fg", text: "text-surface", note: "Text 15:1" },
    { token: "muted", cls: "bg-muted", text: "text-surface", note: "Secondary text ≥5:1" },
    { token: "line-strong", cls: "bg-line-strong", note: "Control edges ≥3:1 (not for text)", noText: true },
    { token: "primary", cls: "bg-primary", text: "text-primary-fg", note: "Petrol · actions" },
    { token: "primary-tint", cls: "bg-primary-tint", text: "text-primary-text", note: "Selected, info" },
    { token: "accent-tint", cls: "bg-accent-tint", text: "text-accent-text", note: "Sage · success" },
    { token: "lost", cls: "bg-lost", text: "text-lost-fg", note: "Terracotta · lost only" },
    { token: "lost-tint", cls: "bg-lost-tint", text: "text-lost", note: "Lost banners" },
    { token: "warning-tint", cls: "bg-warning-tint", text: "text-warning", note: "Needs setup" },
    { token: "danger", cls: "bg-danger", text: "text-danger-fg", note: "Destructive" },
    { token: "danger-tint", cls: "bg-danger-tint", text: "text-danger", note: "Errors" },
  ];

const TYPE: ReadonlyArray<{ cls: string; name: string; spec: string }> = [
  {
    cls: "text-large-title font-bold tracking-[-0.02em]",
    name: "Large title",
    spec: "30–34 / 1.15 bold · page h1",
  },
  { cls: "text-title1 font-bold", name: "Title 1", spec: "28 / 34 bold" },
  { cls: "text-title2 font-bold", name: "Title 2", spec: "22 / 28 bold · gallery sections" },
  { cls: "text-title3 font-semibold", name: "Title 3", spec: "20 / 26 semibold · card & sheet titles" },
  { cls: "text-headline font-semibold", name: "Headline", spec: "17 / 24 semibold · list sections" },
  { cls: "text-body", name: "Body", spec: "16 / 24 regular" },
  { cls: "text-subhead", name: "Subhead", spec: "15 / 22 · secondary lines, controls" },
  { cls: "text-footnote", name: "Footnote", spec: "13 / 18 · hints, meta" },
  { cls: "text-caption", name: "Caption", spec: "12 / 16 · badges, coordinates" },
];

export function Foundations() {
  return (
    <>
      <Specimen
        id="color"
        title="Colour"
        usage="Semantic tokens only (bg-raised, text-muted…). Neutrals carry the UI; petrol for actions and selection; sage for success; terracotta only for lost. Pairs below are the verified ones (contrast table in docs/design/system.md)."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SWATCHES.map((s) => (
            <div key={s.token} className="overflow-hidden rounded-control ring-1 ring-line">
              <div
                className={cx(
                  "flex h-16 items-end p-2 text-caption font-semibold",
                  s.cls,
                  s.text ?? "text-fg",
                )}
              >
                {s.noText ? null : "Aa"}
              </div>
              <div className="bg-raised px-2.5 py-2">
                <p className="font-mono text-caption">{s.token}</p>
                <p className="text-caption text-muted">{s.note}</p>
              </div>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen
        id="type"
        title="Typography"
        usage="System stack (SF Pro on Apple devices, Segoe UI / Roboto elsewhere), no web fonts. iOS text styles with a 16 px web body. Tabular numbers for data."
      >
        <div className="flex flex-col divide-y divide-line rounded-card bg-raised px-4 ring-1 ring-line/70">
          {TYPE.map((ty) => (
            <div key={ty.name} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
              <span className={ty.cls}>{ty.name}</span>
              <span className="font-mono text-caption text-muted">{ty.spec}</span>
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen
        id="shape"
        title="Shape, space, elevation"
        usage="4 px grid. Radii: control 14, card 20, sheet/chrome 28, pills full. Content sits on shadow-card; floating content on shadow-float; overlays on shadow-overlay."
      >
        <Row label="radius: control · card · sheet · full">
          <div className="size-16 rounded-control bg-primary-tint" />
          <div className="size-16 rounded-card bg-primary-tint" />
          <div className="size-16 rounded-sheet bg-primary-tint" />
          <div className="h-16 w-28 rounded-full bg-primary-tint" />
        </Row>
        <Row label="elevation: card · float · overlay · glass">
          <div className="size-20 rounded-card bg-raised shadow-card" />
          <div className="size-20 rounded-card bg-raised shadow-float" />
          <div className="size-20 rounded-card bg-raised shadow-overlay" />
          <div className="glass size-20 rounded-card" />
        </Row>
        <Row label="spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64">
          {[1, 2, 3, 4, 6, 8, 12, 16].map((n) => (
            <div key={n} className="flex flex-col items-center gap-1">
              <div className="w-4 bg-primary" style={{ height: `${n * 4}px` }} />
              <span className="font-mono text-caption text-muted">{n * 4}</span>
            </div>
          ))}
        </Row>
      </Specimen>

      <Specimen
        id="material"
        title="Liquid Glass material"
        usage="Chrome only (tab bar, rail, sidebar, compact header, toasts, floating toolbars, sheets). Never on content. Over photos the regular glass keeps text ≥4.5:1; reduced transparency, increased contrast and browsers without backdrop-filter get the solid fallback."
      >
        <div className="relative overflow-hidden rounded-card">
          <img src={samplePhoto(200)} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="relative grid gap-4 p-5 sm:grid-cols-3">
            <div className="glass rounded-sheet p-4">
              <p className="text-headline font-semibold">glass</p>
              <p className="text-subhead text-on-glass-muted">Regular · 84% · blur 22 · sat 180%</p>
            </div>
            <div className="glass-strong rounded-sheet p-4">
              <p className="text-headline font-semibold">glass-strong</p>
              <p className="text-subhead text-on-glass-muted">Sidebar, sheets · 92%</p>
            </div>
            <div data-transparency="reduce" className="glass rounded-sheet p-4">
              <p className="text-headline font-semibold">Solid fallback</p>
              <p className="text-subhead text-on-glass-muted">Reduce transparency / no support</p>
            </div>
          </div>
        </div>
        <Row label="motion: fast 120 · base 200 · slow 320 · sheet 420 ms · ease-standard · ease-spring (press me)">
          <button
            type="button"
            className="pressable specular min-h-11 rounded-full bg-primary px-5 font-semibold text-primary-fg"
          >
            Spring press
          </button>
          <span className="text-footnote text-muted">
            All motion is disabled with prefers-reduced-motion.
          </span>
        </Row>
      </Specimen>
    </>
  );
}
