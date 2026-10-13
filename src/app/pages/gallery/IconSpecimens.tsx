import { ITEM_CATEGORIES, type ItemCategory } from "../../../shared/schemas";
import { cx } from "../../ui/cx";
import { EmptyArt, type EmptyArtName, Icon, type IconName, opticalStroke } from "../../ui/Icon";
import { ItemArt } from "../../ui/ItemArt";
import { ICON_FILLS, ICONS } from "../../ui/icons.generated";
import { Row, Specimen } from "./parts";

const NAMES = Object.keys(ICONS) as IconName[];
const FILLED = Object.keys(ICON_FILLS) as IconName[];
const SIZES = [
  ["size-4", 16],
  ["size-5", 20],
  ["size-6", 24],
  ["size-8", 32],
] as const;

const GROUPS: ReadonlyArray<{ label: string; names: IconName[] }> = [
  {
    label: "Navigation & chrome",
    names: [
      "inventory",
      "inbox",
      "tag",
      "settings",
      "plus",
      "sidebar",
      "back",
      "chevron",
      "chevron_down",
      "close",
      "more",
      "search",
    ],
  },
  {
    label: "Actions",
    names: [
      "edit",
      "trash",
      "copy",
      "share",
      "download",
      "external",
      "print",
      "send",
      "refresh",
      "link",
      "scissors",
      "eye",
      "camera",
      "photo",
      "qr",
      "card",
      "map",
      "pin",
      "location",
      "globe",
      "clock",
      "sun",
      "moon",
      "star",
      "user",
      "chat",
    ],
  },
  {
    label: "Belongings",
    names: [
      "suitcase",
      "backpack",
      "bag",
      "laptop",
      "tablet",
      "phone",
      "camera",
      "headphones",
      "wallet",
      "keys",
      "documents",
      "passport",
      "clothing",
      "umbrella",
      "bike",
      "box",
      "box_open",
    ],
  },
  {
    label: "States",
    names: [
      "lost",
      "found",
      "returning",
      "recovered",
      "closed",
      "blocked",
      "offline",
      "update",
      "bell",
      "shield",
      "lock",
      "alert",
      "info",
      "check",
    ],
  },
];

const EMPTY: ReadonlyArray<[EmptyArtName, string]> = [
  ["items", "No items yet"],
  ["conversations", "No conversations"],
  ["tags", "No tags"],
  ["offline", "You are offline"],
];

/** Body tints a future per-item colour could set (`--illo-body`); literal classes so Tailwind emits them. */
const TINTS: ReadonlyArray<[string, string]> = [
  ["Black", "[--illo-body:oklch(0.3_0.01_250)]"],
  ["Navy", "[--illo-body:oklch(0.36_0.08_262)]"],
  ["Red", "[--illo-body:oklch(0.52_0.17_27)]"],
  ["Olive", "[--illo-body:oklch(0.52_0.07_120)]"],
  ["Silver", "[--illo-body:oklch(0.8_0.01_240)]"],
];

const LABELS: Record<ItemCategory, string> = {
  backpack: "Backpack",
  suitcase: "Suitcase",
  bag: "Bag",
  laptop: "Laptop",
  tablet: "Tablet",
  phone: "Phone",
  camera: "Camera",
  headphones: "Headphones",
  wallet: "Wallet",
  keys: "Keys",
  documents: "Documents",
  clothing: "Clothing",
  other: "Other",
};

const studio = "bg-[radial-gradient(120%_120%_at_30%_15%,var(--raised),var(--sunken))]";

function IconCell({ name }: { name: IconName }) {
  return (
    <li className="flex flex-col gap-2 rounded-control bg-raised p-3 ring-1 ring-line">
      <span className="flex items-end gap-3 text-fg">
        {SIZES.map(([cls]) => (
          <Icon key={cls} name={name} className={cls} />
        ))}
      </span>
      <span className="font-mono text-caption text-muted">{name}</span>
    </li>
  );
}

function TabDemo({ filled }: { filled: boolean }) {
  const tabs: Array<[IconName, string]> = [
    ["inventory", "Items"],
    ["inbox", "Inbox"],
    ["tag", "Tags"],
    ["settings", "Settings"],
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="glass flex gap-1 rounded-full p-1">
        {tabs.map(([name, label], i) => (
          <span
            key={name}
            className={cx(
              "flex min-h-11 min-w-16 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[0.6875rem] font-semibold",
              i === 0 ? "bg-primary-tint/90 text-on-glass-primary" : "text-on-glass-muted",
            )}
          >
            <Icon name={name} variant={filled && i === 0 ? "fill" : "outline"} className="size-6" />
            {label}
          </span>
        ))}
      </div>
      <span className="specular flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg">
        <Icon name="plus" className="size-7" />
      </span>
    </div>
  );
}

export function IconSpecimens() {
  return (
    <>
      <Specimen
        id="icons"
        title="Icons"
        usage={
          <>
            One original set on a 24-unit grid: 2-unit padding, round caps and joins, soft corners, solid
            2.5-unit dots as the only accent, currentColor only. Stroke follows the rendered size (16 px{" "}
            {opticalStroke(16)} · 20 px {opticalStroke(20)} · 24 px {opticalStroke(24)} · 32 px{" "}
            {opticalStroke(32)} units). Sources: src/assets/icons; finder pages use the same set through
            /p/icons.svg.
          </>
        }
      >
        {GROUPS.map((g) => (
          <Row key={g.label} label={`${g.label} · 16 / 20 / 24 / 32`} wrap={false}>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
              {g.names.map((n) => (
                <IconCell key={n} name={n} />
              ))}
            </ul>
          </Row>
        ))}
        <p className="text-footnote text-muted">
          {NAMES.length} icons, {FILLED.length} with a filled variant. Every name used in the code is checked
          by test/icons.test.ts.
        </p>
      </Specimen>

      <Specimen
        id="icon-fill"
        title="Outline and fill"
        usage="Filled variants exist only for navigation (selected tab, iOS style) and keep the outline's silhouette, so selecting a tab never shifts it. Holes are knocked out (evenodd), never drawn in a background colour."
      >
        <Row label="Outline · fill (24 px)">
          {FILLED.map((n) => (
            <span key={n} className="flex items-center gap-2 rounded-control bg-raised p-3 ring-1 ring-line">
              <Icon name={n} className="size-6" />
              <Icon name={n} variant="fill" className="size-6" />
              <span className="font-mono text-caption text-muted">{n}</span>
            </span>
          ))}
        </Row>
        <Row label="Tab bar: selected = fill (proposed) · selected = outline (today)">
          <TabDemo filled />
          <TabDemo filled={false} />
        </Row>
      </Specimen>

      <Specimen
        id="empty-art"
        title="Empty states"
        usage="64-unit line art in the icon language: currentColor lines plus one 14 % tonal fill. Colour comes from the parent (text-primary-text on primary-tint, or text-muted). Decorative: the heading says it."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {EMPTY.map(([name, label]) => (
            <figure key={name} className="flex flex-col items-center gap-2 rounded-card bg-sunken px-4 py-6">
              <EmptyArt name={name} className="size-24 text-primary-text" />
              <figcaption className="text-subhead font-semibold">{label}</figcaption>
              <span className="font-mono text-caption text-muted">{name}</span>
            </figure>
          ))}
        </div>
      </Specimen>

      <Specimen
        id="illustrations"
        title="Item illustrations"
        usage="The no-photo placeholder (Thumb, ItemCard, item hero, pickers). 3/4 front view, key light top-left, contact shadow, colours from --illo-* tokens (item-art.css), so one drawing works in light and dark and can be tinted. Decorative next to the item name; role=img with the category otherwise."
      >
        <Row label="40 · 96 · 200 px" wrap={false}>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
            {ITEM_CATEGORIES.map((c) => (
              <li key={c} className="flex items-end gap-2 rounded-card bg-raised p-3 ring-1 ring-line">
                <span className={cx("size-10 shrink-0 rounded-[0.625rem]", studio)}>
                  <ItemArt category={c} className="size-full" />
                </span>
                <span className={cx("size-24 shrink-0 rounded-card", studio)}>
                  <ItemArt category={c} className="size-full" />
                </span>
                <span className={cx("hidden size-50 shrink-0 rounded-card sm:block", studio)}>
                  <ItemArt category={c} label={LABELS[c]} className="size-full" />
                </span>
                <span className="font-mono text-caption text-muted">{c}</span>
              </li>
            ))}
          </ul>
        </Row>
        <Row label="Tints (--illo-body): black · navy · red · olive · silver" wrap={false}>
          <ul className="flex flex-col gap-2">
            {(["suitcase", "backpack", "bag", "documents", "headphones"] as const).map((c) => (
              <li key={c} className="flex flex-wrap gap-2">
                {TINTS.map(([label, cls]) => (
                  <span key={label} className={cx("size-18 rounded-control", studio, cls)} title={label}>
                    <ItemArt category={c} className="size-full" />
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </Row>
      </Specimen>
    </>
  );
}
