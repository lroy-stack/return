import { type FormEvent, useState } from "react";
import {
  type ConversationSummary,
  type Item,
  type ItemDetail,
  itemPatchSchema,
  type Recovery,
  type RecoveryEvent,
} from "../../../shared/schemas";
import { ItemFormSheet } from "../../components/ItemFormSheet";
import { ApiRequestError, api } from "../../lib/api";
import { useDataChanged } from "../../lib/data-events";
import { useDirty } from "../../lib/forms";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useOverview } from "../../lib/overview-context";
import { Link, navigate } from "../../lib/router";
import { useFormat } from "../../lib/settings-context";
import { Badge, StatusPill } from "../../ui/Badge";
import { Button, ButtonLink } from "../../ui/Button";
import { Card, Section } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { FormError, TextInput } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { KeyValue } from "../../ui/KeyValue";
import { IconTile, List, ListRow } from "../../ui/List";
import { Menu, type MenuEntry } from "../../ui/Menu";
import { PageHeader } from "../../ui/Page";
import { Sheet, SheetBody, SheetFooter, useSheetGuard } from "../../ui/Sheet";
import { ErrorState, errorMessage, LoadingBlock } from "../../ui/States";
import { Timeline, type TimelineEntry } from "../../ui/Timeline";
import { useToast } from "../../ui/Toast";
import { Gallery } from "./Gallery";
import { ItemContents } from "./ItemContents";
import { ItemTags } from "./ItemTags";
import { ItemTrackers } from "./ItemTrackers";
import { MarkLostSheet, MarkRecoveredSheet, RecoverySheet } from "./LostSheets";
import { PrivateSection } from "./PrivateSection";
import { PublicPageSheet } from "./PublicPageSheet";
import { ThankAndClose } from "./ThankAndClose";

function ParentLink({ parentId }: { parentId: string }) {
  const t = useT();
  const parent = useResource<Item>(`parent-${parentId}`, (signal) =>
    api.get<ItemDetail>(`/items/${parentId}`, signal).then((d) => d.item),
  );
  if (parent.state.status !== "ready") return null;
  return (
    <p className="text-subhead text-muted">
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
  useDataChanged(reload);

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
  // Conversations still open after the item was recovered: offered for a thank-you and closing.
  const [thanks, setThanks] = useState<ConversationSummary[]>([]);
  const afterRecovered = (open: ConversationSummary[]) => {
    onChanged();
    setThanks(open);
  };
  const close = () => setDialog(null);
  const actions: MenuEntry[] = [
    { key: "edit", label: t("item.editItem"), icon: "edit", onSelect: () => setDialog("edit") },
    archived
      ? {
          key: "unarchive",
          label: t("item.unarchive"),
          icon: "refresh",
          description: t("item.archivedHint"),
          onSelect: async () => {
            try {
              await api.post(`/items/${item.id}/unarchive`);
              toast(t("item.unarchived"));
              onChanged();
            } catch (e) {
              toast(errorMessage(e, t), "error");
            }
          },
        }
      : {
          key: "archive",
          label: t("item.archive"),
          icon: "box",
          description: t("item.archiveHint"),
          onSelect: () => setDialog("archive"),
        },
    ...(archived
      ? [
          { key: "sep", separator: true } as const,
          {
            key: "delete",
            label: t("item.deleteForever"),
            icon: "trash",
            tone: "danger",
            onSelect: () => setDialog("delete"),
          } as const,
        ]
      : []),
  ];
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
              <StatusPill tone="lost" pulse>
                {t("item.lost")}
              </StatusPill>
            ) : (
              <StatusPill tone="success">{t("item.safe")}</StatusPill>
            )}
            {archived ? <StatusPill>{t("item.archived")}</StatusPill> : null}
          </>
        }
        actions={
          <>
            {lost ? (
              <Button
                variant="primary"
                icon="check"
                className="max-sm:min-w-0 max-sm:flex-1 max-sm:px-3"
                onClick={() => setDialog("recovered")}
              >
                <span className="truncate">{t("item.markRecovered")}</span>
              </Button>
            ) : !archived ? (
              <Button
                variant="danger-soft"
                icon="alert"
                className="max-sm:min-w-0 max-sm:flex-1 max-sm:px-3"
                onClick={() => setDialog("lost")}
              >
                <span className="truncate">{t("item.markLost")}</span>
              </Button>
            ) : null}
            {!archived ? (
              <ButtonLink
                variant="tinted"
                icon="card"
                className="max-sm:size-11 max-sm:shrink-0 max-sm:gap-0 max-sm:px-0"
                to={`/items/${item.id}?quick-card=1`}
              >
                <span className="max-sm:sr-only">{t("quick.card")}</span>
              </ButtonLink>
            ) : null}
            <Menu label={t("item.actions")} items={actions} variant="secondary" />
          </>
        }
      />

      {item.parentId ? <ParentLink parentId={item.parentId} /> : null}

      {lost ? (
        <Card variant="lost" padding="sm" className="mb-6 flex gap-3 text-lost">
          <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
          <div role="status">
            <p className="font-semibold">{t("item.lostBanner")}</p>
            {openRecovery ? (
              <p className="text-subhead">
                {[openRecovery.lostPlace, openRecovery.lostAt ? format.dateTime(openRecovery.lostAt) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
            <p className="mt-1 text-subhead">{t("item.lostBannerHint")}</p>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <Card aria-labelledby="sec-photos" padding="sm" className="order-1">
            <h2 id="sec-photos" className="sr-only">
              {t("gallery.title")}
            </h2>
            <Gallery detail={detail} onChanged={onChanged} />
          </Card>
          <Section
            id="sec-about"
            className="order-3"
            title={t("item.about")}
            actions={
              <Button size="sm" variant="tinted" icon="edit" onClick={() => setDialog("edit")}>
                {t("common.edit")}
              </Button>
            }
          >
            <Card padding="sm" className="flex flex-col gap-3">
              {item.description ? (
                <p className="whitespace-pre-wrap">{item.description}</p>
              ) : (
                <p className="text-muted">{t("item.noDescription")}</p>
              )}
              <List variant="plain" label={t("item.whereIs")}>
                <ListRow
                  flush
                  onClick={() => setDialog("location")}
                  leading={
                    <IconTile>
                      <Icon name="pin" className="size-5" />
                    </IconTile>
                  }
                  title={item.lastKnownLocation ?? t("item.lastKnownEmpty")}
                  subtitle={
                    item.lastKnownAt
                      ? `${t("item.lastKnown")} · ${format.dateTime(item.lastKnownAt)}`
                      : t("item.lastKnown")
                  }
                  trailing={<span className="font-semibold text-primary-text">{t("item.setLocation")}</span>}
                  chevron={false}
                />
              </List>
            </Card>
          </Section>
          <ItemContents detail={detail} onChanged={onChanged} className="order-8" />
        </div>

        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <ItemTags detail={detail} onChanged={onChanged} className="order-2" />
          <ItemConversations detail={detail} className="order-4" />
          <RecoveriesTimeline
            recoveries={detail.recoveries}
            events={detail.recoveryEvents}
            onEdit={setRecovery}
            className="order-5"
          />
          <ItemTrackers detail={detail} onChanged={onChanged} className="order-6" />
          <Section
            id="sec-public"
            className="order-7"
            collapsible
            title={t("publicPage.title")}
            description={t("publicPage.summary")}
            actions={
              <Button size="sm" variant="tinted" icon="edit" onClick={() => setDialog("public")}>
                {t("common.edit")}
              </Button>
            }
          >
            <KeyValue
              entries={[
                {
                  key: "title",
                  label: t("publicPage.publicTitle"),
                  value: item.publicTitle,
                  empty: t("publicPage.useName"),
                },
                {
                  key: "message",
                  label: t("publicPage.message"),
                  value: item.publicMessage,
                  empty: t("publicPage.defaultMessage"),
                },
                {
                  key: "reward",
                  label: t("publicPage.reward"),
                  value: item.rewardText,
                  empty: t("common.none"),
                },
                {
                  key: "contact",
                  label: t("publicPage.contact"),
                  value: item.contactVisibility ? t("publicPage.custom") : t("publicPage.usesDefault"),
                },
              ]}
            />
          </Section>
          <PrivateSection
            detail={detail}
            onChanged={onChanged}
            onEdit={() => setDialog("edit")}
            className="order-9"
          />
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
      <MarkRecoveredSheet
        open={dialog === "recovered"}
        itemId={item.id}
        onClose={close}
        onDone={afterRecovered}
      />
      <PublicPageSheet open={dialog === "public"} item={item} onClose={close} onSaved={onChanged} />
      <LocationSheet open={dialog === "location"} item={item} onClose={close} onSaved={onChanged} />
      <RecoverySheet recovery={recovery} onClose={() => setRecovery(null)} onDone={afterRecovered} />
      <ThankAndClose conversations={thanks} onClose={() => setThanks([])} onClosed={onChanged} />
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
  const cancel = useSheetGuard(useDirty({ value }));
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
        <Button onClick={cancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>
          {t("common.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

function ItemConversations({ detail, className }: { detail: ItemDetail; className?: string }) {
  const t = useT();
  const format = useFormat();
  return (
    <Section id="sec-convs" className={className} title={t("item.conversations")}>
      {detail.conversations.length === 0 ? (
        <p className="rounded-card bg-sunken px-4 py-5 text-subhead text-muted">
          {t("item.noConversations")}
        </p>
      ) : (
        <List label={t("item.conversations")}>
          {detail.conversations.map((c) => (
            <ListRow
              key={c.id}
              to={`/conversations/${c.id}`}
              strong={c.unread}
              title={c.subject}
              subtitle={c.lastMessagePreview ?? undefined}
              trailing={
                <>
                  <span>{format.relative(c.lastMessageAt)}</span>
                  {c.unread ? (
                    <Badge tone="lost">{t("inbox.unread")}</Badge>
                  ) : (
                    <Badge>{t(`conv.status.${c.status}` as const)}</Badge>
                  )}
                </>
              }
            />
          ))}
        </List>
      )}
    </Section>
  );
}

function RecoveriesTimeline({
  recoveries,
  events,
  onEdit,
  className,
}: {
  recoveries: Recovery[];
  events: RecoveryEvent[];
  onEdit: (r: Recovery) => void;
  className?: string;
}) {
  const t = useT();
  const format = useFormat();
  if (recoveries.length === 0) {
    return (
      <Section
        id="sec-rec"
        className={className}
        collapsible
        title={t("recovery.title")}
        summary={t("common.none")}
      >
        <p className="text-subhead text-muted">{t("recovery.empty")}</p>
      </Section>
    );
  }
  return (
    <Section id="sec-rec" className={className} title={t("recovery.title")}>
      <div className="flex flex-col gap-3">
        {recoveries.map((r) => {
          const done = r.status === "recovered" || r.status === "closed";
          // Newest first, like every timeline in the panel (the API returns oldest first).
          const history = events.filter((e) => e.recoveryId === r.id).reverse();
          // Recoveries older than the history log only have their notes field.
          const legacyNotes = history.every((e) => !e.note) ? r.notes : null;
          return (
            <Card key={r.id} padding="sm" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <StatusPill tone={done ? "success" : "lost"}>
                    {t(`recovery.s.${r.status}` as const)}
                  </StatusPill>
                  <p className="mt-1 text-subhead text-muted">
                    {[r.lostPlace, format.dateTime(r.lostAt ?? r.createdAt)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {r.allowedTransitions.length > 0 ? (
                  <Button size="sm" onClick={() => onEdit(r)}>
                    {t("recovery.update")}
                  </Button>
                ) : null}
              </div>
              <Timeline
                label={t("recovery.history")}
                entries={history.map(
                  (e) =>
                    ({
                      key: e.id,
                      tone: e.status === "recovered" || e.status === "closed" ? "success" : "lost",
                      title: (
                        <StatusPill
                          tone={e.status === "recovered" || e.status === "closed" ? "success" : "lost"}
                        >
                          {t(`recovery.s.${e.status}` as const)}
                        </StatusPill>
                      ),
                      time: format.dateTime(e.createdAt),
                      datetime: e.createdAt,
                      body: e.note ? (
                        <p className="whitespace-pre-wrap" dir="auto">
                          {e.note}
                        </p>
                      ) : undefined,
                    }) satisfies TimelineEntry,
                )}
              />
              {legacyNotes ? (
                <p className="text-subhead whitespace-pre-wrap text-muted" dir="auto">
                  {legacyNotes}
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </Section>
  );
}
