import { useState } from "react";
import { BRAND } from "../../../shared/brand";
import { StatusPill } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Section } from "../../ui/Card";
import { cx } from "../../ui/cx";
import { FormError, RadioGroup, SearchField, SegmentedControl, Select } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { List, ListRow } from "../../ui/List";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { Thumb } from "../../ui/Thumb";
import { SAMPLE_ITEMS } from "./parts";

type Paper = "a4" | "letter";
type Colour = "petrol" | "sage" | "warm";
type MockState = "idle" | "creating" | "error" | "ready";

const COLOURS: Record<Colour, { bg: string; fg: string; label: string }> = {
  petrol: { bg: BRAND.petrol, fg: BRAND.warmWhite, label: "Petrol" },
  sage: { bg: BRAND.sage, fg: BRAND.ink, label: "Sage" },
  warm: { bg: BRAND.warmWhite, fg: BRAND.petrol, label: "Warm" },
};

/**
 * Paper preview: A4/Letter page with one or two fold-over cards (front | back side by side), dashed fold line,
 * crop marks. Proportions are true to the spec in docs/design/system.md § Quick card.
 */
export function PaperPreview({ paper, colour, copies }: { paper: Paper; colour: Colour; copies: 1 | 2 }) {
  const page = paper === "a4" ? { w: 210, h: 297 } : { w: 215.9, h: 279.4 };
  const card = { w: 85.6, h: 54 };
  const pair = { w: card.w * 2, h: card.h };
  const x0 = (page.w - pair.w) / 2;
  const ys = copies === 1 ? [30] : [30, 30 + pair.h + 24];
  const c = COLOURS[colour];
  const mark = 4;
  return (
    <svg
      viewBox={`0 0 ${page.w} ${page.h}`}
      role="img"
      aria-label={`${paper === "a4" ? "A4" : "Letter"} page preview with ${copies} fold-over card${copies === 2 ? "s" : ""}`}
      className="h-auto w-full rounded-lg bg-white shadow-float ring-1 ring-black/5"
    >
      <text
        x={page.w / 2}
        y={16}
        textAnchor="middle"
        fontSize="4.2"
        fill={BRAND.muted}
        fontFamily="system-ui"
      >
        Cut along the outer marks · fold on the dashed line · glue or tape back to back
      </text>
      {ys.map((y) => (
        <g key={y}>
          {/* front */}
          <rect x={x0} y={y} width={card.w} height={card.h} rx="3.18" fill={c.bg} />
          <text
            x={x0 + 8}
            y={y + 12}
            fontSize="5"
            fontWeight="700"
            fill={c.fg}
            fontFamily="system-ui"
            letterSpacing="1.2"
          >
            RETURN
          </text>
          <text x={x0 + 8} y={y + 30} fontSize="4.6" fontWeight="600" fill={c.fg} fontFamily="system-ui">
            If found, please scan
          </text>
          <text x={x0 + 8} y={y + 36} fontSize="3.2" fill={c.fg} fontFamily="system-ui" opacity="0.85">
            Gefunden? Bitte scannen · ¿Encontrado?
          </text>
          <rect x={x0 + card.w - 38} y={y + 12} width="30" height="30" rx="2" fill={"white"} />
          <path
            d={`M${x0 + card.w - 34} ${y + 16}h8v8h-8zM${x0 + card.w - 20} ${y + 16}h8v8h-8zM${x0 + card.w - 34} ${y + 30}h8v8h-8zM${x0 + card.w - 22} ${y + 28}h3v3h-3zM${x0 + card.w - 17} ${y + 33}h3v3h-3z`}
            fill={BRAND.ink}
          />
          <circle
            cx={x0 + 6}
            cy={y + card.h / 2}
            r="2.5"
            fill="none"
            stroke={c.fg}
            strokeWidth="0.4"
            opacity="0.6"
          />
          {/* back */}
          <rect
            x={x0 + card.w}
            y={y}
            width={card.w}
            height={card.h}
            rx="3.18"
            fill={BRAND.paper}
            stroke={BRAND.line}
            strokeWidth="0.3"
          />
          <text
            x={x0 + card.w + 8}
            y={y + 12}
            fontSize="4"
            fontWeight="700"
            fill={BRAND.petrol}
            fontFamily="system-ui"
            letterSpacing="1.2"
          >
            RETURN · 003
          </text>
          <text x={x0 + card.w + 8} y={y + 26} fontSize="3.2" fill={BRAND.muted} fontFamily="system-ui">
            Or open this address
          </text>
          <text
            x={x0 + card.w + 8}
            y={y + 32}
            fontSize="3.6"
            fill={BRAND.ink}
            fontFamily="ui-monospace, monospace"
          >
            return.lr0y.dev/t/q2c6…ps84
          </text>
          <text x={x0 + card.w + 8} y={y + 44} fontSize="3.2" fill={BRAND.muted} fontFamily="system-ui">
            Lucía · backup@example.test
          </text>
          <circle
            cx={x0 + 2 * card.w - 6}
            cy={y + card.h / 2}
            r="2.5"
            fill="none"
            stroke={BRAND.petrol}
            strokeWidth="0.4"
            opacity="0.6"
          />
          {/* fold line */}
          <line
            x1={x0 + card.w}
            y1={y - 3}
            x2={x0 + card.w}
            y2={y + card.h + 3}
            stroke={BRAND.muted}
            strokeWidth="0.35"
            strokeDasharray="1.6 1.2"
          />
          {/* crop marks */}
          {[
            [x0, y],
            [x0 + pair.w, y],
            [x0, y + pair.h],
            [x0 + pair.w, y + pair.h],
          ].map(([mx = 0, my = 0]) => (
            <g key={`${mx}-${my}`} stroke={BRAND.ink} strokeWidth="0.25">
              <line
                x1={mx < page.w / 2 ? mx - 2 - mark : mx + 2}
                y1={my}
                x2={mx < page.w / 2 ? mx - 2 : mx + 2 + mark}
                y2={my}
              />
              <line
                x1={mx}
                y1={my < y + 1 ? my - 2 - mark : my + 2}
                x2={mx}
                y2={my < y + 1 ? my - 2 : my + 2 + mark}
              />
            </g>
          ))}
        </g>
      ))}
      <text
        x={page.w / 2}
        y={page.h - 10}
        textAnchor="middle"
        fontSize="3.6"
        fill={BRAND.muted}
        fontFamily="system-ui"
      >
        Print at 100% (no “fit to page”) · 300 dpi ·{" "}
        {paper === "a4" ? "A4 210 × 297 mm" : "US Letter 8.5 × 11 in"}
      </text>
    </svg>
  );
}

/** Interactive mock of the Quick card sheet (UI only; no API calls). */
export function QuickCardMock({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [itemId, setItemId] = useState<string>("a");
  const [query, setQuery] = useState("");
  const [tagChoice, setTagChoice] = useState<"existing" | "new">("existing");
  const [paper, setPaper] = useState<Paper>("a4");
  const [copies, setCopies] = useState<"1" | "2">("1");
  const [colour, setColour] = useState<Colour>("petrol");
  const [state, setState] = useState<MockState>("idle");
  const item = SAMPLE_ITEMS.find((i) => i.id === itemId) ?? SAMPLE_ITEMS[0];
  const shown = SAMPLE_ITEMS.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));

  const run = (next: MockState) => {
    setState("creating");
    window.setTimeout(() => setState(next), 900);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Quick card"
      description="Tag + printable card for plain paper."
      size="lg"
    >
      <SheetBody>
        <Section title="1 · Item">
          <SearchField
            label="Find an item"
            value={query}
            onChange={setQuery}
            placeholder="Search your items"
            clearLabel="Clear"
          />
          <List label="Items">
            {shown.map((i) => (
              <ListRow
                key={i.id}
                onClick={() => setItemId(i.id)}
                current={i.id === itemId}
                chevron={false}
                leading={<Thumb src={i.photo} category={i.category} size="sm" />}
                title={i.name}
                subtitle={i.brand}
                trailing={
                  i.id === itemId ? (
                    <Icon name="check" className="size-5 text-primary-text" />
                  ) : i.tag ? (
                    `Tag ${i.tag}`
                  ) : (
                    "No tag"
                  )
                }
              />
            ))}
            <ListRow
              onClick={() => setItemId("a")}
              chevron={false}
              tone="primary"
              leading={<Icon name="plus" className="size-5" />}
              title="New item…"
            />
          </List>
        </Section>

        <Section title="2 · Tag">
          <RadioGroup
            legend="Tag"
            legendHidden
            value={item?.tag ? tagChoice : "new"}
            onChange={setTagChoice}
            options={[
              {
                value: "existing",
                label: item?.tag ? `Use tag ${item.tag}` : "Use an existing tag",
                description: "Already on this item. Reprinting does not change its address.",
                disabled: !item?.tag,
              },
              {
                value: "new",
                label: "Create a new tag",
                description: "Gets the next number and is attached to this item.",
              },
            ]}
          />
        </Section>

        <Section title="3 · Card">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <p className="text-subhead font-medium">Paper</p>
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
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-subhead font-medium">Copies</p>
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
            </div>
            <Select label="Card language" defaultValue="en">
              <option value="en">English (+ DE · ES line)</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
            </Select>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-subhead font-medium">Colour</legend>
              <div className="flex gap-2">
                {(Object.keys(COLOURS) as Colour[]).map((k) => (
                  <label
                    key={k}
                    className={cx(
                      "flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-control px-3 ring-1 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ring",
                      colour === k ? "bg-primary-tint ring-primary" : "ring-line-strong/50 hover:bg-fill",
                    )}
                  >
                    <input
                      type="radio"
                      name="qc-colour"
                      className="sr-only"
                      checked={colour === k}
                      onChange={() => setColour(k)}
                    />
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0">
                      <circle cx="10" cy="10" r="9.5" fill={COLOURS[k].bg} stroke={BRAND.line} />
                    </svg>
                    <span className="text-subhead font-medium">{COLOURS[k].label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Section>

        <Section
          title="Preview"
          footer="Fold-over card: 85.6 × 54 mm finished (fits luggage-tag windows and wallets)."
        >
          <div className="mx-auto w-full max-w-sm">
            <PaperPreview paper={paper} colour={colour} copies={copies === "2" ? 2 : 1} />
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="warning">Proof: domain not live</StatusPill>
            <StatusPill tone="info">QR 30 mm · ECC M</StatusPill>
          </div>
        </Section>

        {state === "error" ? (
          <FormError message="The tag could not be created. Check your connection and try again." />
        ) : null}
        {state === "ready" ? (
          <p
            role="status"
            className="flex items-center gap-2 rounded-control bg-success-tint px-3.5 py-2.5 text-subhead font-medium text-success"
          >
            <Icon name="check" className="size-4" />
            Card ready. After printing, mark tag 003 as attached.
          </p>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button icon="download" onClick={() => run("ready")} disabled={state === "creating"}>
          PDF
        </Button>
        <Button icon="photo" onClick={() => run("error")} disabled={state === "creating"}>
          PNG
        </Button>
        <Button variant="primary" icon="share" loading={state === "creating"} onClick={() => run("ready")}>
          Share…
        </Button>
      </SheetFooter>
    </Sheet>
  );
}
