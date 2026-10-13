import { useEffect, useState } from "react";
import { ITEM_CATEGORIES, type ItemCategory, type ItemStatus, type ItemSummary } from "../../shared/schemas";
import { ItemCard } from "../components/ItemCard";
import { ItemFormSheet } from "../components/ItemFormSheet";
import { api, qs } from "../lib/api";
import { useDataChanged } from "../lib/data-events";
import { useDebounced, useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useOverview } from "../lib/overview-context";
import { navigate, useLocation } from "../lib/router";
import { Button, ButtonLink } from "../ui/Button";
import { Section } from "../ui/Card";
import { SearchField, Select } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { IconTile, List, ListRow } from "../ui/List";
import { PageHeader } from "../ui/Page";
import { EmptyState, ErrorState, Skeleton } from "../ui/States";
import { Chip } from "../ui/Tabs";

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** What needs the owner now. Neutral rows; only the lost row carries the lost colour. */
function AttentionStrip() {
  const t = useT();
  const { state } = useOverview();
  if (state.status !== "ready") return null;
  const { unreadConversations, lostItems, openRecoveries } = state.data;
  const firstLost = lostItems[0];
  const firstRecovery = openRecoveries[0];
  if (unreadConversations.length + lostItems.length + openRecoveries.length === 0) return null;
  return (
    <Section title={t("attention.title")} className="mb-6">
      <List label={t("attention.title")}>
        {unreadConversations.length > 0 ? (
          <ListRow
            to="/conversations"
            leading={
              <IconTile>
                <Icon name="inbox" className="size-5" />
              </IconTile>
            }
            title={t("attention.unread", { n: unreadConversations.length })}
          />
        ) : null}
        {lostItems.length > 0 ? (
          <ListRow
            to={lostItems.length === 1 && firstLost ? `/items/${firstLost.id}` : "/?status=lost"}
            tone="lost"
            leading={
              <IconTile tone="lost">
                <Icon name="alert" className="size-5" />
              </IconTile>
            }
            title={t("attention.lost", { n: lostItems.length })}
          />
        ) : null}
        {openRecoveries.length > 0 ? (
          <ListRow
            to={firstRecovery ? `/items/${firstRecovery.itemId}` : "/"}
            leading={
              <IconTile tone="neutral">
                <Icon name="refresh" className="size-5" />
              </IconTile>
            }
            title={t("attention.recoveries", { n: openRecoveries.length })}
          />
        ) : null}
      </List>
    </Section>
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
  // The Shell's Create sheet links here with ?new=item.
  const wantsNew = search.get("new") === "item";
  useEffect(() => {
    if (wantsNew) setCreating(true);
  }, [wantsNew]);
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
  useDataChanged(() => {
    items.reload(true);
    overview.reload(true);
  });

  const resultsText =
    items.state.status === "ready" ? t("inventory.results", { n: items.state.data.length }) : "";

  return (
    <>
      <PageHeader
        title={t("nav.inventory")}
        subtitle={t("inventory.subtitle")}
        hideActionsOnPhone
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
        <SearchField
          label={t("inventory.search")}
          clearLabel={t("common.clear")}
          value={q}
          onChange={setQ}
          placeholder={t("inventory.searchPlaceholder")}
        />
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
              labelHidden
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

      <ItemFormSheet
        open={creating}
        onClose={() => {
          setCreating(false);
          // Drop ?new=item only if we are still on it (onSaved may already have moved to the new item).
          if (window.location.pathname === "/" && window.location.search.includes("new=item"))
            navigate("/", { replace: true });
        }}
        onSaved={(item) => {
          overview.reload(true);
          navigate(`/items/${item.id}`);
        }}
      />
    </>
  );
}
