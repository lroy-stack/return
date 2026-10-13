import { type FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ConversationDetail,
  Message,
  Proposal,
  ProposalStatus,
  SharedLocation,
} from "../../../shared/schemas";
import { api } from "../../lib/api";
import { useKeyboardBox, useMediaQuery, useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { didNavigate, Link, navigate } from "../../lib/router";
import { useFormat } from "../../lib/settings-context";
import { Badge, StatusPill } from "../../ui/Badge";
import { Button, IconButton } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { cx } from "../../ui/cx";
import { TextArea } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { Menu, type MenuEntry } from "../../ui/Menu";
import { MapLinks, PlaceLabel } from "../../ui/Place";
import { ErrorState, errorMessage, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { BlockSheet } from "./BlockSheet";
import { ProposalSheet } from "./ProposalSheet";
import { ShareLocationSheet } from "./ShareLocationSheet";

type Entry =
  | { kind: "message"; at: string; id: string; message: Message }
  | { kind: "location"; at: string; id: string; location: SharedLocation }
  | { kind: "proposal"; at: string; id: string; proposal: Proposal };

/** The reader counts as "at the bottom" within this many pixels of it. */
const BOTTOM_SLACK_PX = 64;

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
  const keyboard = useKeyboardBox();
  const heading = useRef<HTMLHeadingElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  // Set synchronously: a second Ctrl/Cmd+Enter in the same frame must not start another request.
  const sendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"block" | "delete" | "proposal" | "location" | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const data = res.state.status === "ready" ? res.state.data : null;
  const loaded = data !== null;
  const count = data ? data.messages.length + data.locations.length + data.proposals.length : 0;
  // Smart auto-scroll: follow new entries only while the reader is at the bottom (or just sent something);
  // otherwise leave the history alone and offer a "New messages" pill.
  const atBottom = useRef(true);
  const followNext = useRef(true);
  const seen = useRef(0);
  const [unseen, setUnseen] = useState(0);
  const conv = data?.conversation ?? null;

  // Opening a thread marks it read on the server: refresh the list/badge once, and move focus to the title.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once when the thread first loads
  useEffect(() => {
    if (!loaded) return;
    onChanged();
    if (didNavigate()) heading.current?.focus({ preventScroll: true });
  }, [loaded]);

  const scrollToEnd = (smooth: boolean) => {
    const el = log.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when entries are added
  useLayoutEffect(() => {
    if (!loaded) return;
    const first = seen.current === 0;
    if (first || atBottom.current || followNext.current) {
      followNext.current = false;
      atBottom.current = true;
      seen.current = count;
      setUnseen(0);
      scrollToEnd(!first);
    } else if (count > seen.current) setUnseen(count - seen.current);
  }, [loaded, count]);

  // A growing composer shrinks the log: keep the newest message in view when the reader was at the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: observe once the log exists
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  const onLogScroll = () => {
    const el = log.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;
    atBottom.current = near;
    if (near && seen.current !== count) {
      seen.current = count;
      setUnseen(0);
    }
  };

  // The tab title names the finder, not just "Inbox".
  const inboxTitle = t("nav.inbox");
  const docTitle = conv ? (conv.finderName ?? conv.subject) : null;
  useEffect(() => {
    if (!docTitle) return;
    document.title = `${docTitle} · RETURN`;
    return () => {
      document.title = `${inboxTitle} · RETURN`;
    };
  }, [docTitle, inboxTitle]);

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

  const { conversation: info } = res.state.data;
  const canReply = info.status === "open";
  const manage: MenuEntry[] = [
    info.status === "open"
      ? { key: "close", label: t("thread.close"), icon: "check", onSelect: () => void status("close") }
      : info.status === "blocked"
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
    ...(info.status !== "blocked"
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
      followNext.current = true;
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
      followNext.current = true;
      res.reload(true);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setResponding(null);
    }
  };

  const title = info.finderName ?? info.subject;
  const context = [info.finderName ? info.subject : null, info.tagLabel].filter(Boolean).join(" · ");

  return (
    <div
      style={keyboard ? { top: keyboard.top, height: keyboard.height, bottom: "auto" } : undefined}
      className={cx(
        "flex min-h-0 flex-col bg-surface",
        // Phones and tablets: the chat owns the viewport under the glass header (the tab bar floats over the
        // composer's reserved bottom padding). From xl it is a card next to the list.
        "max-xl:fixed max-xl:top-[var(--header-h)] max-xl:right-0 max-xl:bottom-0 max-xl:left-[var(--shell-left)]",
        keyboard ? "max-xl:z-50" : "max-xl:z-20",
        "xl:h-[calc(100dvh-12rem)] xl:min-h-[30rem] xl:rounded-card xl:bg-raised xl:shadow-card xl:ring-1 xl:ring-line/70",
      )}
    >
      <header className="flex shrink-0 flex-col gap-1 border-b border-line px-page-x pb-2 xl:px-5 xl:pt-4 xl:pb-3">
        <div className="flex items-center gap-2">
          <Link
            to="/conversations"
            aria-label={t("nav.inbox")}
            className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-primary-text hover:bg-fill xl:hidden"
          >
            <Icon name="back" className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h2
              ref={heading}
              tabIndex={-1}
              dir="auto"
              className="truncate text-headline font-bold outline-none xl:text-title2"
            >
              {title}
            </h2>
            <p className="truncate text-footnote text-muted xl:text-subhead">
              {context}
              {info.itemId ? (
                <>
                  {context ? " · " : null}
                  <Link
                    to={`/items/${info.itemId}`}
                    className="touch-target font-medium text-primary-text underline"
                  >
                    {info.itemName ?? t("thread.item")}
                  </Link>
                </>
              ) : null}
            </p>
            {info.finderEmail ? (
              <p className="truncate text-footnote text-muted short:hidden xl:text-subhead">
                {info.finderEmail}
              </p>
            ) : null}
          </div>
          <StatusPill tone={info.status === "open" ? "success" : "neutral"}>
            {t(`conv.status.${info.status}` as const)}
          </StatusPill>
          <Menu label={t("thread.more")} items={manage} size="sm" />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={log}
          role="log"
          aria-live="polite"
          aria-label={t("inbox.thread")}
          onScroll={onLogScroll}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-page-x py-4 xl:px-5"
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-footnote font-semibold text-muted">
                      {l.sharedBy === "finder" ? t("thread.finderLocation") : t("thread.yourLocation")}
                    </p>
                    {l.approximate ? <Badge tone="warning">{t("thread.approximate")}</Badge> : null}
                  </div>
                  <PlaceLabel
                    place={l.place}
                    label={l.label}
                    lat={l.lat}
                    lng={l.lng}
                    accuracyM={l.accuracyM}
                  />
                  <p className="text-footnote text-muted">
                    {l.source === "gps" ? t("thread.gps") : t("thread.manual")} ·{" "}
                    {format.dateTime(l.createdAt)}
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
        {unseen > 0 ? (
          <button
            type="button"
            onClick={() => {
              followNext.current = false;
              atBottom.current = true;
              seen.current = count;
              setUnseen(0);
              scrollToEnd(true);
            }}
            className="pressable specular absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-4 text-subhead font-semibold text-primary-fg hover:bg-primary-hover"
          >
            <Icon name="chevron_down" className="size-4" />
            {t("thread.newMessages")}
          </button>
        ) : null}
      </div>

      <div
        className={cx(
          "shrink-0 border-t border-line bg-surface px-page-x pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] xl:bg-raised xl:px-5 xl:pb-4",
          // Phones: reserve the floating tab bar so the composer sits above it and nothing shows through below.
          !keyboard && "max-sm:pb-[calc(var(--shell-bottom)+0.25rem)]",
        )}
      >
        <p role="alert" className="mb-2 text-subhead font-medium text-danger empty:hidden">
          {error}
        </p>
        {canReply ? (
          <form onSubmit={send} className="flex items-end gap-2">
            <Menu
              icon="plus"
              label={t("thread.attach")}
              align="start"
              items={[
                {
                  key: "plan",
                  label: t("thread.proposeMeet"),
                  icon: "map",
                  onSelect: () => setDialog("proposal"),
                },
                {
                  key: "location",
                  label: t("share.menu"),
                  icon: "pin",
                  onSelect: () => setDialog("location"),
                },
              ]}
            />
            <TextArea
              className="min-w-0 flex-1"
              dir="auto"
              label={t("thread.reply")}
              labelHidden
              autoGrow={5}
              enterKeyHint="send"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends and Shift+Enter is a new line, on every device (the key reads "Send"); Ctrl/Cmd+Enter
                // sends too. IME confirmation also fires Enter and held keys repeat: neither may send.
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (e.repeat) return;
                e.currentTarget.form?.requestSubmit();
              }}
              maxLength={4000}
              placeholder={t("thread.replyPlaceholder")}
              hint={finePointer ? t("thread.replyHint") : undefined}
            />
            <IconButton
              type="submit"
              icon="send"
              variant="primary"
              label={t("thread.send")}
              aria-busy={sending || undefined}
              disabled={!body.trim() || sending}
            />
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-sunken px-4 py-3">
            <p className="text-subhead text-muted">
              {info.status === "blocked" ? t("thread.blockedNote") : t("thread.closedNote")}
            </p>
            <Button onClick={() => status(info.status === "blocked" ? "unblock" : "reopen")}>
              {info.status === "blocked" ? t("thread.unblock") : t("thread.reopen")}
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
      <ShareLocationSheet
        open={dialog === "location"}
        conversationId={id}
        onClose={() => setDialog(null)}
        onShared={() => {
          followNext.current = true;
          res.reload(true);
        }}
      />
      <ProposalSheet
        open={dialog === "proposal"}
        conversationId={id}
        onClose={() => setDialog(null)}
        onSaved={() => {
          followNext.current = true;
          res.reload(true);
        }}
      />
    </div>
  );
}
