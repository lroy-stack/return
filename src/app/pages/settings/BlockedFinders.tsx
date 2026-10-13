import { useState } from "react";
import type { BlockEntry } from "../../../shared/schemas";
import { api } from "../../lib/api";
import { notifyDataChanged } from "../../lib/data-events";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { Link } from "../../lib/router";
import { useFormat } from "../../lib/settings-context";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ErrorState, errorMessage, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { SectionCard } from "./shared";

/** Finders the owner blocked. Lifting a block lets that address write again; the conversation becomes "closed". */
export function BlockedFinders() {
  const t = useT();
  const toast = useToast();
  const format = useFormat();
  const res = useResource<BlockEntry[]>(
    "blocks",
    async (signal) => (await api.get<{ blocks: BlockEntry[] }>("/blocks", signal)).blocks,
  );
  const [busy, setBusy] = useState<string | null>(null);

  const lift = async (block: BlockEntry) => {
    setBusy(block.id);
    try {
      await api.delete(`/blocks/${block.id}`);
      toast(t("blocks.lifted"));
      notifyDataChanged();
      res.reload(true);
    } catch (e) {
      toast(errorMessage(e, t), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard title={t("blocks.title")} description={t("blocks.desc")}>
      {res.state.status === "loading" ? <LoadingBlock variant="rows" rows={2} /> : null}
      {res.state.status === "error" ? (
        <ErrorState error={res.state.error} onRetry={() => res.reload()} />
      ) : null}
      {res.state.status === "ready" && res.state.data.length === 0 ? (
        <p className="rounded-control bg-sunken px-4 py-3 text-subhead text-muted">{t("blocks.empty")}</p>
      ) : null}
      {res.state.status === "ready" && res.state.data.length > 0 ? (
        <ul aria-label={t("blocks.title")} className="flex flex-col divide-y divide-line">
          {res.state.data.map((b) => (
            <li
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="flex items-center gap-2 font-medium" dir="auto">
                  <Icon name="lock" className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 truncate">
                    {b.conversation ? (
                      <Link
                        to={`/conversations/${b.conversation.id}`}
                        className="touch-target text-primary-text underline"
                      >
                        {b.conversation.subject}
                      </Link>
                    ) : (
                      t("blocks.deletedConversation")
                    )}
                  </span>
                </p>
                <p className="text-subhead text-muted">
                  {[
                    b.conversation?.itemName,
                    b.expiresAt
                      ? t("blocks.until", { when: format.date(b.expiresAt) })
                      : t("blocks.permanent"),
                    t("blocks.since", { when: format.date(b.createdAt) }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {b.reason ? (
                  <p className="text-subhead text-muted" dir="auto">
                    {t("blocks.reason", { reason: b.reason })}
                  </p>
                ) : null}
              </div>
              <Button size="sm" loading={busy === b.id} onClick={() => lift(b)}>
                {b.orphaned ? t("blocks.remove") : t("blocks.unblock")}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  );
}
