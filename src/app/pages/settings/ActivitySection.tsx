import { useEffect, useState } from "react";
import type { ActivityEvent } from "../../../shared/schemas";
import { ApiRequestError, api, qs } from "../../lib/api";
import type { MessageKey } from "../../lib/dict";
import { useT } from "../../lib/i18n";
import { Link } from "../../lib/router";
import { useFormat } from "../../lib/settings-context";
import { Button } from "../../ui/Button";
import { EmptyState, ErrorState, LoadingBlock } from "../../ui/States";
import { SectionCard } from "./shared";

const PAGE = 30;

function eventLabel(type: string, t: ReturnType<typeof useT>): string {
  const key = `activity.type.${type}` as MessageKey;
  const label = t(key);
  return label === key ? type : label;
}

export function ActivitySection() {
  const t = useT();
  const format = useFormat();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiRequestError | null>(null);
  const [nonce, setNonce] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: nonce triggers a fresh first page
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    api
      .get<{ events: ActivityEvent[]; nextBefore: string | null }>(`/activity${qs({ limit: PAGE })}`)
      .then((r) => {
        if (cancelled) return;
        setEvents(r.events);
        setNext(r.nextBefore);
        setState("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, "unknown", String(e)));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const more = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const r = await api.get<{ events: ActivityEvent[]; nextBefore: string | null }>(
        `/activity${qs({ limit: PAGE, before: next })}`,
      );
      setEvents((prev) => [...prev, ...r.events]);
      setNext(r.nextBefore);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e : new ApiRequestError(0, "unknown", String(e)));
      setState("error");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <SectionCard title={t("settings.activity")} description={t("settings.activityDesc")}>
      {state === "loading" ? <LoadingBlock /> : null}
      {state === "error" ? <ErrorState error={error} onRetry={() => setNonce((n) => n + 1)} /> : null}
      {state === "ready" && events.length === 0 ? (
        <EmptyState icon="info" title={t("activity.empty")} />
      ) : null}
      {state === "ready" && events.length > 0 ? (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="font-medium">{eventLabel(ev.type, t)}</span>
                  {ev.country ? <span className="text-sm text-muted"> · {ev.country}</span> : null}
                  {ev.itemId ? (
                    <>
                      {" · "}
                      <Link
                        to={`/items/${ev.itemId}`}
                        className="text-sm font-medium text-primary-text underline"
                      >
                        {t("activity.item")}
                      </Link>
                    </>
                  ) : null}
                  {ev.conversationId ? (
                    <>
                      {" · "}
                      <Link
                        to={`/conversations/${ev.conversationId}`}
                        className="text-sm font-medium text-primary-text underline"
                      >
                        {t("activity.conversation")}
                      </Link>
                    </>
                  ) : null}
                </span>
                <time dateTime={ev.createdAt} className="text-sm text-muted tabular-nums">
                  {format.dateTime(ev.createdAt)}
                </time>
              </li>
            ))}
          </ul>
          {next ? (
            <div>
              <Button loading={loadingMore} onClick={more}>
                {t("activity.more")}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("activity.end")}</p>
          )}
        </>
      ) : null}
    </SectionCard>
  );
}
