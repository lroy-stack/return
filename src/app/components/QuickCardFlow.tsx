import { useMemo, useState } from "react";
import {
  buildPaperSheet,
  CardLayoutError,
  cardInputFromSettings,
  PaperLayoutError,
  type PaperPage,
  type PaperSize,
  renderPaperSvg,
} from "../../shared/card";
import type { Item, ItemDetail, ItemSummary, Tag } from "../../shared/schemas";
import { CARD_THEMES, LANGUAGES, type Language, type Settings } from "../../shared/settings";
import { api, qs } from "../lib/api";
import { notifyDataChanged } from "../lib/data-events";
import { useDebounced, useMediaQuery, useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useSettings } from "../lib/settings-context";
import { downloadBlob, fileStem, paperToPng, svgDataUrl } from "../pages/print/export";
import { StatusPill } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Section } from "../ui/Card";
import { cx } from "../ui/cx";
import { FormError, RadioGroup, SearchField, SegmentedControl, Select, TextInput } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { IconTile, List, ListRow } from "../ui/List";
import { SheetBody, SheetFooter } from "../ui/Sheet";
import { ErrorState, errorMessage, LoadingBlock } from "../ui/States";
import { Thumb } from "../ui/Thumb";
import { useToast } from "../ui/Toast";

const LETTER_REGIONS = new Set(["US", "CA", "MX"]);
const VISIBLE_ITEMS = 8;
const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch", es: "Español" };

/** Letter where people print on US Letter (en-US, en-CA, es-MX), A4 everywhere else. */
export function defaultPaper(locale: string): PaperSize {
  try {
    const region = new Intl.Locale(locale).region;
    return region && LETTER_REGIONS.has(region) ? "letter" : "a4";
  } catch {
    return "a4";
  }
}

/** True when the browser can hand a file to the system share sheet (AirDrop, Messages, print…). */
function canShareFiles(): boolean {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([""], "card.png", { type: "image/png" })] })
    );
  } catch {
    return false;
  }
}

/** A stand-in for the tag that will be created on export, so the preview shows the real layout. */
function placeholderTag(itemId: string, itemName: string, settings: Settings): Tag {
  const token = "A".repeat(26);
  return {
    id: "preview",
    itemId,
    itemName,
    token,
    seq: 0,
    label: `${settings.tags.labelPrefix}${"#".repeat(settings.tags.labelDigits)}`,
    status: "active",
    nfcStatus: "none",
    replacedBy: null,
    note: null,
    lastSeenAt: null,
    revokedAt: null,
    createdAt: "",
    url: `${window.location.origin}/t/${token}`,
  };
}

interface Composed {
  pages: PaperPage[];
  svg: string;
  proof: boolean;
}

interface Options {
  paper: PaperSize;
  copies: 1 | 2;
  theme: Settings["tags"]["cardTheme"];
  language: Language;
}

function compose(tag: Tag, settings: Settings, o: Options): Composed {
  const input = cardInputFromSettings(tag, settings, { theme: o.theme, language: o.language });
  const pages = buildPaperSheet(
    Array.from({ length: o.copies }, () => input),
    { paper: o.paper, layout: "fold" },
  );
  const first = pages[0];
  if (!first) throw new PaperLayoutError("no_cards", "Nothing to lay out.");
  return { pages, svg: renderPaperSvg(first), proof: first.watermark !== null };
}

type Busy = null | "png" | "pdf" | "share";
type Phase = "tag" | "render";

/**
 * Quick card: pick (or create) an item, reuse or create its tag, and get a print-ready fold-over card for plain
 * paper as PNG / PDF, or hand it to the share sheet. The tag is created on export, never on open. Loaded lazily
 * by `QuickCardHost`; the PDF writer loads only when PDF is chosen.
 */
export function QuickCardFlow({ initialItemId }: { initialItemId: string | null }) {
  const t = useT();
  const toast = useToast();
  const { settings } = useSettings();
  const coarse = useMediaQuery("(pointer: coarse)");
  const [shareable] = useState(canShareFiles);

  const [itemId, setItemId] = useState<string | null>(initialItemId);
  const [createdTag, setCreatedTag] = useState<Tag | null>(null);
  const [choiceState, setChoiceState] = useState<"existing" | "new" | null>(null);
  const [paper, setPaper] = useState<PaperSize>(() => defaultPaper(settings.identity.locale));
  const [copies, setCopies] = useState<"1" | "2">("1");
  const [theme, setTheme] = useState(settings.tags.cardTheme);
  const [language, setLanguage] = useState<Language>(settings.tags.cardLanguage);
  const [busy, setBusy] = useState<Busy>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readyLabel, setReadyLabel] = useState<string | null>(null);

  const detail = useResource<ItemDetail>(itemId ? `qc-item-${itemId}` : null, (signal) =>
    api.get<ItemDetail>(`/items/${itemId}`, signal),
  );

  const chooseItem = (id: string | null) => {
    setItemId(id);
    setCreatedTag(null);
    setChoiceState(null);
    setReadyLabel(null);
    setError(null);
  };

  const loaded = itemId !== null && detail.state.status === "ready" ? detail.state.data : null;
  const item = loaded?.item ?? null;
  const activeTags = loaded?.tags.filter((x) => x.status === "active") ?? [];
  const existing = createdTag ?? activeTags[0] ?? null;
  const choice = createdTag ? "existing" : existing ? (choiceState ?? "existing") : "new";
  const usingExisting = choice === "existing" && existing !== null;
  const options: Options = { paper, copies: copies === "2" ? 2 : 1, theme, language };

  const preview = useMemo(() => {
    if (!item) return null;
    const tag = usingExisting && existing ? existing : placeholderTag(item.id, item.name, settings);
    try {
      return {
        ok: true as const,
        tag,
        composed: compose(tag, settings, { paper, copies: copies === "2" ? 2 : 1, theme, language }),
      };
    } catch (e) {
      if (e instanceof CardLayoutError || e instanceof PaperLayoutError) {
        return { ok: false as const, message: e.message };
      }
      throw e;
    }
  }, [item, usingExisting, existing, settings, paper, copies, theme, language]);

  async function createTag(forItem: Item): Promise<Tag> {
    setPhase("tag");
    const res = await api.post<{ tags: Tag[] }>("/tags", { itemId: forItem.id, count: 1 });
    const tag = res.tags[0];
    if (!tag) throw new Error("No tag returned");
    setCreatedTag(tag);
    notifyDataChanged();
    toast(t("qc.tagCreated", { label: tag.label }));
    return tag;
  }

  async function exportAs(kind: Exclude<Busy, null>) {
    if (!item || !preview?.ok) return;
    setBusy(kind);
    setError(null);
    setReadyLabel(null);
    try {
      let tag = preview.tag;
      if (!usingExisting) {
        try {
          tag = await createTag(item);
        } catch (e) {
          console.error("quick card: tag creation failed", e);
          setError(t("qc.errorTag"));
          return;
        }
      }
      setPhase("render");
      const composed = compose(tag, settings, options);
      const stem = `return-card-${fileStem(tag.label)}-${paper}${composed.proof ? "-proof" : ""}`;
      if (kind === "pdf") {
        const { renderPaperPdf } = await import("../../shared/card/paper-pdf");
        const bytes = await renderPaperPdf(composed.pages);
        downloadBlob(
          new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
          `${stem}.pdf`,
        );
      } else {
        const first = composed.pages[0];
        if (!first) return;
        const png = await paperToPng(composed.svg, first);
        const file = new File([png], `${stem}.png`, { type: "image/png" });
        if (kind === "share" && canShareFiles()) {
          try {
            await navigator.share({ files: [file], title: `RETURN ${tag.label}` });
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") return;
            downloadBlob(png, file.name);
            toast(t("qc.shareFallback"));
          }
        } else {
          downloadBlob(png, file.name);
          if (kind === "share") toast(t("qc.shareFallback"));
        }
      }
      setReadyLabel(tag.label);
    } catch (e) {
      setError(t("qc.errorRender", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
      setPhase(null);
    }
  }

  const ready = Boolean(item && preview?.ok);
  const share = shareable && coarse;
  const proofHost = preview?.ok && preview.composed.proof ? hostOf(preview.tag.url) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <ItemStep itemId={itemId} detail={detail} onChoose={chooseItem} onCreated={chooseItem} />

        {item ? (
          <>
            <Section title={t("qc.tagStep")}>
              {existing ? (
                <RadioGroup
                  legend={t("qc.tag")}
                  legendHidden
                  value={choice}
                  onChange={setChoiceState}
                  options={[
                    {
                      value: "existing",
                      label: t("qc.useTag", { label: existing.label }),
                      description: t("qc.useTagDesc"),
                    },
                    { value: "new", label: t("qc.newTag"), description: t("qc.newTagDesc") },
                  ]}
                />
              ) : (
                <div className="flex items-start gap-3 rounded-control bg-primary-tint/60 px-3.5 py-3">
                  <Icon name="tag" className="mt-0.5 size-5 shrink-0 text-primary-text" />
                  <div>
                    <p className="text-body font-medium">{t("qc.newTag")}</p>
                    <p className="text-footnote text-muted">{t("qc.newTagDesc")}</p>
                  </div>
                </div>
              )}
            </Section>

            <Section title={t("qc.cardStep")}>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <p aria-hidden="true" className="text-subhead font-medium">
                    {t("qc.paper")}
                  </p>
                  <SegmentedControl
                    label={t("qc.paper")}
                    block
                    value={paper}
                    onChange={setPaper}
                    options={[
                      { value: "a4", label: t("qc.paperA4") },
                      { value: "letter", label: t("qc.paperLetter") },
                    ]}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <p aria-hidden="true" className="text-subhead font-medium">
                    {t("qc.copies")}
                  </p>
                  <SegmentedControl
                    label={t("qc.copies")}
                    block
                    value={copies}
                    onChange={setCopies}
                    options={[
                      { value: "1", label: t("qc.copiesOne") },
                      { value: "2", label: t("qc.copiesTwo") },
                    ]}
                  />
                </div>
                <Select
                  className="max-sm:col-span-2"
                  label={t("qc.language")}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language)}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {LANGUAGE_NAMES[l]}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-col gap-1.5 max-sm:col-span-2">
                  <p aria-hidden="true" className="text-subhead font-medium">
                    {t("qc.colour")}
                  </p>
                  <SegmentedControl
                    label={t("qc.colour")}
                    block
                    value={theme}
                    onChange={setTheme}
                    options={CARD_THEMES.map((c) => ({ value: c, label: t(`theme.card.${c}` as const) }))}
                  />
                </div>
              </div>
            </Section>

            <Section title={t("qc.previewTitle")}>
              {preview?.ok ? (
                <>
                  <img
                    src={svgDataUrl(preview.composed.svg)}
                    alt={t("qc.previewAlt", {
                      n: options.copies,
                      paper: paper === "a4" ? t("qc.paperA4") : t("qc.paperLetter"),
                    })}
                    width={paper === "a4" ? 210 : 215.9}
                    height={paper === "a4" ? 297 : 279.4}
                    className={cx(
                      "mx-auto block h-auto w-full max-w-xs rounded-lg bg-white shadow-float ring-1 ring-black/5",
                      paper === "a4" ? "aspect-[210/297]" : "aspect-[215.9/279.4]",
                    )}
                  />
                  <div className="flex flex-wrap gap-2">
                    {proofHost ? <StatusPill tone="warning">{t("qc.proof")}</StatusPill> : null}
                    <StatusPill tone="info">
                      {t("qc.qr", {
                        size: preview.composed.pages[0]?.units[0]?.card.meta.qr.sizeMm.toFixed(0) ?? "",
                      })}
                    </StatusPill>
                  </div>
                  {proofHost ? (
                    <p className="text-footnote text-muted">{t("qc.proofBody", { hosts: proofHost })}</p>
                  ) : null}
                  <p className="text-footnote text-muted">
                    {t("qc.previewNote")} {usingExisting ? "" : t("qc.previewPlaceholder")}
                  </p>
                </>
              ) : preview ? (
                <FormError message={t("qc.errorRender", { message: preview.message })} />
              ) : null}
            </Section>
          </>
        ) : null}

        <div aria-live="polite" role="status" className="empty:hidden">
          {busy ? (
            <p className="flex items-center gap-2 text-subhead text-muted">
              {phase === "tag" ? t("qc.creatingTag") : t("qc.working")}
            </p>
          ) : readyLabel ? (
            <p className="flex items-center gap-2 rounded-control bg-success-tint px-3.5 py-2.5 text-subhead font-medium text-success">
              <Icon name="check" className="size-4 shrink-0" />
              {t("qc.ready", { label: readyLabel })}
            </p>
          ) : null}
        </div>
        <FormError message={error} />
      </SheetBody>

      <SheetFooter>
        {share ? (
          <>
            <Button
              icon="download"
              disabled={!ready || busy !== null}
              loading={busy === "pdf"}
              onClick={() => void exportAs("pdf")}
            >
              {t("qc.downloadPdf")}
            </Button>
            <Button
              icon="photo"
              disabled={!ready || busy !== null}
              loading={busy === "png"}
              onClick={() => void exportAs("png")}
            >
              {t("qc.downloadPng")}
            </Button>
            <Button
              variant="primary"
              icon="share"
              disabled={!ready || busy !== null}
              loading={busy === "share"}
              onClick={() => void exportAs("share")}
            >
              {t("qc.share")}
            </Button>
          </>
        ) : (
          <>
            <Button
              icon="photo"
              disabled={!ready || busy !== null}
              loading={busy === "png"}
              onClick={() => void exportAs("png")}
            >
              {t("qc.downloadPng")}
            </Button>
            <Button
              variant="primary"
              icon="download"
              disabled={!ready || busy !== null}
              loading={busy === "pdf"}
              onClick={() => void exportAs("pdf")}
            >
              {t("qc.downloadPdf")}
            </Button>
          </>
        )}
      </SheetFooter>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Step 1: the item. Search the list, or create one with just a name. Collapses to one row once chosen. */
function ItemStep({
  itemId,
  detail,
  onChoose,
  onCreated,
}: {
  itemId: string | null;
  detail: ReturnType<typeof useResource<ItemDetail>>;
  onChoose: (id: string | null) => void;
  onCreated: (id: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 200);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const items = useResource<ItemSummary[]>(itemId ? null : `qc-items${dq}`, async (signal) => {
    const res = await api.get<{ items: ItemSummary[] }>(`/items${qs({ q: dq })}`, signal);
    return res.items;
  });

  if (itemId) {
    if (detail.state.status === "loading") return <LoadingBlock variant="rows" rows={1} />;
    if (detail.state.status === "error")
      return <ErrorState compact error={detail.state.error} onRetry={() => detail.reload()} />;
    const { item, tags } = detail.state.data;
    const active = tags.filter((x) => x.status === "active").length;
    return (
      <Section title={t("qc.itemStep")}>
        <List label={t("qc.itemStep")}>
          <ListRow
            onClick={() => onChoose(null)}
            chevron={false}
            leading={<Thumb category={item.category} size="sm" />}
            title={item.name}
            subtitle={active > 0 ? t("item.tagCount", { n: active }) : t("qc.noTag")}
            trailing={<span className="font-semibold text-primary-text">{t("qc.change")}</span>}
          />
        </List>
      </Section>
    );
  }

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("itemForm.nameRequired"));
      return;
    }
    setNameError(null);
    setFormError(null);
    setPending(true);
    try {
      const item = await api.post<Item>("/items", { name: trimmed, category: "other" });
      notifyDataChanged();
      toast(t("qc.itemCreated"));
      onCreated(item.id);
    } catch (e) {
      setFormError(errorMessage(e, t));
    } finally {
      setPending(false);
    }
  };

  const list = items.state.status === "ready" ? items.state.data : [];
  return (
    <Section title={t("qc.itemStep")}>
      {creating ? (
        <div className="flex flex-col gap-3 rounded-card bg-sunken p-4">
          <TextInput
            label={t("qc.newItemName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void create();
              }
            }}
            error={nameError ?? undefined}
            hint={t("qc.newItemHint")}
            maxLength={120}
            autoFocus
          />
          <FormError message={formError} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon="plus" loading={pending} onClick={() => void create()}>
              {t("qc.newItemCreate")}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t("qc.newItemCancel")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <SearchField
            label={t("qc.findItem")}
            clearLabel={t("common.clear")}
            value={q}
            onChange={setQ}
            placeholder={t("qc.findPlaceholder")}
          />
          {items.state.status === "loading" ? <LoadingBlock variant="rows" rows={3} /> : null}
          {items.state.status === "error" ? (
            <ErrorState compact error={items.state.error} onRetry={() => items.reload()} />
          ) : null}
          {items.state.status === "ready" ? (
            <List label={t("qc.items")}>
              {list.slice(0, VISIBLE_ITEMS).map((i) => (
                <ListRow
                  key={i.id}
                  onClick={() => onChoose(i.id)}
                  chevron={false}
                  leading={<Thumb src={i.coverPhotoUrl} category={i.category} size="sm" />}
                  title={i.name}
                  subtitle={[i.brand, i.model].filter(Boolean).join(" · ") || undefined}
                  trailing={i.tagCount > 0 ? t("item.tagCount", { n: i.tagCount }) : t("qc.noTag")}
                />
              ))}
              <ListRow
                onClick={() => {
                  setName(q.trim());
                  setCreating(true);
                }}
                chevron={false}
                tone="primary"
                leading={
                  <IconTile>
                    <Icon name="plus" className="size-5" />
                  </IconTile>
                }
                title={t("qc.newItem")}
              />
            </List>
          ) : null}
          {items.state.status === "ready" && list.length > VISIBLE_ITEMS ? (
            <p className="text-footnote text-muted">{t("qc.moreItems", { n: VISIBLE_ITEMS })}</p>
          ) : null}
          {items.state.status === "ready" && list.length === 0 && !dq ? (
            <p className="text-subhead text-muted">{t("qc.noItems")}</p>
          ) : null}
          <p className="text-footnote text-muted">{t("qc.pickItem")}</p>
        </>
      )}
    </Section>
  );
}
