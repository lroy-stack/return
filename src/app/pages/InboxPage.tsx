import { useState } from "react";
import type { ConversationStatus, ConversationSummary } from "../../shared/schemas";
import { api, qs } from "../lib/api";
import { useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useOverview } from "../lib/overview-context";
import { Link } from "../lib/router";
import { useFormat } from "../lib/settings-context";
import { Badge } from "../ui/Badge";
import { PageHeader } from "../ui/Page";
import { EmptyState, ErrorState, LoadingBlock } from "../ui/States";
import { Chip } from "../ui/Tabs";
import { Thread } from "./inbox/Thread";

function sortConversations(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

export function InboxPage({ activeId }: { activeId?: string }) {
  const t = useT();
  const format = useFormat();
  const [status, setStatus] = useState<ConversationStatus>("open");
  const overview = useOverview();
  const list = useResource<ConversationSummary[]>(
    `convs-${status}`,
    async (signal) =>
      (await api.get<{ conversations: ConversationSummary[] }>(`/conversations${qs({ status })}`, signal))
        .conversations,
    { pollMs: 30_000 },
  );

  return (
    <>
      {activeId ? <h1 className="sr-only lg:hidden">{t("nav.inbox")}</h1> : null}
      <div className="lg:grid lg:h-[calc(100dvh-5rem)] lg:grid-cols-[minmax(18rem,24rem)_1fr] lg:gap-8">
        <section
          aria-label={t("inbox.list")}
          className={`${activeId ? "hidden lg:flex" : "flex"} min-h-0 flex-col`}
        >
          <PageHeader title={t("nav.inbox")} />
          <fieldset className="mb-3 flex min-w-0 flex-wrap gap-2">
            <legend className="sr-only">{t("tags.filter")}</legend>
            {(["open", "closed", "blocked"] as const).map((s) => (
              <Chip key={s} pressed={status === s} onClick={() => setStatus(s)}>
                {t(`conv.status.${s}` as const)}
              </Chip>
            ))}
          </fieldset>
          <div className="min-h-0 flex-1 lg:overflow-y-auto lg:pr-1">
            {list.state.status === "loading" ? (
              <LoadingBlock />
            ) : list.state.status === "error" ? (
              <ErrorState error={list.state.error} onRetry={() => list.reload()} />
            ) : list.state.data.length === 0 ? (
              <EmptyState icon="inbox" title={t("inbox.emptyTitle")}>
                {t("inbox.emptyBody")}
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-2">
                {sortConversations(list.state.data).map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/conversations/${c.id}`}
                      aria-current={c.id === activeId ? "page" : undefined}
                      className={`flex min-h-[4.5rem] flex-col gap-0.5 rounded-xl border px-3.5 py-2.5 ${
                        c.id === activeId
                          ? "border-primary bg-primary-tint"
                          : "border-line bg-raised hover:bg-sunken"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {c.unread ? (
                          <>
                            <span className="size-2.5 shrink-0 rounded-full bg-lost" aria-hidden="true" />
                            <span className="sr-only">{t("inbox.unread")}</span>
                          </>
                        ) : null}
                        <span className={`min-w-0 flex-1 truncate ${c.unread ? "font-bold" : "font-medium"}`}>
                          {c.subject}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {format.relative(c.lastMessageAt)}
                        </span>
                      </span>
                      <span className="truncate text-sm text-muted">
                        {[c.finderName, c.itemName ?? c.tagLabel].filter(Boolean).join(" · ")}
                      </span>
                      {c.lastMessagePreview ? (
                        <span className="truncate text-sm">{c.lastMessagePreview}</span>
                      ) : null}
                      {c.status !== "open" ? (
                        <span className="pt-1">
                          <Badge>{t(`conv.status.${c.status}` as const)}</Badge>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section
          aria-label={t("inbox.thread")}
          className={`${activeId ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col`}
        >
          {activeId ? (
            <Thread
              key={activeId}
              id={activeId}
              onChanged={() => {
                list.reload(true);
                overview.reload(true);
              }}
            />
          ) : (
            <div className="hidden h-full items-center justify-center rounded-card border border-dashed border-line-strong p-8 text-center text-muted lg:flex">
              {t("inbox.selectHint")}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
