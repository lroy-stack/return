import { useState } from "react";
import type { ConversationStatus, ConversationSummary } from "../../shared/schemas";
import { api, qs } from "../lib/api";
import { useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useOverview } from "../lib/overview-context";
import { useFormat } from "../lib/settings-context";
import { Badge } from "../ui/Badge";
import { SegmentedControl } from "../ui/Field";
import { List, ListRow } from "../ui/List";
import { PageHeader } from "../ui/Page";
import { SplitView } from "../ui/SplitView";
import { EmptyState, ErrorState, LoadingBlock } from "../ui/States";
import { Avatar } from "../ui/Thumb";
import { Thread } from "./inbox/Thread";

const STATUSES = ["open", "closed", "blocked"] as const;

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

  const master = (
    <div className="flex min-w-0 flex-col gap-3">
      <SegmentedControl
        block
        label={t("inbox.filter")}
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({ value: s, label: t(`conv.status.${s}` as const) }))}
      />
      {list.state.status === "loading" ? (
        <LoadingBlock variant="rows" rows={4} />
      ) : list.state.status === "error" ? (
        <ErrorState error={list.state.error} onRetry={() => list.reload()} />
      ) : list.state.data.length === 0 ? (
        <EmptyState compact icon="inbox" title={t("inbox.emptyTitle")}>
          {t("inbox.emptyBody")}
        </EmptyState>
      ) : (
        <>
          <p className="sr-only" role="status">
            {t("inbox.count", { n: list.state.data.length })}
          </p>
          <List label={t("inbox.list")}>
            {sortConversations(list.state.data).map((c) => (
              <ListRow
                key={c.id}
                to={`/conversations/${c.id}`}
                current={c.id === activeId}
                strong={c.unread}
                leading={<Avatar name={c.finderName} />}
                title={c.subject}
                subtitle={[c.finderName, c.itemName ?? c.tagLabel].filter(Boolean).join(" · ")}
                description={c.lastMessagePreview ?? undefined}
                trailing={
                  <>
                    <span>{format.relative(c.lastMessageAt)}</span>
                    {c.unread ? <Badge tone="lost">{t("inbox.unread")}</Badge> : null}
                    {!c.unread && c.status !== "open" ? (
                      <Badge>{t(`conv.status.${c.status}` as const)}</Badge>
                    ) : null}
                  </>
                }
              />
            ))}
          </List>
        </>
      )}
    </div>
  );

  return (
    <>
      <div className={activeId ? "max-md:sr-only" : undefined}>
        <PageHeader title={t("nav.inbox")} />
      </div>
      <SplitView
        listLabel={t("inbox.list")}
        detailLabel={t("inbox.thread")}
        showDetail={Boolean(activeId)}
        placeholder={t("inbox.selectHint")}
        list={master}
        detail={
          activeId ? (
            <Thread
              key={activeId}
              id={activeId}
              onChanged={() => {
                list.reload(true);
                overview.reload(true);
              }}
            />
          ) : null
        }
      />
    </>
  );
}
