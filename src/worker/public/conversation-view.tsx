import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "../../shared/osm";
import {
  type ConversationDetail,
  PROPOSAL_KINDS,
  type Proposal,
  type ResolvedPlace,
} from "../../shared/schemas";
import type { Language } from "../../shared/settings";
import { EMPTY_FORM, Field, FormErrorSummary, type FormState, LocationFields } from "./components";
import { formatCoordinate, formatInstant, formatWallClock } from "./format";
import { dict, fmt, proposalKindName, proposalStatusName } from "./i18n";
import { Layout } from "./layout";

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

/** Resolved place name with its context line and the attribution the OSM licence requires. */
function ResolvedPlaceInfo({ place }: { place: ResolvedPlace }) {
  return (
    <>
      <p>
        <strong>{place.name}</strong>
      </p>
      {place.detail ? <p class="muted">{place.detail}</p> : null}
    </>
  );
}

function OsmAttribution() {
  return (
    <p class="muted">
      <small>
        <a href={OSM_COPYRIGHT_URL} rel="noreferrer noopener" target="_blank">
          {OSM_ATTRIBUTION}
        </a>
      </small>
    </p>
  );
}

function Coordinates({
  lang,
  lat,
  lng,
  accuracyM,
}: {
  lang: Language;
  lat: number;
  lng: number;
  accuracyM: number | null;
}) {
  const t = dict(lang);
  return (
    <p class="muted">
      <small>
        {formatCoordinate(lat)}, {formatCoordinate(lng)}
        {accuracyM != null ? ` (${fmt(t.conv.approx, { n: Math.round(accuracyM) })})` : ""}
      </small>
    </p>
  );
}

function MapLinks({ lang, links }: { lang: Language; links: { google: string; apple: string } }) {
  const t = dict(lang);
  return (
    <p class="map-links">
      <a href={links.google} rel="noreferrer noopener" target="_blank">
        {t.conv.openGoogle}
      </a>
      <a href={links.apple} rel="noreferrer noopener" target="_blank">
        {t.conv.openApple}
      </a>
    </p>
  );
}

function ProposalCard({
  lang,
  token,
  proposal,
  open,
}: {
  lang: Language;
  token: string;
  proposal: Proposal;
  open: boolean;
}) {
  const t = dict(lang);
  const byFinder = proposal.proposedBy === "finder";
  const pending = proposal.status === "proposed" && open;
  const action = `/c/${token}/proposals/${proposal.id}/respond`;
  return (
    <li class={`proposal status-${proposal.status}`}>
      <p class="proposal-head">
        <strong>{proposalKindName(lang, proposal.kind)}</strong>
        <span class="chip">
          {proposal.status === "accepted" ? t.conv.agreed : proposalStatusName(lang, proposal.status)}
        </span>
      </p>
      <p class="muted">{byFinder ? t.conv.proposedByYou : t.conv.proposedByOwner}</p>
      <p>{proposal.place}</p>
      {proposal.resolvedPlace ? (
        <>
          <ResolvedPlaceInfo place={proposal.resolvedPlace} />
          <OsmAttribution />
        </>
      ) : null}
      {proposal.meetAt ? (
        <p>
          <strong>{t.conv.when}:</strong> {formatWallClock(proposal.meetAt, lang)}
        </p>
      ) : null}
      {proposal.instructions ? (
        <p>
          <strong>{t.conv.instructions}:</strong> {proposal.instructions}
        </p>
      ) : null}
      {proposal.status === "accepted" && proposal.maps ? (
        <MapLinks lang={lang} links={proposal.maps} />
      ) : null}
      {pending ? (
        <form method="post" action={action} class="actions">
          {byFinder ? (
            <button type="submit" name="action" value="cancel" class="btn btn-secondary">
              {t.conv.cancel}
            </button>
          ) : (
            <>
              <button type="submit" name="action" value="accept" class="btn btn-primary">
                {t.conv.accept}
              </button>
              <button type="submit" name="action" value="decline" class="btn btn-secondary">
                {t.conv.decline}
              </button>
            </>
          )}
        </form>
      ) : null}
    </li>
  );
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
  const { conversation, messages, locations, proposals } = detail;
  const stateFor = (name: FormName): FormState => (active === name ? form : EMPTY_FORM);
  const reply = stateFor("reply");
  const locationState = stateFor("location");
  const proposal = stateFor("proposal");
  const base = `/c/${token}`;
  return (
    <Layout lang={lang} title={conversation.subject}>
      <div data-poll-url={`${base}/state.json`} data-last-activity={conversation.lastMessageAt}>
        <h1>{conversation.subject}</h1>
        <div class="banner-new" data-new-banner hidden>
          <a href={base}>{t.conv.newReply}</a>
        </div>

        <section class="notice save-link" data-copy-section>
          <strong>{t.conv.saveTitle}</strong>
          <p>{t.conv.saveBody}</p>
          <button type="button" class="btn btn-secondary" data-copy data-copied={t.conv.copied} hidden>
            {t.conv.copy}
          </button>
        </section>

        {open ? null : (
          <div class="notice notice-closed" role="status">
            {t.conv.closedNotice}
          </div>
        )}

        <section aria-labelledby="thread">
          <h2 id="thread">{t.conv.thread}</h2>
          {messages.length === 0 ? <p class="muted">{t.conv.emptyThread}</p> : null}
          <ol class="thread">
            {messages.map((m) => (
              <li key={m.id} class={`bubble from-${m.sender}`}>
                <p class="who">
                  {m.sender === "finder" ? t.conv.you : m.sender === "owner" ? t.conv.owner : t.conv.system}
                </p>
                <p class="body">{m.body}</p>
                <time datetime={m.createdAt} data-local-time>
                  {formatInstant(m.createdAt, lang)}
                </time>
              </li>
            ))}
          </ol>
        </section>

        {locations.length > 0 ? (
          <section aria-labelledby="places">
            <h2 id="places">{t.conv.locations}</h2>
            <ul class="places">
              {locations.map((l) => (
                <li key={l.id} class="card">
                  <p class="muted">{l.sharedBy === "finder" ? t.conv.sharedByYou : t.conv.sharedByOwner}</p>
                  {l.label ? <p>{l.label}</p> : null}
                  {l.place ? <ResolvedPlaceInfo place={l.place} /> : null}
                  {l.lat != null && l.lng != null ? (
                    l.place ? (
                      <Coordinates lang={lang} lat={l.lat} lng={l.lng} accuracyM={l.accuracyM} />
                    ) : (
                      <p>
                        {formatCoordinate(l.lat)}, {formatCoordinate(l.lng)}
                        {l.accuracyM != null
                          ? ` (${fmt(t.conv.approx, { n: Math.round(l.accuracyM) })})`
                          : ""}
                      </p>
                    )
                  ) : null}
                  {l.place ? <OsmAttribution /> : null}
                  <time datetime={l.createdAt} data-local-time>
                    {formatInstant(l.createdAt, lang)}
                  </time>
                  {l.maps ? <MapLinks lang={lang} links={l.maps} /> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {proposals.length > 0 ? (
          <section aria-labelledby="props">
            <h2 id="props">{t.conv.proposals}</h2>
            <ul class="proposals">
              {proposals.map((p) => (
                <ProposalCard key={p.id} lang={lang} token={token} proposal={p} open={open} />
              ))}
            </ul>
          </section>
        ) : null}

        {open ? (
          <>
            <section class="card" aria-labelledby="reply">
              <h2 id="reply">{t.form.reply}</h2>
              <FormErrorSummary state={reply} t={t} />
              <form method="post" action={`${base}/messages`} class="stack">
                <Field id="reply-body" label={t.form.reply} error={reply.errors.message}>
                  <textarea id="reply-body" name="message" rows={4} maxlength={4000} required>
                    {reply.values.message ?? ""}
                  </textarea>
                </Field>
                <button type="submit" class="btn btn-primary btn-block">
                  {t.form.sendReply}
                </button>
              </form>
            </section>

            <details class="card" open={active === "location"}>
              <summary>{t.form.shareLocation}</summary>
              <FormErrorSummary state={locationState} t={t} />
              <form method="post" action={`${base}/location`} class="stack">
                <LocationFields lang={lang} state={locationState} idPrefix="cloc" />
                <button type="submit" class="btn btn-primary btn-block">
                  {t.form.shareLocationSend}
                </button>
              </form>
            </details>

            <details class="card" open={active === "proposal"}>
              <summary>{t.form.proposeHeading}</summary>
              <FormErrorSummary state={proposal} t={t} />
              <form method="post" action={`${base}/proposals`} class="stack">
                <Field id="p-kind" label={t.form.proposeKind} error={proposal.errors.kind}>
                  <select id="p-kind" name="kind" required>
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
                  />
                </Field>
                <Field
                  id="p-instr"
                  label={t.form.proposeInstructions}
                  optionalLabel={t.form.optional}
                  error={proposal.errors.instructions}
                >
                  <textarea id="p-instr" name="instructions" rows={3} maxlength={1000}>
                    {proposal.values.instructions ?? ""}
                  </textarea>
                </Field>
                <button type="submit" class="btn btn-primary btn-block">
                  {t.form.proposeSend}
                </button>
              </form>
            </details>
          </>
        ) : null}
      </div>
    </Layout>
  );
}
