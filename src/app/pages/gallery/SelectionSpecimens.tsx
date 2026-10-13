import { useMemo, useState } from "react";
import { localeOptions, timeZoneOptions } from "../../lib/locale-options";
import { SearchField } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Menu, type MenuEntry, MenuPreview } from "../../ui/Menu";
import { Combobox, ListboxPreview, Select, type SelectOption } from "../../ui/Select";
import { Chip } from "../../ui/Tabs";
import { Thumb } from "../../ui/Thumb";
import { useToast } from "../../ui/Toast";
import { Row, SAMPLE_ITEMS, Specimen } from "./parts";

type Category = "all" | "backpack" | "suitcase" | "wallet" | "laptop";

const CATEGORIES: SelectOption<Category>[] = [
  { value: "all", label: "All categories" },
  { value: "backpack", label: "Backpack", leading: <Icon name="backpack" className="size-5" /> },
  { value: "suitcase", label: "Suitcase", leading: <Icon name="suitcase" className="size-5" /> },
  { value: "wallet", label: "Wallet", leading: <Icon name="wallet" className="size-5" /> },
  { value: "laptop", label: "Laptop", leading: <Icon name="laptop" className="size-5" />, disabled: true },
];

const NFC: SelectOption<"none" | "written" | "locked">[] = [
  { value: "none", label: "No NFC chip" },
  { value: "written", label: "Written", description: "The chip opens the tag address." },
  { value: "locked", label: "Written and locked", description: "Cannot be changed any more." },
];

/**
 * Selection family: Select (field + chip, glass listbox on fine pointers, native on coarse), Combobox (search in
 * long lists) and Menu (actions). Strings are English on purpose (design/QA tool).
 */
export function SelectionSpecimens() {
  const toast = useToast();
  const [category, setCategory] = useState<Category>("suitcase");
  const [filter, setFilter] = useState<Category>("all");
  const [nfc, setNfc] = useState<"none" | "written" | "locked">("written");
  const [zone, setZone] = useState("Europe/Berlin");
  const [locale, setLocale] = useState("en-GB");
  const [item, setItem] = useState<string | null>("b");
  const [q, setQ] = useState("");
  const [lost, setLost] = useState(true);

  const zones = useMemo(() => timeZoneOptions("en").map((z) => ({ ...z, group: z.region })), []);
  const locales = useMemo(() => localeOptions("en"), []);
  const preview = useMemo(
    () =>
      zones.filter((z) =>
        ["Europe/Berlin", "Europe/Lisbon", "Europe/London", "Europe/Madrid"].includes(z.value),
      ),
    [zones],
  );

  const menu: MenuEntry[] = [
    { key: "edit", label: "Edit item", icon: "edit", onSelect: () => toast("Edit", "info") },
    { key: "card", label: "Quick card", icon: "card", onSelect: () => toast("Quick card", "info") },
    { key: "share", label: "Share location", icon: "share", disabled: true, onSelect: () => undefined },
    { key: "sep", separator: true },
    {
      key: "archive",
      label: "Archive",
      icon: "box",
      description: "Tags stop working until restored.",
      onSelect: () => toast("Archived", "info"),
    },
    {
      key: "delete",
      label: "Delete",
      icon: "trash",
      tone: "danger",
      onSelect: () => toast("Deleted", "error"),
    },
  ];

  return (
    <Specimen
      id="selection"
      title="Selection: Select, Combobox, Menu"
      usage="Select chooses one value; on fine pointers it opens a glass listbox (type-ahead, Home/End, Escape), on touch the native picker. Combobox adds search for long lists (time zones, items, tags); free text is never kept. Menu runs actions (More …). All are capsules, like chips, search and buttons; the listbox and menu float in the top layer above sheets."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Select
          label="Category"
          hint="Fine pointer: glass listbox · touch: native picker."
          options={CATEGORIES}
          value={category}
          onChange={setCategory}
        />
        <Select label="NFC chip" options={NFC} value={nfc} onChange={setNfc} />
        <Select label="Disabled" options={CATEGORIES} value="wallet" onChange={() => undefined} disabled />
        <Select
          label="With error"
          options={CATEGORIES}
          value="all"
          onChange={() => undefined}
          error="Choose a category for this item."
        />
        <Select label="Locale" options={locales} value={locale} onChange={setLocale} />
        <Select
          label="Native (forced)"
          hint="The coarse-pointer rendering, same shape."
          options={CATEGORIES}
          value={category}
          onChange={setCategory}
          native
        />
        <Combobox
          label="Time zone"
          hint="Search by city or offset, e.g. Lisbon or GMT+1."
          placeholder="City or GMT offset"
          options={zones}
          value={zone}
          onChange={setZone}
        />
        <Combobox
          label="Item"
          placeholder="Search your items"
          options={SAMPLE_ITEMS.map((i) => ({
            value: i.id,
            label: i.name,
            description: i.brand,
            leading: <Thumb src={i.photo} category={i.category} size="xs" />,
          }))}
          value={item}
          onChange={setItem}
        />
      </div>

      <Row label='Filter toolbar: SearchField · Select variant="chip" · Chip'>
        <SearchField
          label="Search items"
          value={q}
          onChange={setQ}
          placeholder="Search"
          clearLabel="Clear search"
          className="w-full sm:w-64"
        />
        <Select label="Category" variant="chip" options={CATEGORIES} value={filter} onChange={setFilter} />
        <Chip pressed={lost} onClick={() => setLost(!lost)}>
          <Icon name="alert" className="size-4" /> Lost
        </Chip>
      </Row>

      <Row label="Menu: icon-only (More) · labelled">
        <Menu label="More actions" items={menu} />
        <Menu
          label="Actions"
          iconOnly={false}
          icon="settings"
          variant="tinted"
          size="sm"
          align="start"
          items={menu}
        />
      </Row>

      <Row label="Open state (static previews)">
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <ListboxPreview options={preview} value="Europe/Berlin" active={2} />
          <MenuPreview items={menu} active={1} />
        </div>
      </Row>
    </Specimen>
  );
}
