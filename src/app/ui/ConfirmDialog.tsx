import { type FormEvent, useState } from "react";
import { ApiRequestError } from "../lib/api";
import { useT } from "../lib/i18n";
import { Button } from "./Button";
import { FormError, TextInput } from "./Field";
import { Sheet, SheetBody, SheetFooter } from "./Sheet";

/** Confirmation dialog. With `typed`, the user must type that exact text before confirming. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = "danger",
  typed,
  typedLabel,
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
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <ConfirmBody
        message={message}
        confirmLabel={confirmLabel}
        tone={tone}
        typed={typed}
        typedLabel={typedLabel}
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
  onConfirm,
  onClose,
}: {
  message: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  typed?: string;
  typedLabel?: string;
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
        <p>{message}</p>
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
        <Button type="submit" variant={tone} loading={pending} disabled={!ready}>
          {confirmLabel}
        </Button>
      </SheetFooter>
    </form>
  );
}
