import { useState } from "react";
import type { ConversationSummary } from "../../../shared/schemas";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { Link } from "../../lib/router";
import { Button } from "../../ui/Button";
import { FormError } from "../../ui/Field";
import { Sheet, SheetBody, SheetFooter } from "../../ui/Sheet";
import { errorMessage } from "../../ui/States";
import { useToast } from "../../ui/Toast";

/**
 * Shown after an item is recovered while finders are still talking to the owner: thank them in each thread, then
 * close them in one go. Closing is the owner's call (the server leaves the conversations open on purpose).
 */
export function ThankAndClose({
  conversations,
  onClose,
  onClosed,
}: {
  conversations: ConversationSummary[];
  onClose: () => void;
  onClosed: () => void;
}) {
  const t = useT();
  return (
    <Sheet
      open={conversations.length > 0}
      onClose={onClose}
      title={t("thanks.title")}
      description={t("thanks.desc", { n: conversations.length })}
      placement="compact"
    >
      <ThanksBody conversations={conversations} onClose={onClose} onClosed={onClosed} />
    </Sheet>
  );
}

function ThanksBody({
  conversations,
  onClose,
  onClosed,
}: {
  conversations: ConversationSummary[];
  onClose: () => void;
  onClosed: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeAll = async () => {
    setPending(true);
    setError(null);
    // One request per thread; a failure keeps the sheet open so the owner can retry the rest.
    const results = await Promise.allSettled(
      conversations.map((c) => api.post(`/conversations/${c.id}/close`)),
    );
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    setPending(false);
    onClosed();
    if (failed) {
      setError(errorMessage(failed.reason, t));
      return;
    }
    toast(t("thanks.closed", { n: conversations.length }));
    onClose();
  };

  return (
    <>
      <SheetBody>
        <ul className="flex flex-col gap-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                to={`/conversations/${c.id}`}
                onClick={onClose}
                className="flex min-h-11 flex-col justify-center rounded-control px-3 py-1 hover:bg-fill"
              >
                <span className="truncate font-medium text-primary-text underline">{c.subject}</span>
                <span className="truncate text-subhead text-muted">
                  {c.finderName ?? t("thread.finder")}
                  {c.lastMessagePreview ? ` · ${c.lastMessagePreview}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-subhead text-muted">{t("thanks.hint")}</p>
        <FormError message={error} />
      </SheetBody>
      <SheetFooter>
        <Button onClick={onClose}>{t("thanks.keepOpen")}</Button>
        <Button variant="primary" icon="check" loading={pending} onClick={closeAll}>
          {t("thanks.closeAll", { n: conversations.length })}
        </Button>
      </SheetFooter>
    </>
  );
}
