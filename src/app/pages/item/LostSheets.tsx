import { type FormEvent, useState } from "react";
import {
  type ConversationSummary,
  markFoundSchema,
  markLostSchema,
  type RecoveredResponse,
  type Recovery,
  type RecoveryStatus,
} from "../../../shared/schemas";
import { ApiRequestError, api } from "../../lib/api";
import { localInputToIso, nowLocalInput } from "../../lib/format";
import { emptyToNull, type FieldErrors, useDirty, validate } from "../../lib/forms";
import { useT } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { FormError, TextArea, TextInput } from "../../ui/Field";
import { Select } from "../../ui/Select";
import { Sheet, SheetBody, SheetFooter, useSheetGuard } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

function useSubmit<R>(onDone: (result: R) => void) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const run = async (action: () => Promise<R>) => {
    setPending(true);
    setFormError(null);
    try {
      onDone(await action());
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.fieldErrors);
        setFormError(err.message);
      } else setFormError(t("error.generic"));
    } finally {
      setPending(false);
    }
  };
  return { pending, formError, errors, setErrors, run };
}

export function MarkLostSheet({
  open,
  itemId,
  itemName,
  onClose,
  onDone,
}: {
  open: boolean;
  itemId: string;
  itemName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("lost.title", { name: itemName })}
      description={t("lost.desc")}
    >
      <LostForm itemId={itemId} onClose={onClose} onDone={onDone} />
    </Sheet>
  );
}

function LostForm({ itemId, onClose, onDone }: { itemId: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [when, setWhen] = useState(nowLocalInput());
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");
  const cancel = useSheetGuard(useDirty({ when, place, notes }));
  const form = useSubmit<Recovery>(() => {
    toast(t("lost.done"));
    onDone();
    onClose();
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { lostAt: localInputToIso(when), lostPlace: emptyToNull(place), notes: emptyToNull(notes) };
    const v = validate(markLostSchema, body);
    if (!v.ok) return form.setErrors(v.errors);
    void form.run(() => api.post<Recovery>(`/items/${itemId}/lost`, body));
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <TextInput
          label={t("lost.when")}
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          error={form.errors.lostAt}
        />
        <TextInput
          label={t("lost.where")}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          error={form.errors.lostPlace}
          maxLength={300}
          autoFocus
        />
        <TextArea
          label={t("lost.notes")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={form.errors.notes}
          maxLength={2000}
        />
        <FormError message={form.formError} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={cancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="danger" icon="alert" loading={form.pending}>
          {t("item.markLost")}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function MarkRecoveredSheet({
  open,
  itemId,
  onClose,
  onDone,
}: {
  open: boolean;
  itemId: string;
  onClose: () => void;
  onDone: (openConversations: ConversationSummary[]) => void;
}) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("recovered.title")} description={t("recovered.desc")}>
      <RecoveredForm itemId={itemId} onClose={onClose} onDone={onDone} />
    </Sheet>
  );
}

function RecoveredForm({
  itemId,
  onClose,
  onDone,
}: {
  itemId: string;
  onClose: () => void;
  onDone: (openConversations: ConversationSummary[]) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const cancel = useSheetGuard(useDirty({ notes }));
  const form = useSubmit<RecoveredResponse>((res) => {
    toast(t("recovered.done"));
    onDone(res.openConversations);
    onClose();
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { notes: emptyToNull(notes) };
    const v = validate(markFoundSchema, body);
    if (!v.ok) return form.setErrors(v.errors);
    void form.run(() => api.post<RecoveredResponse>(`/items/${itemId}/recovered`, body));
  };
  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <TextArea
          label={t("lost.notes")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          error={form.errors.notes}
          maxLength={2000}
          autoFocus
        />
        <FormError message={form.formError} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={cancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" icon="check" loading={form.pending}>
          {t("item.markRecovered")}
        </Button>
      </SheetFooter>
    </form>
  );
}

export function RecoverySheet({
  recovery,
  onClose,
  onDone,
}: {
  recovery: Recovery | null;
  onClose: () => void;
  onDone: (openConversations: ConversationSummary[]) => void;
}) {
  const t = useT();
  return (
    <Sheet open={recovery !== null} onClose={onClose} title={t("recovery.update")}>
      {recovery ? <RecoveryForm recovery={recovery} onClose={onClose} onDone={onDone} /> : null}
    </Sheet>
  );
}

/** `PATCH /recoveries/:id` also returns the open conversations when the new status is "recovered". */
type RecoveryPatchResponse = Recovery & Partial<Pick<RecoveredResponse, "openConversations">>;

function RecoveryForm({
  recovery,
  onClose,
  onDone,
}: {
  recovery: Recovery;
  onClose: () => void;
  onDone: (openConversations: ConversationSummary[]) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<RecoveryStatus>(recovery.status);
  // Without a status change the notes are edited in place; with one, only the new note is sent and the server
  // appends it to the log (so the textarea starts empty and never re-sends the old text).
  const [notes, setNotes] = useState(recovery.notes ?? "");
  const [changeNote, setChangeNote] = useState("");
  const changed = status !== recovery.status;
  const cancel = useSheetGuard(useDirty({ status, notes, changeNote }));
  const form = useSubmit<RecoveryPatchResponse>((res) => {
    toast(t("common.saved"));
    onDone(res.openConversations ?? []);
    onClose();
  });
  // The server only accepts these moves (409 otherwise): offer exactly them, plus staying where we are.
  const options = [recovery.status, ...recovery.allowedTransitions].map((s) => ({
    value: s,
    label: t(`recovery.s.${s}` as const),
  }));
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        const body = changed ? { status, notes: emptyToNull(changeNote) } : { notes: emptyToNull(notes) };
        void form.run(() => api.patch<RecoveryPatchResponse>(`/recoveries/${recovery.id}`, body));
      }}
    >
      <SheetBody>
        <Select
          label={t("recovery.status")}
          options={options}
          value={status}
          onChange={setStatus}
          hint={changed ? undefined : t("recovery.statusHint")}
        />
        {changed ? (
          <TextArea
            key="change"
            label={t("recovery.changeNote")}
            hint={t("recovery.changeNoteHint")}
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            error={form.errors.notes}
            maxLength={2000}
          />
        ) : (
          <TextArea
            key="notes"
            label={t("lost.notes")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            error={form.errors.notes}
            maxLength={2000}
          />
        )}
        <FormError message={form.formError} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={cancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={form.pending}>
          {t("common.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}
