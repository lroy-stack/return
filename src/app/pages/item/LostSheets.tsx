import { type FormEvent, useState } from "react";
import {
  markFoundSchema,
  markLostSchema,
  RECOVERY_STATUSES,
  type Recovery,
  type RecoveryStatus,
} from "../../../shared/schemas";
import { ApiRequestError, api } from "../../lib/api";
import { localInputToIso, nowLocalInput } from "../../lib/format";
import { emptyToNull, type FieldErrors, validate } from "../../lib/forms";
import { useT } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { FormError, Select, TextArea, TextInput } from "../../ui/Field";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

function useSubmit(onDone: () => void) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setFormError(null);
    try {
      await action();
      onDone();
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
  const form = useSubmit(() => {
    toast(t("lost.done"));
    onDone();
    onClose();
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { lostAt: localInputToIso(when), lostPlace: emptyToNull(place), notes: emptyToNull(notes) };
    const v = validate(markLostSchema, body);
    if (!v.ok) return form.setErrors(v.errors);
    void form.run(() => api.post(`/items/${itemId}/lost`, body));
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
        <Button onClick={onClose}>{t("common.cancel")}</Button>
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
  onDone: () => void;
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
  onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const form = useSubmit(() => {
    toast(t("recovered.done"));
    onDone();
    onClose();
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { notes: emptyToNull(notes) };
    const v = validate(markFoundSchema, body);
    if (!v.ok) return form.setErrors(v.errors);
    void form.run(() => api.post(`/items/${itemId}/recovered`, body));
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
        <Button onClick={onClose}>{t("common.cancel")}</Button>
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
  onDone: () => void;
}) {
  const t = useT();
  return (
    <Sheet open={recovery !== null} onClose={onClose} title={t("recovery.update")}>
      {recovery ? <RecoveryForm recovery={recovery} onClose={onClose} onDone={onDone} /> : null}
    </Sheet>
  );
}

function RecoveryForm({
  recovery,
  onClose,
  onDone,
}: {
  recovery: Recovery;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [status, setStatus] = useState<RecoveryStatus>(recovery.status);
  const [notes, setNotes] = useState(recovery.notes ?? "");
  const form = useSubmit(() => {
    toast(t("common.saved"));
    onDone();
    onClose();
  });
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void form.run(() => api.patch(`/recoveries/${recovery.id}`, { status, notes: emptyToNull(notes) }));
      }}
    >
      <SheetBody>
        <Select
          label={t("recovery.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value as RecoveryStatus)}
        >
          {RECOVERY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`recovery.s.${s}` as const)}
            </option>
          ))}
        </Select>
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
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={form.pending}>
          {t("common.save")}
        </Button>
      </SheetFooter>
    </form>
  );
}
