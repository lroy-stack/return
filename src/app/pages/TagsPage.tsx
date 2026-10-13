import { type FormEvent, useEffect, useState } from "react";
import { type ItemSummary, type Tag, tagCreateSchema } from "../../shared/schemas";
import { itemOptions } from "../components/item-options";
import { NfcBadge, TagSheet, TagStatusBadge } from "../components/TagSheet";
import { ApiRequestError, api, qs } from "../lib/api";
import { useDataChanged } from "../lib/data-events";
import { emptyToNull, type FieldErrors, useDirty, validate } from "../lib/forms";
import { useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { navigate, useLocation } from "../lib/router";
import { useFormat } from "../lib/settings-context";
import { Button, ButtonLink } from "../ui/Button";
import { Section } from "../ui/Card";
import { Checkbox, FormError, SegmentedControl, TextInput } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { IconTile, List, ListRow } from "../ui/List";
import { PageHeader, Toolbar } from "../ui/Page";
import { Combobox } from "../ui/Select";
import { Sheet, SheetBody, SheetFooter, useSheetGuard } from "../ui/Sheet";
import { EmptyState, ErrorState, LoadingBlock } from "../ui/States";
import { useToast } from "../ui/Toast";

type Filter = "active" | "revoked" | "";

export function TagsPage() {
  const t = useT();
  const format = useFormat();
  const { search } = useLocation();
  const [filter, setFilter] = useState<Filter>("active");
  const [creating, setCreating] = useState(search.get("new") === "1" || search.has("itemId"));
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const res = useResource<Tag[]>(
    `tags-${filter}`,
    async (signal) => (await api.get<{ tags: Tag[] }>(`/tags${qs({ status: filter })}`, signal)).tags,
  );
  useDataChanged(() => res.reload(true));
  const tags = res.state.status === "ready" ? res.state.data : [];
  const open = tags.find((x) => x.id === openId) ?? null;
  const selectable = tags.filter((x) => x.status === "active");
  const allSelected = selectable.length > 0 && selectable.every((x) => selected.has(x.id));

  // Drop selections that disappeared (revoked, filtered out).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(tags.map((x) => x.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tags]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title={t("nav.tags")}
        subtitle={t("tags.subtitle")}
        actions={
          <>
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              {t("tags.new")}
            </Button>
            <ButtonLink to="/api/tags/export.csv" download="return-tags.csv" icon="download">
              {t("tags.exportCsv")}
            </ButtonLink>
          </>
        }
      />

      <Section collapsible title={t("tags.nfcHelpTitle")} className="mb-6">
        <div className="space-y-2 text-subhead text-muted">
          <p>{t("nfc.help")}</p>
          <p>{t("tags.nfcHelpSteps")}</p>
        </div>
      </Section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label={t("tags.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: t("tag.active") },
            { value: "revoked", label: t("tag.revoked") },
            { value: "", label: t("inventory.all") },
          ]}
        />
        {selectable.length > 0 ? (
          <Checkbox
            label={t("tags.selectAll")}
            checked={allSelected}
            onChange={(on) => setSelected(on ? new Set(selectable.map((x) => x.id)) : new Set())}
          />
        ) : null}
      </div>

      {res.state.status === "loading" ? (
        <LoadingBlock variant="rows" rows={5} />
      ) : res.state.status === "error" ? (
        <ErrorState error={res.state.error} onRetry={() => res.reload()} />
      ) : tags.length === 0 ? (
        <EmptyState
          icon="tag"
          title={t("tags.emptyTitle")}
          action={
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              {t("tags.new")}
            </Button>
          }
        >
          {t("tags.emptyBody")}
        </EmptyState>
      ) : (
        <List label={t("nav.tags")} className={selected.size > 0 ? "mb-20" : undefined}>
          {tags.map((tag) => (
            <ListRow
              key={tag.id}
              onClick={() => setOpenId(tag.id)}
              chevron
              className={tag.status === "revoked" ? "opacity-70" : undefined}
              select={
                tag.status === "active"
                  ? {
                      checked: selected.has(tag.id),
                      onChange: () => toggle(tag.id),
                      label: t("tags.select", { label: tag.label }),
                    }
                  : "spacer"
              }
              leading={
                <IconTile tone={tag.status === "revoked" ? "neutral" : "primary"}>
                  <Icon name="qr" className="size-5" />
                </IconTile>
              }
              title={tag.label}
              subtitle={`${tag.itemName ?? t("tag.unassigned")}${tag.note ? ` · ${tag.note}` : ""}`}
              description={tag.lastSeenAt ? format.relative(tag.lastSeenAt) : t("tag.neverSeen")}
              trailing={
                <>
                  <TagStatusBadge tag={tag} />
                  {tag.nfcStatus !== "none" ? <NfcBadge status={tag.nfcStatus} /> : null}
                </>
              }
            />
          ))}
        </List>
      )}

      {selected.size > 0 ? (
        <Toolbar floating label={t("tags.printHint")}>
          <p className="font-semibold" role="status">
            {t("tags.selected", { n: selected.size })}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              {t("common.clear")}
            </Button>
            <Button
              variant="primary"
              icon="print"
              onClick={() => navigate(`/tags/print?ids=${[...selected].join(",")}`)}
            >
              {t("tags.printCards")}
            </Button>
          </div>
        </Toolbar>
      ) : null}

      <TagSheet tag={open} onClose={() => setOpenId(null)} onChanged={() => res.reload(true)} />
      <NewTagsSheet
        open={creating}
        presetItemId={search.get("itemId")}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setFilter("active");
          res.reload(true);
          setSelected(new Set(created.map((x) => x.id)));
        }}
      />
    </>
  );
}

function NewTagsSheet({
  open,
  presetItemId,
  onClose,
  onCreated,
}: {
  open: boolean;
  presetItemId: string | null;
  onClose: () => void;
  onCreated: (tags: Tag[]) => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("tags.new")} description={t("tags.newDesc")}>
      <NewTagsForm presetItemId={presetItemId} onClose={onClose} onCreated={onCreated} />
    </Sheet>
  );
}

function NewTagsForm({
  presetItemId,
  onClose,
  onCreated,
}: {
  presetItemId: string | null;
  onClose: () => void;
  onCreated: (tags: Tag[]) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [count, setCount] = useState("1");
  const [itemId, setItemId] = useState(presetItemId ?? "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const cancel = useSheetGuard(useDirty({ count, itemId, note }));
  const items = useResource<ItemSummary[]>(
    "newtag-items",
    async (signal) => (await api.get<{ items: ItemSummary[] }>("/items", signal)).items,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { count: Number(count), itemId: itemId || null, note: emptyToNull(note) };
    const v = validate(tagCreateSchema, body);
    if (!v.ok) return setErrors({ ...v.errors, count: v.errors.count ? t("tags.countInvalid") : "" });
    setErrors({});
    setPending(true);
    try {
      const res = await api.post<{ tags: Tag[] }>("/tags", body);
      toast(t("tags.created", { n: res.tags.length }));
      onCreated(res.tags);
      onClose();
      if (
        new URLSearchParams(window.location.search).has("new") ||
        new URLSearchParams(window.location.search).has("itemId")
      )
        navigate("/tags", { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError(t("error.generic"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <TextInput
          label={t("tags.count")}
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          error={errors.count || undefined}
          hint={t("tags.countHint")}
          autoFocus
        />
        <Combobox
          label={t("tags.forItem")}
          options={itemOptions(
            items.state.status === "ready" ? items.state.data : [],
            t,
            t("tag.unassigned"),
          )}
          value={itemId}
          onChange={setItemId}
          hint={t("tags.forItemHint")}
          disabled={items.state.status === "loading"}
        />
        <TextInput
          label={t("tag.note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={errors.note}
          maxLength={200}
        />
        <FormError message={formError} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={cancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>
          {t("tags.create")}
        </Button>
      </SheetFooter>
    </form>
  );
}
