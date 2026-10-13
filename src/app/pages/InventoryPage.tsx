import { useEffect, useState } from "react";
import { ITEM_CATEGORIES, type ItemCategory, type ItemStatus, type ItemSummary } from "../../shared/schemas";
import { ItemCard } from "../components/ItemCard";
import { ItemFormSheet } from "../components/ItemFormSheet";
import { api, qs } from "../lib/api";
import { useDebounced, useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useOverview } from "../lib/overview-context";
import { Link, navigate, useLocation } from "../lib/router";
import { Button, ButtonLink } from "../ui/Button";
import { Select } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { PageHeader } from "../ui/Page";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";
import { Chip } from "../ui/Tabs";

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

function AttentionStrip() {
  const t = useT();
  const { state } = useOverview();
  if (state.status !== "ready") return null;
  const { unreadConversations, lostItems, openRecoveries } = state.data;
  const parts: { to: string; text: string }[] = [];
  if (unreadConversations.length > 0)
    parts.push({ to: "/conversations", text: t("attention.unread", { n: unreadConversations.length }) });
  if (lostItems.length > 0) {
    const first = lostItems[0];
    parts.push({
      to: lostItems.length === 1 && first ? `/items/${first.id}` : "/?status=lost",
      text: t("attention.lost", { n: lostItems.length }),
    });
  }
  if (openRecoveries.length > 0) {
    const first = openRecoveries[0];
    parts.push({
      to: first ? `/items/${first.itemId}` : "/",
      text: t("attention.recoveries", { n: openRecoveries.length }),
    });
  }
  if (parts.length === 0) return null;
  return (
    <section
      aria-label={t("attention.title")}
      className="mb-5 flex flex-col gap-2 rounded-card border border-lost/40 bg-lost-tint p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4"
    >
      <h2 className="flex items-center gap-2 px-1 font-semibold text-lost">
        <Icon name="alert" />
        {t("attention.title")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {parts.map((p) => (
          <li key={p.to + p.text}>
            <Link
              to={p.to}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-raised px-3.5 text-sm font-medium text-fg shadow-card hover:bg-sunken"
            >
              {p.text}
              <Icon name="chevron" className="size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InventoryPage() {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const { search } = useLocation();
  const urlStatus = search.get("status") === "lost" ? "lost" : "";
  const [status, setStatus] = useState<ItemStatus | "">(urlStatus);
  useEffect(() => {
    setStatus(urlStatus);
  }, [urlStatus]);
  const [category, setCategory] = useState<ItemCategory | "">("");
  const [archived, setArchived] = useState(false);
  const dq = useDebounced(q.trim(), 250);
  const filtered = Boolean(dq || status || category || archived);

  const query = qs({ q: dq, status, category, archived: archived ? "true" : "" });
  const items = useResource<ItemSummary[]>(`items${query}`, async (signal) => {
    const res = await api.get<{ items: ItemSummary[] }>(`/items${query}`, signal);
    return res.items;
  });
  const overview = useOverview();

  const resultsText =
    items.state.status === "ready" ? t("inventory.results", { n: items.state.data.length }) : "";

  return (
    <>
      <PageHeader
        title={t("nav.inventory")}
        subtitle={t("inventory.subtitle")}
        actions={
          <>
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              {t("inventory.addItem")}
            </Button>
            <ButtonLink to="/tags?new=1" icon="tag">
              {t("inventory.newTag")}
            </ButtonLink>
          </>
        }
      />
      <AttentionStrip />

      <search className="mb-5 flex flex-col gap-3">
        <div className="relative">
          <label htmlFor="inv-search" className="sr-only">
            {t("inventory.search")}
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
          />
          <input
            id="inv-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("inventory.searchPlaceholder")}
            className="block min-h-12 w-full rounded-xl border border-line-strong bg-raised pr-3 pl-11 text-fg placeholder:text-muted/80"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip pressed={status === ""} onClick={() => setStatus("")}>
            {t("inventory.all")}
          </Chip>
          <Chip pressed={status === "lost"} onClick={() => setStatus(status === "lost" ? "" : "lost")}>
            <Icon name="alert" className="size-4" />
            {t("item.lost")}
          </Chip>
          <Chip pressed={archived} onClick={() => setArchived(!archived)}>
            {t("inventory.showArchived")}
          </Chip>
          <div className="w-full sm:ml-auto sm:w-56">
            <Select
              label={t("itemForm.category")}
              value={category}
              onChange={(e) => setCategory(e.target.value as ItemCategory | "")}
              className="[&>label]:sr-only"
            >
              <option value="">{t("inventory.allCategories")}</option>
              {ITEM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`category.${c}` as const)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </search>
      <p className="sr-only" role="status" aria-live="polite">
        {resultsText}
      </p>

      {items.state.status === "loading" ? (
        <div
          className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4"
          role="status"
          aria-label={t("common.loading")}
        >
          {SKELETON_KEYS.map((k) => (
            <Skeleton key={k} className="aspect-[4/5]" />
          ))}
        </div>
      ) : items.state.status === "error" ? (
        <ErrorState error={items.state.error} onRetry={() => items.reload()} />
      ) : items.state.data.length === 0 ? (
        filtered ? (
          <EmptyState icon="search" title={t("inventory.noResults")}>
            {t("inventory.noResultsHint")}
          </EmptyState>
        ) : (
          <EmptyState
            title={t("inventory.emptyTitle")}
            action={
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                {t("inventory.addItem")}
              </Button>
            }
          >
            {t("inventory.emptyBody")}
          </EmptyState>
        )
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {items.state.data.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        aria-label={t("inventory.addItem")}
        className="no-print fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-float hover:bg-primary-hover lg:hidden"
      >
        <Icon name="plus" className="size-6" />
      </button>

      <ItemFormSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(item) => {
          overview.reload(true);
          navigate(`/items/${item.id}`);
        }}
      />
    </>
  );
}
