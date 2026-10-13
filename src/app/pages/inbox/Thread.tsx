import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  ConversationDetail,
  Message,
  Proposal,
  ProposalStatus,
  SharedLocation,
} from "../../../shared/schemas";
import { api } from "../../lib/api";
import { useMediaQuery, useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { didNavigate, Link, navigate } from "../../lib/router";
import { useFormat } from "../../lib/settings-context";
import { StatusPill } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { TextArea } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Menu, type MenuEntry } from "../../ui/Menu";
import { MapLinks, PlaceLabel } from "../../ui/Place";
import { ErrorState, errorMessage, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { BlockSheet } from "./BlockSheet";
import { ProposalSheet } from "./ProposalSheet";

type Entry =
  | { kind: "message"; at: string; id: string; message: Message }
  | { kind: "location"; at: string; id: string; location: SharedLocation }
  | { kind: "proposal"; at: string; id: string; proposal: Proposal };

const PLAN_TONE: Record<ProposalStatus, "success" | "info" | "neutral"> = {
  proposed: "info",
  accepted: "success",
  declined: "neutral",
  cancelled: "neutral",
  superseded: "neutral",
};

export function Thread({ id, onChanged }: { id: string; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const format = useFormat();
  const res = useResource<ConversationDetail>(
    `conv-${id}`,
    (signal) => api.get<ConversationDetail>(`/conversations/${id}`, signal),
    { pollMs: 30_000 },
  );
  const finePointer = useMediaQuery("(pointer: fine)");
  const heading = useRef<HTMLHeadingElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  // Set synchronously: a second Ctrl/Cmd+Enter in the same frame must not start another request.
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"block" | "delete" | "proposal" | null>(null);
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
          className="inline-flex min-h-11 items-center gap-1 font-medium text-primary-text xl:hidden"
        >
          <Icon name="back" className="size-4" />
          {t("nav.inbox")}
        </Link>
        <ErrorState error={res.state.error} onRetry={() => res.reload()} />
      </div>
    );

  const { conversation: conv } = res.state.data;
  const canReply = conv.status === "open";
  const manage: MenuEntry[] = [
    conv.status === "open"
      ? { key: "close", label: t("thread.close"), icon: "check", onSelect: () => void status("close") }
      : conv.status === "blocked"
        ? {
            key: "unblock",
            label: t("thread.unblock"),
            icon: "refresh",
            onSelect: () => void status("unblock"),
          }
        : {
            key: "reopen",
            label: t("thread.reopen"),
            icon: "refresh",
            onSelect: () => void status("reopen"),
          },
    ...(conv.status !== "blocked"
      ? [
          {
            key: "block",
            label: t("thread.block"),
            icon: "close",
            tone: "danger",
            onSelect: () => setDialog("block"),
          } as const,
        ]
      : []),
    { key: "sep", separator: true },
    {
      key: "delete",
      label: t("thread.delete"),
      icon: "trash",
      tone: "danger",
      onSelect: () => setDialog("delete"),
    },
  ];

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
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
      sendingRef.current = false;
      setSending(false);
    }
  };

  const status = async (action: "close" | "reopen" | "unblock") => {
    setError(null);
    try {
      await api.post(`/conversations/${id}/${action}`);
      toast(action === "close" ? t("thread.closedToast") : t("thread.reopenedToast"));
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
    <div className="flex min-h-0 flex-1 flex-col xl:h-[calc(100dvh-12rem)] xl:min-h-[30rem] xl:rounded-card xl:bg-raised xl:shadow-card xl:ring-1 xl:ring-line/70">
      <header className="flex flex-col gap-2 border-b border-line pb-3 xl:px-5 xl:pt-4">
        <Link
          to="/conversations"
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-0.5 rounded-full pr-3 pl-1.5 text-body font-medium text-primary-text hover:bg-fill xl:hidden"
        >
          <Icon name="back" className="size-5" />
          {t("nav.inbox")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 ref={heading} tabIndex={-1} dir="auto" className="text-title2 font-bold outline-none">
              {conv.subject}
            </h2>
            <p className="text-subhead text-muted">
              {[conv.finderName ?? t("thread.finder"), conv.tagLabel].filter(Boolean).join(" · ")}
              {conv.itemId ? (
                <>
                  {" · "}
                  <Link
                    to={`/items/${conv.itemId}`}
                    className="touch-target font-medium text-primary-text underline"
                  >
                    {conv.itemName ?? t("thread.item")}
                  </Link>
                </>
              ) : null}
            </p>
            {conv.finderEmail ? <p className="text-subhead text-muted">{conv.finderEmail}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={conv.status === "open" ? "success" : "neutral"}>
              {t(`conv.status.${conv.status}` as const)}
            </StatusPill>
            <Menu label={t("thread.more")} items={manage} size="sm" />
          </div>
        </div>
      </header>

      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-label={t("inbox.thread")}
        className="flex min-h-0 flex-1 flex-col gap-3 py-4 xl:overflow-y-auto xl:px-5"
      >
        {entries.map((entry) => {
          if (entry.kind === "message") {
            const m = entry.message;
            if (m.sender === "system")
              return (
                <p
                  key={entry.id}
                  dir="auto"
                  className="self-center rounded-full bg-sunken px-3 py-1 text-center text-footnote text-muted"
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
                  dir="auto"
                  className={`rounded-[1.25rem] px-4 py-2.5 whitespace-pre-wrap ${mine ? "rounded-br-md bg-primary text-primary-fg" : "rounded-bl-md bg-sunken text-fg"}`}
                >
                  <span className="sr-only">{mine ? t("thread.you") : t("thread.finder")}: </span>
                  {m.body}
                </div>
                <span className="px-1 text-footnote text-muted">{format.dateTime(m.createdAt)}</span>
              </div>
            );
          }
          if (entry.kind === "location") {
            const l = entry.location;
            return (
              <Card
                key={entry.id}
                as="div"
                variant="outline"
                padding="sm"
                className={`flex w-full max-w-sm flex-col gap-3 ${l.sharedBy === "owner" ? "self-end" : "self-start"}`}
              >
                <p className="text-footnote font-semibold text-muted">
                  {l.sharedBy === "finder" ? t("thread.finderLocation") : t("thread.yourLocation")}
                </p>
                <PlaceLabel place={l.place} label={l.label} lat={l.lat} lng={l.lng} accuracyM={l.accuracyM} />
                <p className="text-footnote text-muted">
                  {l.source === "gps" ? t("thread.gps") : t("thread.manual")} · {format.dateTime(l.createdAt)}
                </p>
                <MapLinks maps={l.maps} />
              </Card>
            );
          }
          const p = entry.proposal;
          const open = p.status === "proposed";
          return (
            <Card
              key={entry.id}
              as="div"
              variant="outline"
              padding="sm"
              className={`flex w-full max-w-sm flex-col gap-3 ${p.proposedBy === "owner" ? "self-end" : "self-start"} ${open ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-subhead font-semibold">
                  {t("thread.proposal", { kind: t(`proposal.kind.${p.kind}` as const) })}
                </p>
                <StatusPill tone={PLAN_TONE[p.status]}>
                  {t(`proposal.status.${p.status}` as const)}
                </StatusPill>
              </div>
              <PlaceLabel place={p.resolvedPlace} label={p.place} lat={p.lat} lng={p.lng} />
              {p.meetAt ? (
                <p className="flex items-center gap-2 text-subhead">
                  <Icon name="clock" className="size-4 text-muted" />
                  {format.meeting(p.meetAt, p.meetTz)}
                </p>
              ) : null}
              {p.instructions ? (
                <p dir="auto" className="text-subhead whitespace-pre-wrap text-muted">
                  {p.instructions}
                </p>
              ) : null}
              <p className="text-footnote text-muted">
                {p.proposedBy === "owner" ? t("thread.byYou") : t("thread.byFinder")} ·{" "}
                {format.dateTime(p.createdAt)}
              </p>
              <MapLinks maps={p.maps} />
              {open ? (
                <div className="flex flex-wrap gap-2">
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
            </Card>
          );
        })}
      </div>

      <div className="z-20 border-t border-line bg-surface pt-3 pb-2 max-xl:sticky max-xl:bottom-[var(--shell-bottom)] xl:bg-raised xl:px-5 xl:pb-4">
        <p role="alert" className="mb-2 text-subhead font-medium text-danger empty:hidden">
          {error}
        </p>
        {canReply ? (
          <form onSubmit={send} className="flex flex-col gap-2">
            <TextArea
              dir="auto"
              label={t("thread.reply")}
              labelHidden
              rows={2}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Held-down keys repeat and IME confirmation also fires Enter: only a fresh press sends.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.repeat && !e.nativeEvent.isComposing)
                  e.currentTarget.form?.requestSubmit();
              }}
              maxLength={4000}
              placeholder={t("thread.replyPlaceholder")}
              hint={finePointer ? t("thread.replyHint") : undefined}
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-sunken px-4 py-3">
            <p className="text-subhead text-muted">
              {conv.status === "blocked" ? t("thread.blockedNote") : t("thread.closedNote")}
            </p>
            <Button onClick={() => status(conv.status === "blocked" ? "unblock" : "reopen")}>
              {conv.status === "blocked" ? t("thread.unblock") : t("thread.reopen")}
            </Button>
          </div>
        )}
      </div>

      <BlockSheet
        open={dialog === "block"}
        conversationId={id}
        onClose={() => setDialog(null)}
        onBlocked={() => {
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
