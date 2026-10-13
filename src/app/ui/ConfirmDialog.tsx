import { type FormEvent, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { useT } from "../lib/i18n";
import { Button } from "./Button";
import { FormError, TextInput } from "./Field";
import { Sheet, SheetBody, SheetFooter } from "./Sheet";

/**
 * Confirmation as a centred alert. With `typed`, the user must type that exact text before confirming
 * (irreversible deletions, restore). Errors from `onConfirm` stay in the dialog with a retry.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = "danger",
  typed,
  typedLabel,
  confirmDisabled,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  typed?: string;
  typedLabel?: string;
  /** Keep the confirm button off while something it depends on is still loading. */
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} placement="center">
      <ConfirmBody
        message={message}
        confirmLabel={confirmLabel}
        tone={tone}
        typed={typed}
        typedLabel={typedLabel}
        confirmDisabled={confirmDisabled}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    </Sheet>
  );
}

function ConfirmBody({
  message,
  confirmLabel,
  tone,
  typed,
  typedLabel,
  confirmDisabled,
  onConfirm,
  onClose,
}: {
  message: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  typed?: string;
  typedLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = typed === undefined || value === typed;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : t("error.generic"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <p className="text-body">{message}</p>
        {typed !== undefined ? (
          <TextInput
            label={typedLabel ?? t("confirm.typeToConfirm", { text: typed })}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        ) : null}
        <FormError message={error} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant={tone} loading={pending} disabled={!ready || confirmDisabled}>
          {confirmLabel}
        </Button>
      </SheetFooter>
    </form>
  );
}
