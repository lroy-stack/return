import { type ConversationDetail, PROPOSAL_KINDS } from "../../shared/schemas";
import type { Language } from "../../shared/settings";
import {
  EMPTY_FORM,
  Field,
  FormErrorSummary,
  type FormState,
  fieldAria,
  LocationFields,
  SpriteIcon,
} from "./components";
import { dict, proposalKindName } from "./i18n";
import { Layout } from "./layout";
import { TimelineItems } from "./timeline";

export type FormName = "reply" | "location" | "proposal";

export interface ConversationViewProps {
  lang: Language;
  token: string;
  detail: ConversationDetail;
  /** Blocked conversations are presented as closed. */
  open: boolean;
  /** Which form the submitted state belongs to. */
  active?: FormName;
  form?: FormState;
}

/** The timeline list items as an HTML string (page body and polling responses share it). */
export async function renderTimelineHtml(props: {
  lang: Language;
  token: string;
  detail: ConversationDetail;
  open: boolean;
}): Promise<string> {
  return String(await (<TimelineItems {...props} />).toString());
}

export function ConversationPage({
  lang,
  token,
  detail,
  open,
  active,
  form = EMPTY_FORM,
}: ConversationViewProps) {
  const t = dict(lang);
  const { conversation } = detail;
  const stateFor = (name: FormName): FormState => (active === name ? form : EMPTY_FORM);
  const reply = stateFor("reply");
  const locationState = stateFor("location");
  const proposal = stateFor("proposal");
  const base = `/c/${token}`;
  const empty = detail.messages.length + detail.locations.length + detail.proposals.length === 0;
  const messages = JSON.stringify({
    newMessage: t.conv.newMessage,
    copied: t.conv.copied,
    sendFailed: t.form.sendFailed,
    shareTitle: t.conv.shareTitle,
  });
  return (
    <Layout
      lang={lang}
      title={conversation.subject}
      variant="chat"
      scripts={["/p/location.js", "/p/chat.js"]}
    >
      <div
        class="chat"
        data-chat
        data-timeline-url={`${base}/timeline`}
        data-cursor={conversation.lastMessageAt}
        data-open={open ? "1" : "0"}
        data-messages={messages}
      >
        <div class="chat-head">
          <h1>{conversation.subject}</h1>
          <details class="chat-info">
            <summary class="chat-info-toggle">{t.conv.info}</summary>
            <div class="chat-info-body" data-copy-section>
              <strong>{t.conv.saveTitle}</strong>
              <p>{t.conv.saveBody}</p>
              <div class="actions">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  data-copy
                  data-copied={t.conv.copied}
                  hidden
                >
                  <SpriteIcon name="copy" size={16} />
                  {t.conv.copy}
                </button>
                <button type="button" class="btn btn-secondary btn-sm" data-share hidden>
                  <SpriteIcon name="share" size={16} />
                  {t.conv.share}
                </button>
              </div>
              <p>
                <a class="footer-link" href={`/privacy?lang=${lang}`}>
                  {t.conv.privacyNote}
                </a>
              </p>
            </div>
          </details>
        </div>

        {open ? null : (
          <div class="notice notice-closed" role="status">
            <SpriteIcon name="closed" />
            {t.conv.closedNotice}
          </div>
        )}

        <div class="thread-wrap">
          <div
            class="thread-scroll"
            data-thread
            tabindex={0}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={t.conv.thread}
          >
            {empty ? <p class="muted">{t.conv.emptyThread}</p> : null}
            <ol class="timeline" data-timeline>
              <TimelineItems lang={lang} token={token} detail={detail} open={open} />
            </ol>
          </div>
          <button type="button" class="new-pill" data-new-pill hidden>
            {t.conv.newMessage}
          </button>
        </div>

        {open ? (
          <div class="composer-wrap">
            <FormErrorSummary state={reply} t={t} />
            {reply.errors.message ? (
              <p class="field-error" id="reply-body-error">
                {reply.errors.message}
              </p>
            ) : null}
            <FormErrorSummary state={locationState} t={t} />
            <FormErrorSummary state={proposal} t={t} />
            <p class="field-error" role="alert" data-compose-error hidden />
            <div class="composer">
              <details class="plus" open={active === "location" || active === "proposal"}>
                <summary class="plus-btn" aria-label={t.conv.more} title={t.conv.more}>
                  <SpriteIcon name="plus" size={24} />
                </summary>
                <div class="plus-panel">
                  <details class="card" open={active === "location"}>
                    <summary>{t.form.shareLocation}</summary>
                    <form method="post" action={`${base}/location`} class="stack" data-async>
                      <LocationFields lang={lang} state={locationState} idPrefix="cloc" />
                      <button type="submit" class="btn btn-primary btn-block">
                        {t.form.shareLocationSend}
                      </button>
                    </form>
                  </details>
                  <details class="card" open={active === "proposal"}>
                    <summary>{t.form.proposeHeading}</summary>
                    <form method="post" action={`${base}/proposals`} class="stack" data-async>
                      <Field id="p-kind" label={t.form.proposeKind} error={proposal.errors.kind}>
                        <select
                          id="p-kind"
                          name="kind"
                          required
                          {...fieldAria("p-kind", { error: proposal.errors.kind })}
                        >
                          {PROPOSAL_KINDS.map((k) => (
                            <option key={k} value={k} selected={proposal.values.kind === k}>
                              {proposalKindName(lang, k)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field id="p-place" label={t.form.proposePlace} error={proposal.errors.place}>
                        <input
                          id="p-place"
                          name="place"
                          type="text"
                          maxlength={300}
                          required
                          value={proposal.values.place ?? ""}
                          {...fieldAria("p-place", { error: proposal.errors.place })}
                        />
                      </Field>
                      <Field
                        id="p-when"
                        label={t.form.proposeWhen}
                        optionalLabel={t.form.optional}
                        error={proposal.errors.meetAt}
                      >
                        <input
                          id="p-when"
                          name="meet_at"
                          type="datetime-local"
                          value={proposal.values.meet_at ?? ""}
                          {...fieldAria("p-when", { error: proposal.errors.meetAt })}
                        />
                        <input
                          type="hidden"
                          name="meet_tz"
                          value={proposal.values.meet_tz ?? ""}
                          data-browser-tz
                        />
                      </Field>
                      <Field
                        id="p-instr"
                        label={t.form.proposeInstructions}
                        optionalLabel={t.form.optional}
                        error={proposal.errors.instructions}
                      >
                        <textarea
                          id="p-instr"
                          name="instructions"
                          rows={3}
                          maxlength={1000}
                          {...fieldAria("p-instr", { error: proposal.errors.instructions })}
                        >
                          {proposal.values.instructions ?? ""}
                        </textarea>
                      </Field>
                      <button type="submit" class="btn btn-primary btn-block">
                        {t.form.proposeSend}
                      </button>
                    </form>
                  </details>
                </div>
              </details>
              <form method="post" action={`${base}/messages`} class="reply" data-async data-compose>
                <label for="reply-body" class="visually-hidden">
                  {t.form.reply}
                </label>
                <textarea
                  id="reply-body"
                  name="message"
                  rows={1}
                  maxlength={4000}
                  required
                  enterkeyhint="send"
                  autocomplete="off"
                  dir="auto"
                  placeholder={t.form.reply}
                  {...fieldAria("reply-body", { error: reply.errors.message })}
                >
                  {reply.values.message ?? ""}
                </textarea>
                <button type="submit" class="btn btn-primary send-btn">
                  <SpriteIcon name="send" size={24} />
                  <span class="visually-hidden">{t.form.sendReply}</span>
                </button>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
