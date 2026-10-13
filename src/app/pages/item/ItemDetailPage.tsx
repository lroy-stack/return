import { type FormEvent, useState } from "react";
import { type Item, type ItemDetail, itemPatchSchema, type Recovery } from "../../../shared/schemas";
import { ItemFormSheet } from "../../components/ItemFormSheet";
import { ApiRequestError, api } from "../../lib/api";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useOverview } from "../../lib/overview-context";
import { Link, navigate } from "../../lib/router";
import { useFormat } from "../../lib/settings-context";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card, SectionHeading } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { FormError, TextInput } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/Page";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { ErrorState, errorMessage, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { Gallery } from "./Gallery";
import { ItemContents } from "./ItemContents";
import { ItemTags } from "./ItemTags";
import { ItemTrackers } from "./ItemTrackers";
import { MarkLostSheet, MarkRecoveredSheet, RecoverySheet } from "./LostSheets";
import { PrivateSection } from "./PrivateSection";
import { PublicPageSheet } from "./PublicPageSheet";

function ParentLink({ parentId }: { parentId: string }) {
  const t = useT();
  const parent = useResource<Item>(`parent-${parentId}`, (signal) =>
    api.get<ItemDetail>(`/items/${parentId}`, signal).then((d) => d.item),
  );
  if (parent.state.status !== "ready") return null;
  return (
    <p className="text-sm text-muted">
      {t("item.insideOf")}{" "}
      <Link to={`/items/${parentId}`} className="font-medium text-primary-text underline">
        {parent.state.data.name}
      </Link>
    </p>
  );
}

export function ItemDetailPage({ id }: { id: string }) {
  const t = useT();
  const res = useResource<ItemDetail>(`item-${id}`, (signal) => api.get<ItemDetail>(`/items/${id}`, signal));
  const overview = useOverview();
  const reload = () => {
    res.reload(true);
    overview.reload(true);
  };

  if (res.state.status === "loading") {
    return (
      <>
        <PageHeader title={t("common.loading")} back={{ to: "/", label: t("nav.inventory") }} />
        <LoadingBlock rows={4} />
      </>
    );
  }
  if (res.state.status === "error") {
    const notFound = res.state.error.status === 404;
    return (
      <>
        <PageHeader
          title={notFound ? t("item.notFound") : t("error.title")}
          back={{ to: "/", label: t("nav.inventory") }}
        />
        <ErrorState error={res.state.error} onRetry={notFound ? undefined : () => res.reload()} />
      </>
    );
  }
  return <ItemView detail={res.state.data} onChanged={reload} />;
}

function ItemView({ detail, onChanged }: { detail: ItemDetail; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const format = useFormat();
  const { item } = detail;
  const lost = item.status === "lost";
  const archived = item.archivedAt !== null;
  const [dialog, setDialog] = useState<
    "edit" | "lost" | "recovered" | "public" | "archive" | "delete" | "location" | null
  >(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const close = () => setDialog(null);
  const sub = [item.brand, item.model].filter(Boolean).join(" · ");
  const openRecovery = detail.recoveries.find((r) => r.status !== "recovered" && r.status !== "closed");

  return (
    <>
      <PageHeader
        title={item.name}
        back={{ to: "/", label: t("nav.inventory") }}
        subtitle={sub || t(`category.${item.category}` as const)}
        badges={
          <>
            {lost ? (
              <Badge tone="lost" icon="alert">
                {t("item.lost")}
              </Badge>
            ) : (
              <Badge tone="success" icon="check">
                {t("item.safe")}
              </Badge>
            )}
            {archived ? <Badge>{t("item.archived")}</Badge> : null}
          </>
        }
        actions={
          <>
            {lost ? (
              <Button variant="primary" icon="check" onClick={() => setDialog("recovered")}>
                {t("item.markRecovered")}
              </Button>
            ) : !archived ? (
              <Button variant="danger" icon="alert" onClick={() => setDialog("lost")}>
                {t("item.markLost")}
              </Button>
            ) : null}
            <Button icon="edit" onClick={() => setDialog("edit")}>
              {t("common.edit")}
            </Button>
          </>
        }
      />

      {item.parentId ? <ParentLink parentId={item.parentId} /> : null}

      {lost ? (
        <div
          role="status"
          className="mb-5 flex gap-3 rounded-card border border-lost/50 bg-lost-tint p-4 text-lost"
        >
          <Icon name="alert" className="mt-0.5" />
          <div>
            <p className="font-semibold">{t("item.lostBanner")}</p>
            {openRecovery ? (
              <p className="text-sm">
                {[openRecovery.lostPlace, openRecovery.lostAt ? format.dateTime(openRecovery.lostAt) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-sm">{t("item.lostBannerHint")}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card aria-labelledby="sec-photos">
            <h2 id="sec-photos" className="sr-only">
              {t("gallery.title")}
            </h2>
            <Gallery detail={detail} onChanged={onChanged} />
          </Card>
          <Card aria-labelledby="sec-about">
            <SectionHeading id="sec-about" title={t("item.about")} />
            {item.description ? (
              <p className="whitespace-pre-wrap">{item.description}</p>
            ) : (
              <p className="text-muted">{t("item.noDescription")}</p>
            )}
            <hr className="my-4 border-line" />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Icon name="pin" className="size-4" />
                  {t("item.lastKnown")}
                </h3>
                <p>
                  {item.lastKnownLocation ?? <span className="text-muted">{t("item.lastKnownEmpty")}</span>}
                </p>
                {item.lastKnownAt ? (
                  <p className="text-sm text-muted">{format.dateTime(item.lastKnownAt)}</p>
                ) : null}
              </div>
              <Button size="sm" icon="edit" onClick={() => setDialog("location")}>
                {t("item.setLocation")}
              </Button>
            </div>
          </Card>
          <ItemContents detail={detail} onChanged={onChanged} />
          <ItemConversations detail={detail} />
          <RecoveriesTimeline recoveries={detail.recoveries} onEdit={setRecovery} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <ItemTags detail={detail} onChanged={onChanged} />
          <ItemTrackers detail={detail} onChanged={onChanged} />
          <Card aria-labelledby="sec-public">
            <SectionHeading
              id="sec-public"
              title={t("publicPage.title")}
              description={t("publicPage.desc")}
              actions={
                <Button size="sm" icon="edit" onClick={() => setDialog("public")}>
                  {t("common.edit")}
                </Button>
              }
            />
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted">{t("publicPage.publicTitle")}</dt>
                <dd>{item.publicTitle ?? <span className="text-muted">{t("publicPage.useName")}</span>}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("publicPage.message")}</dt>
                <dd className="whitespace-pre-wrap">
                  {item.publicMessage ?? <span className="text-muted">{t("publicPage.defaultMessage")}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t("publicPage.reward")}</dt>
                <dd>{item.rewardText ?? <span className="text-muted">{t("common.none")}</span>}</dd>
              </div>
              <div>
                <dt className="text-muted">{t("publicPage.contact")}</dt>
                <dd>{item.contactVisibility ? t("publicPage.custom") : t("publicPage.usesDefault")}</dd>
              </div>
            </dl>
          </Card>
          <PrivateSection detail={detail} onChanged={onChanged} />
          <Card aria-labelledby="sec-manage">
            <SectionHeading id="sec-manage" title={t("item.manage")} />
            {archived ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{t("item.archivedHint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    icon="refresh"
                    onClick={async () => {
                      try {
                        await api.post(`/items/${item.id}/unarchive`);
                        toast(t("item.unarchived"));
                        onChanged();
                      } catch (e) {
                        toast(errorMessage(e, t), "error");
                      }
                    }}
                  >
                    {t("item.unarchive")}
                  </Button>
                  <Button variant="danger" icon="trash" onClick={() => setDialog("delete")}>
                    {t("item.deleteForever")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">{t("item.archiveHint")}</p>
                <div>
                  <Button icon="box" onClick={() => setDialog("archive")}>
                    {t("item.archive")}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ItemFormSheet
        open={dialog === "edit"}
        item={item}
        onClose={close}
        onSaved={() => {
          toast(t("common.saved"));
          onChanged();
        }}
      />
      <MarkLostSheet
        open={dialog === "lost"}
        itemId={item.id}
        itemName={item.name}
        onClose={close}
        onDone={onChanged}
      />
      <MarkRecoveredSheet open={dialog === "recovered"} itemId={item.id} onClose={close} onDone={onChanged} />
      <PublicPageSheet open={dialog === "public"} item={item} onClose={close} onSaved={onChanged} />
      <LocationSheet open={dialog === "location"} item={item} onClose={close} onSaved={onChanged} />
      <RecoverySheet recovery={recovery} onClose={() => setRecovery(null)} onDone={onChanged} />
      <ConfirmDialog
        open={dialog === "archive"}
        title={t("item.archiveTitle")}
        message={t("item.archiveBody")}
        confirmLabel={t("item.archive")}
        tone="primary"
        onClose={close}
        onConfirm={async () => {
          await api.post(`/items/${item.id}/archive`);
          toast(t("item.archivedToast"));
          onChanged();
        }}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title={t("item.deleteTitle")}
        message={t("item.deleteBody")}
        confirmLabel={t("item.deleteForever")}
        typed={item.name}
        typedLabel={t("item.deleteType", { name: item.name })}
        onClose={close}
        onConfirm={async () => {
          await api.delete(`/items/${item.id}`, { confirmName: item.name });
          toast(t("item.deletedToast"));
          navigate("/");
        }}
      />
    </>
  );
}

function LocationSheet({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean;
  item: Item;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("item.lastKnown")} description={t("item.locationDesc")}>
      <LocationForm item={item} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

function LocationForm({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [value, setValue] = useState(item.lastKnownLocation ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { lastKnownLocation: value.trim() || null };
    const v = itemPatchSchema.safeParse(body);
    if (!v.success) return setError(v.error.issues[0]?.message ?? t("error.generic"));
    setPending(true);
    try {
      await api.patch(`/items/${item.id}`, body);
      toast(t("common.saved"));
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("error.generic"));
    } finally {
      setPending(false);
    }
  };
  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <TextInput
          label={t("item.lastKnown")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={300}
          autoFocus
          hint={t("item.locationHint")}
        />
        <FormError message={error} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>
          {t("common.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

function ItemConversations({ detail }: { detail: ItemDetail }) {
  const t = useT();
  const format = useFormat();
  return (
    <Card aria-labelledby="sec-convs">
      <SectionHeading id="sec-convs" title={t("item.conversations")} />
      {detail.conversations.length === 0 ? (
        <p className="text-muted">{t("item.noConversations")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {detail.conversations.map((c) => (
            <li key={c.id}>
              <Link
                to={`/conversations/${c.id}`}
                className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-sunken"
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${c.unread ? "font-bold" : "font-medium"}`}>
                    {c.subject}
                  </span>
                  <span className="block truncate text-sm text-muted">{c.lastMessagePreview ?? ""}</span>
                </span>
                <span className="flex flex-col items-end gap-1 text-xs text-muted">
                  {format.relative(c.lastMessageAt)}
                  {c.unread ? (
                    <Badge tone="lost">{t("inbox.unread")}</Badge>
                  ) : (
                    <Badge>{t(`conv.status.${c.status}` as const)}</Badge>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecoveriesTimeline({
  recoveries,
  onEdit,
}: {
  recoveries: Recovery[];
  onEdit: (r: Recovery) => void;
}) {
  const t = useT();
  const format = useFormat();
  return (
    <Card aria-labelledby="sec-rec">
      <SectionHeading id="sec-rec" title={t("recovery.title")} />
      {recoveries.length === 0 ? (
        <p className="text-muted">{t("recovery.empty")}</p>
      ) : (
        <ol className="relative flex flex-col gap-4 border-l-2 border-line pl-5">
          {recoveries.map((r) => {
            const done = r.status === "recovered" || r.status === "closed";
            return (
              <li key={r.id} className="relative">
                <span
                  className={`absolute top-1.5 -left-[1.6rem] size-3 rounded-full ring-4 ring-raised ${done ? "bg-accent" : "bg-lost"}`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={done ? "success" : "lost"}>{t(`recovery.s.${r.status}` as const)}</Badge>
                  <span className="text-sm text-muted">{format.dateTime(r.lostAt ?? r.createdAt)}</span>
                </div>
                {r.lostPlace ? <p>{r.lostPlace}</p> : null}
                {r.notes ? <p className="text-sm whitespace-pre-wrap text-muted">{r.notes}</p> : null}
                {r.recoveredAt ? (
                  <p className="text-sm text-accent-text">
                    {t("recovery.recoveredOn", { when: format.dateTime(r.recoveredAt) })}
                  </p>
                ) : null}
                {!done ? (
                  <Button size="sm" className="mt-1" onClick={() => onEdit(r)}>
                    {t("recovery.update")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
