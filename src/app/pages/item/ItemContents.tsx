import { useState } from "react";
import type { ItemDetail, ItemSummary } from "../../../shared/schemas";
import { ItemCard } from "../../components/ItemCard";
import { api, qs } from "../../lib/api";
import { useDebounced, useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { Card, SectionHeading } from "../../ui/Card";
import { Sheet, SheetBody } from "../../ui/Sheet";
import { ErrorState, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";

export function ItemContents({ detail, onChanged }: { detail: ItemDetail; onChanged: () => void }) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  return (
    <Card aria-labelledby="sec-contents">
      <SectionHeading
        id="sec-contents"
        title={t("contents.title")}
        description={t("contents.desc")}
        actions={
          <Button size="sm" icon="plus" onClick={() => setPicking(true)}>
            {t("contents.add")}
          </Button>
        }
      />
      {detail.children.length === 0 ? (
        <p className="text-muted">{t("contents.empty")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {detail.children.map((c) => (
            <ItemCard key={c.id} item={c} />
          ))}
        </ul>
      )}
      <PickItemSheet open={picking} parent={detail} onClose={() => setPicking(false)} onChanged={onChanged} />
    </Card>
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
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pick-q" className="text-sm font-medium">
          {t("inventory.search")}
        </label>
        <input
          id="pick-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="block min-h-11 w-full rounded-xl border border-line-strong bg-raised px-3"
        />
      </div>
      {items.state.status === "loading" ? <LoadingBlock rows={2} /> : null}
      {items.state.status === "error" ? (
        <ErrorState error={items.state.error} onRetry={() => items.reload()} />
      ) : null}
      {items.state.status === "ready" && candidates.length === 0 ? (
        <p className="text-muted">{t("inventory.noResults")}</p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {candidates.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => pick(i.id)}
              className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-sunken"
            >
              <span className="min-w-0 truncate font-medium">{i.name}</span>
              <span className="text-sm text-muted">
                {busy === i.id ? t("common.loading") : t(`category.${i.category}` as const)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p role="alert" className="text-sm font-medium text-danger empty:hidden">
        {error}
      </p>
    </SheetBody>
  );
}
