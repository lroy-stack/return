import { type FormEvent, useEffect, useState } from "react";
import { type ItemSummary, type Tag, tagCreateSchema } from "../../shared/schemas";
import { NfcBadge, TagSheet, TagStatusBadge } from "../components/TagSheet";
import { ApiRequestError, api, qs } from "../lib/api";
import { emptyToNull, type FieldErrors, validate } from "../lib/forms";
import { useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { Link, navigate, useLocation } from "../lib/router";
import { useFormat } from "../lib/settings-context";
import { Button, ButtonLink } from "../ui/Button";
import { Checkbox, FormError, Select, TextInput } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { PageHeader } from "../ui/Page";
import { Sheet, SheetBody, SheetFooter } from "../ui/Sheet";
import { EmptyState, ErrorState, LoadingBlock } from "../ui/States";
import { Chip } from "../ui/Tabs";
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

      <details className="mb-5 rounded-card border border-line bg-raised px-4 py-1 shadow-card">
        <summary className="flex min-h-11 items-center gap-2 font-medium">
          <Icon name="info" className="size-5 text-primary-text" />
          {t("tags.nfcHelpTitle")}
        </summary>
        <div className="space-y-2 pb-3 text-sm text-muted">
          <p>{t("nfc.help")}</p>
          <p>{t("tags.nfcHelpSteps")}</p>
        </div>
      </details>

      <fieldset className="mb-4 flex min-w-0 flex-wrap items-center gap-2">
        <legend className="sr-only">{t("tags.filter")}</legend>
        <Chip pressed={filter === "active"} onClick={() => setFilter("active")}>
          {t("tag.active")}
        </Chip>
        <Chip pressed={filter === "revoked"} onClick={() => setFilter("revoked")}>
          {t("tag.revoked")}
        </Chip>
        <Chip pressed={filter === ""} onClick={() => setFilter("")}>
          {t("inventory.all")}
        </Chip>
        {selectable.length > 0 ? (
          <Checkbox
            className="ml-auto"
            label={t("tags.selectAll")}
            checked={allSelected}
            onChange={(on) => setSelected(on ? new Set(selectable.map((x) => x.id)) : new Set())}
          />
        ) : null}
      </fieldset>

      {res.state.status === "loading" ? (
        <LoadingBlock />
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
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-raised shadow-card">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className={`flex items-center gap-1 pr-2 pl-1 ${tag.status === "revoked" ? "opacity-70" : ""}`}
            >
              {tag.status === "active" ? (
                <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className="size-5 accent-primary"
                    checked={selected.has(tag.id)}
                    onChange={() => toggle(tag.id)}
                  />
                  <span className="sr-only">{t("tags.select", { label: tag.label })}</span>
                </label>
              ) : (
                <span className="size-11 shrink-0" aria-hidden="true" />
              )}
              <button
                type="button"
                onClick={() => setOpenId(tag.id)}
                className="grid min-h-16 min-w-0 flex-1 items-center gap-x-4 gap-y-1 rounded-lg px-2 py-2 text-left hover:bg-sunken md:grid-cols-[9rem_1fr_auto_8rem]"
              >
                <span className="font-semibold">{tag.label}</span>
                <span className="min-w-0 truncate text-sm text-muted">
                  {tag.itemName ?? t("tag.unassigned")}
                  {tag.note ? ` · ${tag.note}` : ""}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <TagStatusBadge tag={tag} />
                  <NfcBadge status={tag.nfcStatus} />
                </span>
                <span className="text-sm text-muted md:text-right">
                  {tag.lastSeenAt ? format.relative(tag.lastSeenAt) : t("tag.neverSeen")}
                </span>
              </button>
              {tag.itemId ? (
                <Link
                  to={`/items/${tag.itemId}`}
                  className="hidden size-11 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-fg sm:inline-flex"
                  aria-label={t("tag.openItem")}
                >
                  <Icon name="external" className="size-4" />
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {selected.size > 0 ? (
        <div className="no-print fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-line bg-raised p-3 shadow-float lg:bottom-6">
          <p className="pl-1 font-medium" role="status">
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
        </div>
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
        <Select
          label={t("tags.forItem")}
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          hint={t("tags.forItemHint")}
          disabled={items.state.status === "loading"}
        >
          <option value="">{t("tag.unassigned")}</option>
          {items.state.status === "ready"
            ? items.state.data.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))
            : null}
        </Select>
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
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>
          {t("tags.create")}
        </Button>
      </SheetFooter>
    </form>
  );
}
