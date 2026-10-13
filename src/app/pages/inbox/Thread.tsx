import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  ConversationDetail,
  MapLinks,
  Message,
  Proposal,
  SharedLocation,
} from "../../../shared/schemas";
import { api } from "../../lib/api";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { didNavigate, Link, navigate } from "../../lib/router";
import { useFormat } from "../../lib/settings-context";
import { Badge } from "../../ui/Badge";
import { Button, ButtonLink } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { Sheet, SheetBody } from "../../ui/Sheet";
import { ErrorState, errorMessage, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { ProposalSheet } from "./ProposalSheet";

type Entry =
  | { kind: "message"; at: string; id: string; message: Message }
  | { kind: "location"; at: string; id: string; location: SharedLocation }
  | { kind: "proposal"; at: string; id: string; proposal: Proposal };

function MapButtons({ maps }: { maps: MapLinks | null }) {
  const t = useT();
  if (!maps) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <ButtonLink to={maps.google} external size="sm" icon="external">
        {t("thread.openGoogle")}
      </ButtonLink>
      <ButtonLink to={maps.apple} external size="sm" icon="external">
        {t("thread.openApple")}
      </ButtonLink>
    </div>
  );
}

export function Thread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const format = useFormat();
  const res = useResource<ConversationDetail>(
    `conv-${id}`,
    (signal) => api.get<ConversationDetail>(`/conversations/${id}`, signal),
    { pollMs: 30_000 },
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"manage" | "block" | "delete" | "proposal" | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const data = res.state.status === "ready" ? res.state.data : null;
  const loaded = data !== null;
  const count = data ? data.messages.length + data.locations.length + data.proposals.length : 0;
  const prevCount = useRef(0);

  // Opening a thread marks it read on the server: refresh the list/badge once, and move focus to the title.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once when the thread first loads
  useEffect(() => {
    if (!loaded) return;
    onChanged();
    if (didNavigate()) heading.current?.focus({ preventScroll: true });
  }, [loaded]);

  // Keep the newest entry in view when something arrives and the reader was already near the bottom.
  useEffect(() => {
    if (!data) return;
    const grew = count > prevCount.current;
    const first = prevCount.current === 0;
    prevCount.current = count;
    if (!grew) return;
    const el = log.current;
    if (!el) return;
    const nearBottom = first || el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.lastElementChild?.scrollIntoView({ block: "end" });
  }, [count, data]);

  const entries = useMemo<Entry[]>(() => {
    if (!data) return [];
    const all: Entry[] = [
      ...data.messages.map((m): Entry => ({ kind: "message", at: m.createdAt, id: m.id, message: m })),
      ...data.locations.map((l): Entry => ({ kind: "location", at: l.createdAt, id: l.id, location: l })),
      ...data.proposals.map((p): Entry => ({ kind: "proposal", at: p.createdAt, id: p.id, proposal: p })),
    ];
    return all.sort((a, b) => a.at.localeCompare(b.at));
  }, [data]);

  if (res.state.status === "loading") return <LoadingBlock rows={4} />;
  if (res.state.status === "error")
    return (
      <div className="flex flex-col gap-3">
        <Link
          to="/conversations"
          className="inline-flex min-h-11 items-center gap-1 font-medium text-primary-text lg:hidden"
        >
          <Icon name="back" className="size-4" />
          {t("nav.inbox")}
        </Link>
        <ErrorState error={res.state.error} onRetry={() => res.reload()} />
      </div>
    );

  const { conversation: conv } = res.state.data;
  const canReply = conv.status === "open";

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/conversations/${id}/messages`, { body: text });
      setBody("");
      res.reload(true);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSending(false);
    }
  };

  const status = async (action: "close" | "reopen") => {
    setError(null);
    try {
      await api.post(`/conversations/${id}/${action}`);
      toast(action === "close" ? t("thread.closedToast") : t("thread.reopenedToast"));
      setDialog(null);
      res.reload(true);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, t));
    }
  };

  const respond = async (proposalId: string, action: "accept" | "decline" | "cancel") => {
    setResponding(proposalId);
    setError(null);
    try {
      await api.post(`/conversations/${id}/proposals/${proposalId}/respond`, { action });
      res.reload(true);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setResponding(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:rounded-card lg:border lg:border-line lg:bg-raised">
      <header className="flex flex-col gap-2 border-b border-line pb-3 lg:px-5 lg:pt-4">
        <Link
          to="/conversations"
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary-text lg:hidden"
        >
          <Icon name="back" className="size-4" />
          {t("nav.inbox")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
              {conv.subject}
            </h2>
            <p className="text-sm text-muted">
              {[conv.finderName ?? t("thread.finder"), conv.tagLabel].filter(Boolean).join(" · ")}
              {conv.itemId ? (
                <>
                  {" · "}
                  <Link to={`/items/${conv.itemId}`} className="font-medium text-primary-text underline">
                    {conv.itemName ?? t("thread.item")}
                  </Link>
                </>
              ) : null}
            </p>
            {conv.finderEmail ? <p className="text-sm text-muted">{conv.finderEmail}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={conv.status === "open" ? "success" : "neutral"}>
              {t(`conv.status.${conv.status}` as const)}
            </Badge>
            <Button size="sm" icon="more" aria-label={t("thread.more")} onClick={() => setDialog("manage")} />
          </div>
        </div>
      </header>

      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-label={t("inbox.thread")}
        className="flex min-h-0 flex-1 flex-col gap-3 py-4 lg:overflow-y-auto lg:px-5"
      >
        {entries.map((entry) => {
          if (entry.kind === "message") {
            const m = entry.message;
            if (m.sender === "system")
              return (
                <p
                  key={entry.id}
                  className="self-center rounded-full bg-sunken px-3 py-1 text-center text-xs text-muted"
                >
                  {m.body}
                </p>
              );
            const mine = m.sender === "owner";
            return (
              <div
                key={entry.id}
                className={`flex max-w-[85%] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"}`}
              >
                <div
                  className={`rounded-2xl px-4 py-2.5 whitespace-pre-wrap ${mine ? "rounded-br-md bg-primary text-primary-fg" : "rounded-bl-md bg-sunken text-fg"}`}
                >
                  <span className="sr-only">{mine ? t("thread.you") : t("thread.finder")}: </span>
                  {m.body}
                </div>
                <span className="px-1 text-xs text-muted">{format.dateTime(m.createdAt)}</span>
              </div>
            );
          }
          if (entry.kind === "location") {
            const l = entry.location;
            return (
              <div
                key={entry.id}
                className={`max-w-[90%] rounded-2xl border border-line bg-raised p-3.5 ${l.sharedBy === "owner" ? "self-end" : "self-start"}`}
              >
                <p className="flex items-center gap-2 font-semibold">
                  <Icon name="pin" className="size-4 text-primary-text" />
                  {l.sharedBy === "finder" ? t("thread.finderLocation") : t("thread.yourLocation")}
                </p>
                <p>
                  {l.label ??
                    (l.lat != null && l.lng != null ? `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}` : "")}
                </p>
                <p className="text-xs text-muted">
                  {l.source === "gps" ? t("thread.gps") : t("thread.manual")}
                  {l.accuracyM != null ? ` · ±${Math.round(l.accuracyM)} m` : ""} ·{" "}
                  {format.dateTime(l.createdAt)}
                </p>
                <MapButtons maps={l.maps} />
              </div>
            );
          }
          const p = entry.proposal;
          const open = p.status === "proposed";
          return (
            <div
              key={entry.id}
              className={`max-w-[92%] rounded-2xl border-2 bg-raised p-3.5 ${open ? "border-primary" : "border-line"} ${p.proposedBy === "owner" ? "self-end" : "self-start"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-2 font-semibold">
                  <Icon name="map" className="size-4 text-primary-text" />
                  {t("thread.proposal", { kind: t(`proposal.kind.${p.kind}` as const) })}
                </p>
                <Badge
                  tone={p.status === "accepted" ? "success" : p.status === "proposed" ? "info" : "neutral"}
                >
                  {t(`proposal.status.${p.status}` as const)}
                </Badge>
              </div>
              <p className="mt-1 font-medium">{p.place}</p>
              {p.meetAt ? <p className="text-sm">{p.meetAt.replace("T", " ")}</p> : null}
              {p.instructions ? (
                <p className="text-sm whitespace-pre-wrap text-muted">{p.instructions}</p>
              ) : null}
              <p className="text-xs text-muted">
                {p.proposedBy === "owner" ? t("thread.byYou") : t("thread.byFinder")} ·{" "}
                {format.dateTime(p.createdAt)}
              </p>
              <MapButtons maps={p.maps} />
              {open ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.proposedBy === "finder" ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        icon="check"
                        loading={responding === p.id}
                        onClick={() => respond(p.id, "accept")}
                      >
                        {t("proposal.accept")}
                      </Button>
                      <Button
                        size="sm"
                        disabled={responding === p.id}
                        onClick={() => respond(p.id, "decline")}
                      >
                        {t("proposal.decline")}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" loading={responding === p.id} onClick={() => respond(p.id, "cancel")}>
                      {t("proposal.cancel")}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface pt-3 pb-2 lg:static lg:bg-raised lg:px-5 lg:pb-4">
        <p role="alert" className="mb-2 text-sm font-medium text-danger empty:hidden">
          {error}
        </p>
        {canReply ? (
          <form onSubmit={send} className="flex flex-col gap-2">
            <label htmlFor="reply" className="sr-only">
              {t("thread.reply")}
            </label>
            <textarea
              id="reply"
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
              maxLength={4000}
              placeholder={t("thread.replyPlaceholder")}
              className="block max-h-40 min-h-12 w-full resize-y rounded-xl border border-line-strong bg-raised px-3 py-2.5"
            />
            <div className="flex flex-wrap justify-between gap-2">
              <Button icon="map" onClick={() => setDialog("proposal")}>
                {t("thread.proposeMeet")}
              </Button>
              <Button type="submit" variant="primary" icon="send" loading={sending} disabled={!body.trim()}>
                {t("thread.send")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sunken px-4 py-3">
            <p className="text-sm text-muted">
              {conv.status === "blocked" ? t("thread.blockedNote") : t("thread.closedNote")}
            </p>
            <Button onClick={() => status("reopen")}>
              {conv.status === "blocked" ? t("thread.unblock") : t("thread.reopen")}
            </Button>
          </div>
        )}
      </div>

      <Sheet open={dialog === "manage"} onClose={() => setDialog(null)} title={t("thread.manage")}>
        <SheetBody>
          {conv.status === "open" ? (
            <Button icon="check" onClick={() => status("close")}>
              {t("thread.close")}
            </Button>
          ) : (
            <Button icon="refresh" onClick={() => status("reopen")}>
              {conv.status === "blocked" ? t("thread.unblock") : t("thread.reopen")}
            </Button>
          )}
          {conv.status !== "blocked" ? (
            <Button variant="danger" icon="close" onClick={() => setDialog("block")}>
              {t("thread.block")}
            </Button>
          ) : null}
          <Button variant="danger" icon="trash" onClick={() => setDialog("delete")}>
            {t("thread.delete")}
          </Button>
        </SheetBody>
      </Sheet>
      <ConfirmDialog
        open={dialog === "block"}
        title={t("thread.blockTitle")}
        message={t("thread.blockBody")}
        confirmLabel={t("thread.block")}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await api.post(`/conversations/${id}/block`);
          toast(t("thread.blockedToast"));
          res.reload(true);
          onChanged();
        }}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        title={t("thread.deleteTitle")}
        message={t("thread.deleteBody")}
        confirmLabel={t("thread.delete")}
        typed="DELETE"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await api.delete(`/conversations/${id}`, { confirm: "DELETE" });
          toast(t("thread.deletedToast"));
          onChanged();
          navigate("/conversations");
        }}
      />
      <ProposalSheet
        open={dialog === "proposal"}
        conversationId={id}
        onClose={() => setDialog(null)}
        onSaved={() => {
          res.reload(true);
        }}
      />
    </div>
  );
}
