import { useState } from "react";
import type { ItemDetail, ItemSummary } from "../../../shared/schemas";
import { api, qs } from "../../lib/api";
import { useDebounced, useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Section } from "../../ui/Card";
import { SearchField } from "../../ui/Field";
import { List, ListRow } from "../../ui/List";
import { Sheet, SheetBody } from "../../ui/Sheet";
import { ErrorState, LoadingBlock } from "../../ui/States";
import { Thumb } from "../../ui/Thumb";
import { useToast } from "../../ui/Toast";

export function ItemContents({
  detail,
  onChanged,
  className,
}: {
  detail: ItemDetail;
  onChanged: () => void;
  className?: string;
}) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const n = detail.children.length;
  return (
    <>
      <Section
        id="sec-contents"
        className={className}
        collapsible
        title={t("contents.title")}
        description={t("contents.desc")}
        summary={n > 0 ? t("contents.count", { n }) : t("common.none")}
        actions={
          <Button size="sm" variant="tinted" icon="plus" onClick={() => setPicking(true)}>
            {t("contents.add")}
          </Button>
        }
      >
        {n === 0 ? (
          <p className="text-subhead text-muted">{t("contents.empty")}</p>
        ) : (
          <List variant="plain" label={t("contents.title")}>
            {detail.children.map((c) => (
              <ItemRow key={c.id} item={c} to={`/items/${c.id}`} />
            ))}
          </List>
        )}
      </Section>
      <PickItemSheet open={picking} parent={detail} onClose={() => setPicking(false)} onChanged={onChanged} />
    </>
  );
}

function ItemRow({ item, to, onClick }: { item: ItemSummary; to?: string; onClick?: () => void }) {
  const t = useT();
  return (
    <ListRow
      to={to}
      onClick={onClick}
      chevron={Boolean(to)}
      flush={Boolean(to)}
      leading={<Thumb src={item.coverPhotoUrl} category={item.category} size="sm" />}
      title={item.name}
      subtitle={
        [item.brand, item.model].filter(Boolean).join(" · ") || t(`category.${item.category}` as const)
      }
    />
  );
}

function PickItemSheet({
  open,
  parent,
  onClose,
  onChanged,
}: {
  open: boolean;
  parent: ItemDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("contents.pickTitle")} description={t("contents.pickDesc")}>
      <PickList parent={parent} onClose={onClose} onChanged={onChanged} />
    </Sheet>
  );
}

function PickList({
  parent,
  onClose,
  onChanged,
}: {
  parent: ItemDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 200);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = useResource<ItemSummary[]>(
    `pick${dq}`,
    async (signal) => (await api.get<{ items: ItemSummary[] }>(`/items${qs({ q: dq })}`, signal)).items,
  );
  const childIds = new Set(parent.children.map((c) => c.id));

  const pick = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await api.patch(`/items/${id}`, { parentId: parent.item.id });
      toast(t("contents.added"));
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error.generic"));
    } finally {
      setBusy(null);
    }
  };

  const candidates =
    items.state.status === "ready"
      ? items.state.data.filter((i) => i.id !== parent.item.id && !childIds.has(i.id))
      : [];
  return (
    <SheetBody>
      <SearchField
        label={t("inventory.search")}
        clearLabel={t("common.clear")}
        value={q}
        onChange={setQ}
        placeholder={t("inventory.searchPlaceholder")}
      />
      {items.state.status === "loading" ? <LoadingBlock variant="rows" rows={3} /> : null}
      {items.state.status === "error" ? (
        <ErrorState error={items.state.error} onRetry={() => items.reload()} />
      ) : null}
      {items.state.status === "ready" && candidates.length === 0 ? (
        <p className="text-subhead text-muted">{t("inventory.noResults")}</p>
      ) : null}
      {candidates.length > 0 ? (
        <List label={t("contents.pickTitle")}>
          {candidates.map((i) => (
            <ItemRow key={i.id} item={i} onClick={busy === null ? () => void pick(i.id) : undefined} />
          ))}
        </List>
      ) : null}
      <p role="alert" className="text-subhead font-medium text-danger empty:hidden">
        {error}
      </p>
    </SheetBody>
  );
}
