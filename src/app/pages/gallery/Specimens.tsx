import { useState } from "react";
import type { ItemSummary } from "../../../shared/schemas";
import { ItemCard } from "../../components/ItemCard";
import { ApiRequestError } from "../../lib/api";
import { Badge, type BadgeTone, CountBadge, StatusPill } from "../../ui/Badge";
import { Button, type ButtonVariant, IconButton, Spinner } from "../../ui/Button";
import { Card, Section, SectionHeading } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import {
  Checkbox,
  FormError,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { KeyValue } from "../../ui/KeyValue";
import { IconTile, List, ListRow } from "../../ui/List";
import { Toolbar } from "../../ui/Page";
import { MapLinks, PlaceLabel } from "../../ui/Place";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { EmptyState, ErrorState, LoadingBlock, Skeleton, SkeletonRows } from "../../ui/States";
import { Chip, Tabs } from "../../ui/Tabs";
import { Avatar, Thumb } from "../../ui/Thumb";
import { Timeline } from "../../ui/Timeline";
import { useToast } from "../../ui/Toast";
import { Row, SAMPLE_ITEMS, Specimen, samplePhoto } from "./parts";
import { QuickCardMock } from "./QuickCardMock";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "tinted", "ghost", "danger", "danger-soft"];
const TONES: BadgeTone[] = ["neutral", "info", "success", "warning", "lost", "danger"];
const MAPS = {
  google: "https://www.google.com/maps/dir/?api=1&destination=40.40655,-3.68951",
  apple: "https://maps.apple.com/?daddr=40.40655,-3.68951",
};

export function ActionsSpecimens() {
  return (
    <Specimen
      id="buttons"
      title="Buttons"
      usage="Capsules. One primary per view. Sizes: sm 36 (44 on touch), md 44, lg 52. Loading keeps the label and blocks repeat clicks. Icon-only buttons always have a label (tooltip + accessible name)."
    >
      {VARIANTS.map((v) => (
        <Row key={v} label={`variant="${v}"`}>
          <Button variant={v} size="sm">
            Small
          </Button>
          <Button variant={v} icon="check">
            Medium
          </Button>
          <Button variant={v} size="lg">
            Large
          </Button>
          <Button variant={v} loading>
            Saving
          </Button>
          <Button variant={v} disabled>
            Disabled
          </Button>
        </Row>
      ))}
      <Row label='variant="glass" (on media / chrome only)'>
        <div className="relative overflow-hidden rounded-card p-4">
          <img src={samplePhoto(30)} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="relative flex gap-2">
            <Button variant="glass" icon="camera">
              Add photo
            </Button>
            <IconButton variant="glass" icon="more" label="More actions" />
          </div>
        </div>
      </Row>
      <Row label="IconButton: ghost · secondary · tinted · primary · sizes sm/md/lg">
        <IconButton icon="edit" label="Edit" />
        <IconButton icon="share" label="Share" variant="secondary" />
        <IconButton icon="qr" label="Show QR" variant="tinted" />
        <IconButton icon="plus" label="Create" variant="primary" size="lg" />
        <IconButton icon="close" label="Close" variant="secondary" size="sm" />
        <IconButton icon="trash" label="Delete" disabled />
      </Row>
      <Row label="block (full width, sheets on phones)" wrap={false}>
        <Button variant="primary" block iconEnd="chevron">
          Continue
        </Button>
      </Row>
    </Specimen>
  );
}

export function FieldSpecimens() {
  const [name, setName] = useState("Cabin suitcase");
  const [note, setNote] = useState("Left at the belt after the Lisbon flight.");
  const [q, setQ] = useState("");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [check, setCheck] = useState(true);
  const [kind, setKind] = useState<"meeting" | "hotel" | "post">("meeting");
  const [view, setView] = useState<"open" | "closed" | "blocked">("open");
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("auto");
  return (
    <Specimen
      id="fields"
      title="Fields and choices"
      usage="Every control has a visible label (or a visually hidden one when context is obvious), hint and error linked by aria-describedby, 44 px minimum height. SegmentedControl for 2–4 short exclusive options, RadioGroup when options need a description, Toggle for settings that apply immediately."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <TextInput
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
          showCount
        />
        <TextInput label="Brand" hint="Shown only to you." placeholder="e.g. Rimowa" />
        <TextInput label="Email" error="Enter an address like name@example.com." defaultValue="lucia@" />
        <TextInput label="Disabled" disabled defaultValue="Read-only value" />
        <TextInput label="With icon" leadingIcon="pin" placeholder="Hotel reception, Calle Mayor 4" />
        <Select label="Category" defaultValue="suitcase">
          <option value="backpack">Backpack</option>
          <option value="suitcase">Suitcase</option>
          <option value="wallet">Wallet</option>
        </Select>
        <TextArea
          label="Notes"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          showCount
          className="md:col-span-2"
        />
        <SearchField
          label="Search items"
          value={q}
          onChange={setQ}
          placeholder="Search by name, brand or model"
          clearLabel="Clear search"
          className="md:col-span-2"
        />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Card padding="sm">
          <Toggle
            label="Email me on new messages"
            description="Sent to your verified address."
            checked={on}
            onChange={setOn}
          />
          <Toggle label="Notify finders" description="Needs Workers Paid." checked={off} onChange={setOff} />
          <Toggle label="Disabled" checked={false} onChange={() => undefined} disabled />
        </Card>
        <Card padding="sm" className="flex flex-col">
          <Checkbox
            label="Share this place with the owner"
            description="Only this conversation sees it."
            checked={check}
            onChange={setCheck}
          />
          <Checkbox label="Disabled option" checked={false} onChange={() => undefined} disabled />
        </Card>
        <RadioGroup
          legend="How to return it"
          value={kind}
          onChange={setKind}
          options={[
            { value: "meeting", label: "Meet in person", description: "Agree a public place and time." },
            { value: "hotel", label: "Hotel reception", description: "Leave it at the front desk." },
            { value: "post", label: "Send by post", description: "Owner pays shipping.", disabled: true },
          ]}
        />
        <div className="flex flex-col gap-3">
          <SegmentedControl
            label="Conversation status"
            value={view}
            onChange={setView}
            options={[
              { value: "open", label: "Open" },
              { value: "closed", label: "Closed" },
              { value: "blocked", label: "Blocked" },
            ]}
          />
          <SegmentedControl
            label="Theme"
            size="sm"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "auto", label: "Auto", icon: "refresh" },
              { value: "light", label: "Light", icon: "sun" },
              { value: "dark", label: "Dark", icon: "moon" },
            ]}
          />
          <FormError message="2 fields need attention before saving." />
        </div>
      </div>
    </Specimen>
  );
}

export function StatusSpecimens() {
  return (
    <Specimen
      id="status"
      title="Badges and status"
      usage="Badge = a property (NFC: none, Archived). StatusPill = the state of a thing (dot + word). CountBadge = unread counts in navigation. Never colour alone; terracotta only for lost/unread."
    >
      <Row label="Badge tinted">
        {TONES.map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
        <Badge icon="lock">Private</Badge>
      </Row>
      <Row label="Badge solid (on photos)">
        {TONES.map((tone) => (
          <Badge key={tone} tone={tone} solid>
            {tone}
          </Badge>
        ))}
      </Row>
      <Row label="StatusPill">
        <StatusPill tone="lost" pulse>
          Lost
        </StatusPill>
        <StatusPill tone="success">With you</StatusPill>
        <StatusPill tone="info">Waiting for an answer</StatusPill>
        <StatusPill tone="success">Agreed</StatusPill>
        <StatusPill>Closed</StatusPill>
        <StatusPill tone="warning">Needs setup</StatusPill>
        <StatusPill tone="lost" solid pulse>
          Lost
        </StatusPill>
      </Row>
      <Row label="CountBadge">
        <CountBadge count={3} label="3 unread" />
        <CountBadge count={128} label="128 unread" />
      </Row>
    </Specimen>
  );
}

const SAMPLE_SUMMARIES: ItemSummary[] = SAMPLE_ITEMS.map((i, n) => ({
  id: `sample-${i.id}`,
  name: i.name,
  brand: i.brand.split(" · ")[0] ?? null,
  model: i.brand.split(" · ")[1] ?? null,
  category: i.category,
  status: n === 0 ? "lost" : "normal",
  parentId: null,
  archivedAt: null,
  coverPhotoUrl: i.photo,
  tagCount: n === 2 ? 0 : 1,
  openConversationCount: n === 0 ? 1 : 0,
  updatedAt: "2026-10-13T14:00:00.000Z",
}));

export function ContentSpecimens() {
  return (
    <>
      <Specimen
        id="cards"
        title="Cards, sections, lists"
        usage="Content layer: solid surfaces. Prefer a Section with an inset List over stacking many Cards. Card variants: raised (default), outline, inset, tinted, lost."
      >
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {SAMPLE_SUMMARIES.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
        <div className="grid gap-4 md:grid-cols-2">
          {(["raised", "outline", "inset", "tinted", "lost"] as const).map((v) => (
            <Card key={v} variant={v}>
              <SectionHeading
                title={`Card ${v}`}
                description="Title 3 heading with description."
                actions={<Button size="sm">Action</Button>}
              />
              <p className="text-subhead text-muted">Body copy sits at 15–16 px with muted secondary text.</p>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Section
            title="Tags"
            description="QR/NFC tags on this item."
            actions={
              <Button size="sm" variant="ghost" icon="plus">
                Add
              </Button>
            }
            footer="Revoked tags stop working immediately."
          >
            <List>
              <ListRow
                to="/gallery#cards"
                leading={
                  <IconTile>
                    <Icon name="qr" className="size-5" />
                  </IconTile>
                }
                title="003"
                subtitle="Cabin suitcase"
                trailing={<StatusPill tone="success">Active</StatusPill>}
              />
              <ListRow
                to="/gallery#cards"
                current
                leading={
                  <IconTile tone="accent">
                    <Icon name="qr" className="size-5" />
                  </IconTile>
                }
                title="001 (selected)"
                subtitle="Navy travel backpack"
                trailing="2 h ago"
              />
              <ListRow
                onClick={() => undefined}
                tone="danger"
                leading={
                  <IconTile tone="lost">
                    <Icon name="trash" className="size-5" />
                  </IconTile>
                }
                title="Revoke tag"
              />
            </List>
          </Section>
          <Section title="Conversations">
            <List>
              <ListRow
                to="/gallery#cards"
                strong
                leading={<Avatar name="Martin" />}
                title="Grey cabin suitcase"
                subtitle="Martin · Cabin suitcase"
                description="Hi! I found a grey suitcase with your tag at the Atocha station café…"
                trailing={
                  <>
                    <span>12 min</span>
                    <CountBadge count={1} label="1 unread" />
                  </>
                }
              />
              <ListRow
                to="/gallery#cards"
                leading={<Avatar name={null} />}
                title="Backpack"
                subtitle="Navy travel backpack"
                trailing="Yesterday"
              />
              <ListRow
                leading={<Thumb src={samplePhoto(140)} category="clothing" size="sm" />}
                title="Static row"
                subtitle="No link, no chevron"
                trailing={<StatusPill>Archived</StatusPill>}
              />
            </List>
          </Section>
        </div>
        <Row label="Thumb sizes (photo · category fallback) and Avatar">
          {(["xs", "sm", "md", "lg", "xl"] as const).map((s) => (
            <Thumb key={s} size={s} src={samplePhoto(215)} category="backpack" />
          ))}
          {(["sm", "md", "lg", "xl"] as const).map((s) => (
            <Thumb key={`f-${s}`} size={s} category="wallet" />
          ))}
          <Avatar name="Jonas" />
          <Avatar name="Lucía" size="md" />
        </Row>
      </Specimen>

      <Specimen
        id="data"
        title="Facts, history, places"
        usage="KeyValue for read-only facts; Timeline for recoveries and activity; PlaceLabel wherever a location appears (name first, coordinates small, OSM attribution when the name came from OpenStreetMap); MapLinks for directions."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <KeyValue
              entries={[
                { key: "t", label: "Public title", value: "Grey cabin suitcase" },
                { key: "r", label: "Reward", value: "", empty: "None" },
                { key: "s", label: "Serial", value: "RMW-2231-88", mono: true },
              ]}
            />
          </Card>
          <Card>
            <KeyValue
              layout="inline"
              entries={[
                { key: "v", label: "Version", value: "0.2.0", mono: true },
                { key: "b", label: "Last backup", value: "Today, 03:00" },
                { key: "f", label: "Notification failures", value: "2", tone: "warning" },
              ]}
            />
          </Card>
          <Card>
            <Timeline
              entries={[
                {
                  key: "1",
                  title: <StatusPill tone="lost">Returning</StatusPill>,
                  time: "13 Oct, 16:19",
                  body: "Madrid-Barajas T4, baggage belt 12",
                  tone: "lost",
                  actions: <Button size="sm">Update</Button>,
                },
                {
                  key: "2",
                  title: <StatusPill tone="success">Recovered</StatusPill>,
                  time: "2 Jun",
                  body: "Hotel reception, Lisbon",
                  tone: "success",
                },
                { key: "3", title: "Marked as lost", time: "1 Jun", tone: "neutral" },
              ]}
            />
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <PlaceLabel
              place={{
                name: "Estación de Atocha",
                detail: "Arganzuela, Madrid, Spain",
                address: "Plaza del Emperador Carlos V, Madrid",
              }}
              label="Café next to the ticket machines"
              lat={40.40655}
              lng={-3.68951}
              accuracyM={18}
            />
            <MapLinks maps={MAPS} className="mt-3" />
          </Card>
          <Card>
            <PlaceLabel place={null} label="Hotel Lisboa Plaza, reception" />
            <p className="mt-2 text-footnote text-muted">Typed by hand, no coordinates.</p>
          </Card>
          <Card>
            <PlaceLabel place={null} lat={38.7223} lng={-9.13934} accuracyM={35} />
            <p className="mt-2 text-footnote text-muted">Geocoding failed or timed out: coordinates only.</p>
            <MapLinks maps={MAPS} className="mt-3" />
          </Card>
        </div>
      </Specimen>
    </>
  );
}

export function NavigationSpecimens() {
  const [tab, setTab] = useState<"overview" | "tags" | "history">("overview");
  const [chips, setChips] = useState({ lost: true, archived: false });
  const [floating, setFloating] = useState(false);
  return (
    <Specimen
      id="navigation"
      title="Navigation and headers"
      usage="PageHeader is the large title (single h1); the Shell shows a compact copy in the glass header on scroll. Tabs switch views of one object; Chips combine filters; Toolbar groups actions (floating = glass, above the tab bar)."
    >
      <div className="rounded-card bg-sunken p-5">
        <PageHeaderDemo />
      </div>
      <Row label='Tabs variant="pill" · "underline"' wrap={false}>
        <Tabs
          label="Item sections"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "tags", label: "Tags", count: 2 },
            { key: "history", label: "History" },
          ]}
        >
          <p className="text-subhead text-muted">Panel for “{tab}”.</p>
        </Tabs>
        <Tabs
          label="Item sections (underline)"
          variant="underline"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "tags", label: "Tags" },
            { key: "history", label: "History" },
          ]}
        >
          <p className="text-subhead text-muted">Dense desktop variant.</p>
        </Tabs>
      </Row>
      <Row label="Chip (aria-pressed)">
        <Chip pressed={chips.lost} onClick={() => setChips({ ...chips, lost: !chips.lost })}>
          <Icon name="alert" className="size-4" /> Lost
        </Chip>
        <Chip pressed={chips.archived} onClick={() => setChips({ ...chips, archived: !chips.archived })}>
          Archived
        </Chip>
      </Row>
      <Row label="Toolbar inline · floating">
        <Toolbar label="Bulk actions">
          <span className="text-subhead font-semibold">2 selected</span>
          <Button size="sm" icon="print">
            Print
          </Button>
          <Button size="sm" variant="danger-soft" icon="trash">
            Revoke
          </Button>
        </Toolbar>
        <Button size="sm" variant="tinted" onClick={() => setFloating(!floating)}>
          {floating ? "Hide floating toolbar" : "Show floating toolbar"}
        </Button>
        {floating ? (
          <Toolbar label="Bulk actions (floating)" floating>
            <span className="text-subhead font-semibold">2 selected</span>
            <div className="flex gap-2">
              <Button size="sm" icon="print">
                Print
              </Button>
              <Button size="sm" variant="primary" onClick={() => setFloating(false)}>
                Done
              </Button>
            </div>
          </Toolbar>
        ) : null}
      </Row>
    </Specimen>
  );
}

/** PageHeader renders the page h1; the demo uses the same anatomy with an h2 so the gallery keeps one h1. */
function PageHeaderDemo() {
  return (
    <div className="flex flex-col gap-2">
      <span className="-ml-2 inline-flex min-h-11 w-fit items-center gap-0.5 pr-3 pl-1.5 text-body font-medium text-primary-text">
        <Icon name="back" className="size-5" />
        Inventory
      </span>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="mb-0.5 text-subhead font-medium text-muted">Suitcase · Rimowa</p>
          <h2 className="text-large-title font-bold tracking-[-0.02em]">Cabin suitcase</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill tone="lost" pulse>
              Lost
            </StatusPill>
          </div>
          <p className="mt-1 text-body text-muted">Finders who scan its tag see your lost message.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon="check">
            Mark as recovered
          </Button>
          <IconButton icon="more" label="More actions" variant="secondary" />
        </div>
      </div>
    </div>
  );
}

export function FeedbackSpecimens() {
  const toast = useToast();
  const [sheet, setSheet] = useState<"md" | "lg" | "confirm" | "typed" | "quick" | null>(null);
  return (
    <>
      <Specimen
        id="overlays"
        title="Sheets, dialogs, toasts"
        usage="Sheet: bottom sheet with grabber on phones (drag down to close), floating side panel from 640 px. ConfirmDialog: centred alert; typed confirmation for irreversible actions. Toasts: glass capsule above the tab bar, one optional action (Undo)."
      >
        <Row label="Sheet · ConfirmDialog">
          <Button onClick={() => setSheet("md")}>Open sheet</Button>
          <Button onClick={() => setSheet("lg")}>Open large sheet</Button>
          <Button variant="danger-soft" onClick={() => setSheet("confirm")}>
            Confirm
          </Button>
          <Button variant="danger-soft" onClick={() => setSheet("typed")}>
            Typed confirm
          </Button>
        </Row>
        <Row label="Toast">
          <Button size="sm" onClick={() => toast("Saved")}>
            Success
          </Button>
          <Button
            size="sm"
            onClick={() =>
              toast("Tag 004 revoked", "success", {
                action: { label: "Undo", onClick: () => toast("Restored", "info") },
              })
            }
          >
            With action
          </Button>
          <Button size="sm" onClick={() => toast("You appear to be offline.", "error")}>
            Error
          </Button>
          <Button size="sm" onClick={() => toast("New message from Martin", "info")}>
            Info
          </Button>
        </Row>
      </Specimen>

      <Specimen
        id="quick-card"
        title="Flow: Quick card"
        usage="From the floating + (Create › Quick card) or an item's hero: pick the item, reuse or create its tag, choose paper, then Share (iOS share sheet: print, Files) or download PNG/PDF. Mock only; spec in docs/design/system.md § Flows."
      >
        <Row label="Open the sheet">
          <Button variant="primary" icon="card" onClick={() => setSheet("quick")}>
            Quick card
          </Button>
        </Row>
      </Specimen>

      <Specimen
        id="states"
        title="Empty, loading, error"
        usage="Every list and page designs all three. Empty says why and offers the next step; loading uses skeletons of the final size; errors say what happened and offer a retry."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card padding="none">
            <EmptyState
              title="Your inventory is empty"
              action={
                <Button variant="primary" icon="plus">
                  Add item
                </Button>
              }
            >
              Add your backpack, suitcase or laptop, give it a photo, then attach a tag.
            </EmptyState>
          </Card>
          <div className="flex flex-col gap-4">
            <EmptyState compact icon="inbox" title="No conversations yet">
              Finders who scan a tag appear here.
            </EmptyState>
            <ErrorState
              compact
              error={new ApiRequestError(0, "network", "offline")}
              onRetry={() => undefined}
            />
          </div>
          <ErrorState
            error={new ApiRequestError(500, "internal", "Unexpected error")}
            onRetry={() => undefined}
          />
          <div className="flex flex-col gap-3">
            <SkeletonRows rows={3} />
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-32 rounded-full" />
              <Spinner className="size-5 text-primary-text" />
            </div>
          </div>
          <LoadingBlock rows={2} />
        </div>
      </Specimen>

      <Sheet
        open={sheet === "md" || sheet === "lg"}
        onClose={() => setSheet(null)}
        title="Add item"
        description="Name and category are enough to start."
        size={sheet === "lg" ? "lg" : "md"}
      >
        <SheetBody>
          <TextInput label="Name" required />
          <Select label="Category" defaultValue="backpack">
            <option value="backpack">Backpack</option>
          </Select>
          <TextArea label="Description" />
        </SheetBody>
        <SheetFooter>
          <Button onClick={() => setSheet(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => setSheet(null)}>
            Add item
          </Button>
        </SheetFooter>
      </Sheet>
      <ConfirmDialog
        open={sheet === "confirm"}
        title="Archive this item?"
        message="Its tags stop working for finders until you restore it."
        confirmLabel="Archive"
        tone="primary"
        onClose={() => setSheet(null)}
        onConfirm={async () => undefined}
      />
      <ConfirmDialog
        open={sheet === "typed"}
        title="Delete conversation?"
        message="Messages, places and plans are removed for good."
        confirmLabel="Delete"
        typed="DELETE"
        onClose={() => setSheet(null)}
        onConfirm={async () => undefined}
      />
      <QuickCardMock open={sheet === "quick"} onClose={() => setSheet(null)} />
    </>
  );
}
