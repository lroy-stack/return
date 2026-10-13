import { type ReactNode, useState } from "react";
import { cx } from "../../ui/cx";
import { Checkbox, SegmentedControl } from "../../ui/Field";
import { PageHeader } from "../../ui/Page";
import { Foundations } from "./Foundations";
import { SelectionSpecimens } from "./SelectionSpecimens";
import {
  ActionsSpecimens,
  ContentSpecimens,
  FeedbackSpecimens,
  FieldSpecimens,
  NavigationSpecimens,
  StatusSpecimens,
} from "./Specimens";

type Scope = "page" | "light" | "dark" | "both";

const SECTIONS = [
  ["color", "Colour"],
  ["type", "Type"],
  ["shape", "Shape"],
  ["material", "Glass"],
  ["buttons", "Buttons"],
  ["fields", "Fields"],
  ["selection", "Selection"],
  ["status", "Status"],
  ["cards", "Lists"],
  ["data", "Places"],
  ["navigation", "Navigation"],
  ["overlays", "Overlays"],
  ["quick-card", "Quick card"],
  ["states", "States"],
] as const;

function Themed({
  theme,
  reduce,
  children,
}: {
  theme?: "light" | "dark";
  reduce: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-theme={theme}
      data-transparency={reduce ? "reduce" : undefined}
      className={cx(
        "flex min-w-0 flex-col gap-12",
        theme && "rounded-sheet bg-surface p-4 text-fg ring-1 ring-line sm:p-6",
      )}
    >
      {children}
    </div>
  );
}

function All() {
  return (
    <>
      <Foundations />
      <ActionsSpecimens />
      <FieldSpecimens />
      <SelectionSpecimens />
      <StatusSpecimens />
      <ContentSpecimens />
      <NavigationSpecimens />
      <FeedbackSpecimens />
    </>
  );
}

/**
 * Living component gallery (/gallery, linked from Settings › System). Renders every UI component with its
 * variants and states, in the page theme, forced light/dark, or both side by side. Strings are English on
 * purpose: this is a design/QA tool, not part of the owner's workflow.
 */
export function GalleryPage() {
  const [scope, setScope] = useState<Scope>("page");
  const [reduce, setReduce] = useState(false);
  return (
    <>
      <PageHeader
        title="Component gallery"
        eyebrow="Design system v2"
        subtitle="Every component, variant and state. Tokens and rules: docs/design/system.md."
        back={{ to: "/settings/system", label: "System" }}
      />
      <div className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SegmentedControl
            label="Preview theme"
            value={scope}
            onChange={setScope}
            options={[
              { value: "page", label: "Page" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
              { value: "both", label: "Both" },
            ]}
          />
          <Checkbox label="Reduce transparency" checked={reduce} onChange={setReduce} />
        </div>
        <nav aria-label="Gallery sections" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-fill px-3.5 text-subhead font-semibold hover:bg-fill-hover pointer-coarse:min-h-11"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      {scope === "both" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Themed theme="light" reduce={reduce}>
            <All />
          </Themed>
          <Themed theme="dark" reduce={reduce}>
            <All />
          </Themed>
        </div>
      ) : (
        <Themed theme={scope === "page" ? undefined : scope} reduce={reduce}>
          <All />
        </Themed>
      )}
    </>
  );
}
