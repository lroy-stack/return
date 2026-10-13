import { type FormEvent, useState } from "react";
import { BLOCK_DURATIONS, type BlockDuration, blockInputSchema } from "../../../shared/schemas";
import { ApiRequestError, api } from "../../lib/api";
import { emptyToNull, type FieldErrors, useDirty, validate } from "../../lib/forms";
import { useT } from "../../lib/i18n";
import { Button } from "../../ui/Button";
import { FormError, TextInput } from "../../ui/Field";
import { Select } from "../../ui/Select";
import { Sheet, SheetBody, SheetFooter, useSheetGuard } from "../../ui/Sheet";

/** Block the finder of a conversation: for how long, and an optional private reason (never shown to the finder). */
export function BlockSheet({
  open,
  conversationId,
  onClose,
  onBlocked,
}: {
  open: boolean;
  conversationId: string;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const t = useT();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("thread.blockTitle")}
      description={t("thread.blockBody")}
      placement="compact"
    >
      <BlockForm conversationId={conversationId} onClose={onClose} onBlocked={onBlocked} />
    </Sheet>
  );
}

function BlockForm({
  conversationId,
  onClose,
  onBlocked,
}: {
  conversationId: string;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const t = useT();
  const [duration, setDuration] = useState<BlockDuration>("permanent");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const cancel = useSheetGuard(useDirty({ duration, reason }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const body = { duration, reason: emptyToNull(reason) };
    const v = validate(blockInputSchema, body);
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setPending(true);
    try {
      await api.post(`/conversations/${conversationId}/block`, body);
      onBlocked();
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
          label={t("block.duration")}
          options={BLOCK_DURATIONS.map((d) => ({ value: d, label: t(`block.duration.${d}` as const) }))}
          value={duration}
          onChange={setDuration}
          hint={t("block.durationHint")}
        />
        <TextInput
          label={t("block.reason")}
          hint={t("block.reasonHint")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          maxLength={300}
          dir="auto"
        />
        <FormError message={formError} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={cancel}>{t("common.cancel")}</Button>
        <Button type="submit" variant="danger" icon="close" loading={pending}>
          {t("thread.block")}
        </Button>
      </SheetFooter>
    </form>
  );
}
