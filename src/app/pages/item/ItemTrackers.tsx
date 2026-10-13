import { type FormEvent, useState } from "react";
import { type ItemDetail, TRACKER_KINDS, type Tracker, trackerInputSchema } from "../../../shared/schemas";
import { ApiRequestError, api } from "../../lib/api";
import { isoToLocalInput, localInputToIso } from "../../lib/format";
import { emptyToNull, type FieldErrors, validate } from "../../lib/forms";
import { useT } from "../../lib/i18n";
import { useFormat } from "../../lib/settings-context";
import { Button } from "../../ui/Button";
import { Card, SectionHeading } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { FormError, Select, TextArea, TextInput } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

const APPLE_LOST_MODE = "https://support.apple.com/en-us/104978";
const APPLE_SHARE_LOCATION = "https://support.apple.com/guide/iphone/share-item-location-iph0fe5b59ff/ios";

export function ItemTrackers({ detail, onChanged }: { detail: ItemDetail; onChanged: () => void }) {
  const t = useT();
  const format = useFormat();
  const [editing, setEditing] = useState<Tracker | "new" | null>(null);
  const [removing, setRemoving] = useState<Tracker | null>(null);

  return (
    <Card aria-labelledby="sec-trackers">
      <SectionHeading
        id="sec-trackers"
        title={t("trackers.title")}
        actions={
          <Button size="sm" icon="plus" onClick={() => setEditing("new")}>
            {t("trackers.add")}
          </Button>
        }
      />
      <p className="mb-3 flex gap-2 rounded-xl bg-sunken px-3 py-2 text-sm text-muted">
        <Icon name="info" className="mt-0.5 size-4" />
        <span>
          {t("trackers.help")}{" "}
          <a
            className="font-medium text-primary-text underline"
            href={APPLE_LOST_MODE}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("trackers.lostMode")}
          </a>
          {" · "}
          <a
            className="font-medium text-primary-text underline"
            href={APPLE_SHARE_LOCATION}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("trackers.shareLocation")}
          </a>
        </span>
      </p>
      {detail.trackers.length === 0 ? (
        <p className="text-muted">{t("trackers.empty")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {detail.trackers.map((tr) => (
            <li key={tr.id} className="flex items-start gap-3 px-3 py-2.5">
              <Icon name="pin" className="mt-1 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {tr.name}{" "}
                  <span className="text-sm font-normal text-muted">· {t(`tracker.${tr.kind}` as const)}</span>
                </p>
                {tr.lastLocationText ? (
                  <p className="text-sm">
                    {tr.lastLocationText}
                    {tr.lastLocationAt ? (
                      <span className="text-muted"> · {format.dateTime(tr.lastLocationAt)}</span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-muted">{t("trackers.noLocation")}</p>
                )}
                {tr.notes ? <p className="text-sm text-muted">{tr.notes}</p> : null}
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon="edit"
                aria-label={t("trackers.edit", { name: tr.name })}
                onClick={() => setEditing(tr)}
              />
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                aria-label={t("trackers.remove", { name: tr.name })}
                onClick={() => setRemoving(tr)}
              />
            </li>
          ))}
        </ul>
      )}
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
    </Card>
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
          value={kind}
          onChange={(e) => setKind(e.target.value as Tracker["kind"])}
        >
          {TRACKER_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`tracker.${k}` as const)}
            </option>
          ))}
        </Select>
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
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={pending}>
          {t("common.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}
