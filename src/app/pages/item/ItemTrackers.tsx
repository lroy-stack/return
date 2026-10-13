import { type FormEvent, useState } from "react";
import { type ItemDetail, TRACKER_KINDS, type Tracker, trackerInputSchema } from "../../../shared/schemas";
import { ApiRequestError, api } from "../../lib/api";
import { isoToLocalInput, localInputToIso } from "../../lib/format";
import { emptyToNull, type FieldErrors, useDirty, validate } from "../../lib/forms";
import { useT } from "../../lib/i18n";
import { useFormat } from "../../lib/settings-context";
import { Button, IconButton } from "../../ui/Button";
import { Section } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { FormError, TextArea, TextInput } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { IconTile, List, ListRow } from "../../ui/List";
import { Select } from "../../ui/Select";
import { Sheet, SheetBody, SheetFooter, useSheetGuard } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

const APPLE_LOST_MODE = "https://support.apple.com/en-us/104978";
const APPLE_SHARE_LOCATION = "https://support.apple.com/guide/iphone/share-item-location-iph0fe5b59ff/ios";

export function ItemTrackers({
  detail,
  onChanged,
  className,
}: {
  detail: ItemDetail;
  onChanged: () => void;
  className?: string;
}) {
  const t = useT();
  const format = useFormat();
  const [editing, setEditing] = useState<Tracker | "new" | null>(null);
  const [removing, setRemoving] = useState<Tracker | null>(null);
  const n = detail.trackers.length;

  return (
    <>
      <Section
        id="sec-trackers"
        className={className}
        collapsible
        title={t("trackers.title")}
        summary={n > 0 ? t("trackers.count", { n }) : t("common.none")}
        actions={
          <Button size="sm" variant="tinted" icon="plus" onClick={() => setEditing("new")}>
            {t("trackers.add")}
          </Button>
        }
        footer={
          <span className="flex gap-2">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <span>
              {t("trackers.help")}{" "}
              <a
                className="touch-target font-medium text-primary-text underline"
                href={APPLE_LOST_MODE}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("trackers.lostMode")}
                <Icon name="external" className="mb-0.5 ml-1 inline size-3.5" />
                <span className="sr-only"> ({t("common.opensNewTab")})</span>
              </a>
              {" · "}
              <a
                className="touch-target font-medium text-primary-text underline"
                href={APPLE_SHARE_LOCATION}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("trackers.shareLocation")}
                <Icon name="external" className="mb-0.5 ml-1 inline size-3.5" />
                <span className="sr-only"> ({t("common.opensNewTab")})</span>
              </a>
            </span>
          </span>
        }
      >
        {n === 0 ? (
          <p className="text-subhead text-muted">{t("trackers.empty")}</p>
        ) : (
          <List variant="plain" label={t("trackers.title")}>
            {detail.trackers.map((tr) => (
              <ListRow
                key={tr.id}
                flush
                leading={
                  <IconTile tone="neutral">
                    <Icon name="pin" className="size-5" />
                  </IconTile>
                }
                title={`${tr.name} · ${t(`tracker.${tr.kind}` as const)}`}
                subtitle={
                  tr.lastLocationText
                    ? `${tr.lastLocationText}${tr.lastLocationAt ? ` · ${format.dateTime(tr.lastLocationAt)}` : ""}`
                    : t("trackers.noLocation")
                }
                description={tr.notes ?? undefined}
                trailing={
                  <span className="flex">
                    <IconButton
                      icon="edit"
                      size="sm"
                      label={t("trackers.edit", { name: tr.name })}
                      onClick={() => setEditing(tr)}
                    />
                    <IconButton
                      icon="trash"
                      size="sm"
                      label={t("trackers.remove", { name: tr.name })}
                      onClick={() => setRemoving(tr)}
                    />
                  </span>
                }
              />
            ))}
          </List>
        )}
      </Section>
      <TrackerSheet
        itemId={detail.item.id}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
      <ConfirmDialog
        open={removing !== null}
        title={t("trackers.removeTitle")}
        message={t("trackers.removeBody", { name: removing?.name ?? "" })}
        confirmLabel={t("common.delete")}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await api.delete(`/trackers/${removing.id}`);
          onChanged();
        }}
      />
    </>
  );
}

function TrackerSheet({
  itemId,
  editing,
  onClose,
  onSaved,
}: {
  itemId: string;
  editing: Tracker | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  return (
    <Sheet
      open={editing !== null}
      onClose={onClose}
      title={editing === "new" ? t("trackers.add") : t("trackers.editTitle")}
    >
      {editing ? (
        <TrackerForm
          itemId={itemId}
          tracker={editing === "new" ? null : editing}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Sheet>
  );
}

function TrackerForm({
  itemId,
  tracker,
  onClose,
  onSaved,
}: {
  itemId: string;
  tracker: Tracker | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [kind, setKind] = useState<Tracker["kind"]>(tracker?.kind ?? "airtag");
  const [name, setName] = useState(tracker?.name ?? "");
  const [notes, setNotes] = useState(tracker?.notes ?? "");
  const [location, setLocation] = useState(tracker?.lastLocationText ?? "");
  const [at, setAt] = useState(isoToLocalInput(tracker?.lastLocationAt));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const cancel = useSheetGuard(useDirty({ kind, name, notes, location, at }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      itemId,
      kind,
      name,
      notes: emptyToNull(notes),
      lastLocationText: emptyToNull(location),
      lastLocationAt: location.trim() ? localInputToIso(at) : null,
    };
    const v = validate(trackerInputSchema, body);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setPending(true);
    try {
      if (tracker) await api.patch(`/trackers/${tracker.id}`, body);
      else await api.post("/trackers", body);
      toast(t("common.saved"));
      onSaved();
      onClose();
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
        <Select
          label={t("trackers.kind")}
          options={TRACKER_KINDS.map((k) => ({ value: k, label: t(`tracker.${k}` as const) }))}
          value={kind}
          onChange={setKind}
        />
        <TextInput
          label={t("trackers.name")}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name ? t("trackers.nameRequired") : undefined}
          maxLength={80}
          autoFocus
        />
        <TextInput
          label={t("trackers.lastLocation")}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          hint={t("trackers.lastLocationHint")}
          error={errors.lastLocationText}
          maxLength={300}
        />
        <TextInput
          label={t("trackers.lastLocationAt")}
          type="datetime-local"
          value={at}
          onChange={(e) => setAt(e.target.value)}
          error={errors.lastLocationAt}
        />
        <TextArea
          label={t("trackers.notes")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={errors.notes}
          maxLength={1000}
        />
        <FormError message={formError} />
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
