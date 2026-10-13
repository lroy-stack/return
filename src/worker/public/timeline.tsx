import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "../../shared/osm";
import type {
  ConversationDetail,
  Message,
  Proposal,
  ResolvedPlace,
  SharedLocation,
} from "../../shared/schemas";
import type { Language } from "../../shared/settings";
import { SpriteIcon } from "./components";
import { formatCoordinate, formatInstant, formatWallClock } from "./format";
import { dict, fmt, proposalKindName, proposalStatusName } from "./i18n";

/**
 * One chronological timeline for messages, shared places and return plans. The same markup is
 * rendered into the page and returned by the polling endpoint, so both stay identical.
 * Day separators are computed in UTC here; chat.js regroups them by the viewer's own day.
 */

type Entry =
  | { kind: "message"; at: string; item: Message }
  | { kind: "place"; at: string; item: SharedLocation }
  | { kind: "plan"; at: string; item: Proposal };

export function timelineEntries(detail: ConversationDetail): Entry[] {
  const entries: Entry[] = [
    ...detail.messages.map((item): Entry => ({ kind: "message", at: item.createdAt, item })),
    ...detail.locations.map((item): Entry => ({ kind: "place", at: item.createdAt, item })),
    ...detail.proposals.map((item): Entry => ({ kind: "plan", at: item.createdAt, item })),
  ];
  // Array.sort is stable: items created in the same instant keep messages, places, plans order.
  return entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Stable DOM id of a timeline item; the no-JS redirect jumps to it. */
export const itemAnchor = (id: string) => `i-${id}`;

function ResolvedPlaceInfo({ place }: { place: ResolvedPlace }) {
  return (
    <>
      <p class="place-name">{place.name}</p>
      {place.detail ? <p class="place-detail">{place.detail}</p> : null}
    </>
  );
}

function OsmAttribution() {
  return (
    <p class="place-attrib">
      <a href={OSM_COPYRIGHT_URL} rel="noreferrer noopener" target="_blank">
        {OSM_ATTRIBUTION}
      </a>
    </p>
  );
}

function MapLinks({ lang, links }: { lang: Language; links: { google: string; apple: string } }) {
  const t = dict(lang);
  return (
    <p class="map-links">
      <a href={links.google} rel="noreferrer noopener" target="_blank" aria-label={t.conv.openGoogle}>
        {t.conv.mapGoogle}
      </a>
      <a href={links.apple} rel="noreferrer noopener" target="_blank" aria-label={t.conv.openApple}>
        {t.conv.mapApple}
      </a>
    </p>
  );
}

function Stamp({ at, lang }: { at: string; lang: Language }) {
  return (
    <time datetime={at} data-local-time>
      {formatInstant(at, lang)}
    </time>
  );
}

function Who({ lang, sender }: { lang: Language; sender: "finder" | "owner" | "system" }) {
  const t = dict(lang);
  return (
    <p class="who">{sender === "finder" ? t.conv.you : sender === "owner" ? t.conv.owner : t.conv.system}</p>
  );
}

function PlaceItem({ lang, place }: { lang: Language; place: SharedLocation }) {
  const t = dict(lang);
  return (
    <li
      id={itemAnchor(place.id)}
      class={`bubble kind-place from-${place.sharedBy}`}
      data-id={place.id}
      data-at={place.createdAt}
      data-rev={place.place ? "resolved" : "raw"}
    >
      <p class="who">
        <SpriteIcon name="pin" size={16} />
        {place.sharedBy === "finder" ? t.conv.sharedByYou : t.conv.sharedByOwner}
      </p>
      {place.label ? (
        <p class="place-label" dir="auto">
          “{place.label}”
        </p>
      ) : null}
      {place.place ? <ResolvedPlaceInfo place={place.place} /> : null}
      {place.lat != null && place.lng != null ? (
        <p class="place-coords">
          {formatCoordinate(place.lat)}, {formatCoordinate(place.lng)}
          {place.accuracyM != null ? ` (${fmt(t.conv.approx, { n: Math.round(place.accuracyM) })})` : ""}
        </p>
      ) : null}
      {place.place ? <OsmAttribution /> : null}
      {place.maps ? <MapLinks lang={lang} links={place.maps} /> : null}
      <Stamp at={place.createdAt} lang={lang} />
    </li>
  );
}

function PlanItem({
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
    <li
      id={itemAnchor(proposal.id)}
      class={`bubble kind-plan from-${proposal.proposedBy} status-${proposal.status}`}
      data-id={proposal.id}
      data-at={proposal.createdAt}
      data-rev={`${proposal.status}-${proposal.resolvedPlace ? 1 : 0}-${open ? 1 : 0}`}
    >
      <p class="who">
        <SpriteIcon name="returning" size={16} />
        {t.conv.proposals} · {byFinder ? t.conv.proposedByYou : t.conv.proposedByOwner}
      </p>
      <p class="proposal-head">
        <strong>{proposalKindName(lang, proposal.kind)}</strong>
        <span class={`pill pill-${proposal.status}`}>
          {proposal.status === "accepted" ? t.conv.agreed : proposalStatusName(lang, proposal.status)}
        </span>
      </p>
      <p class="place-label" dir="auto">
        {proposal.place}
      </p>
      {proposal.resolvedPlace ? (
        <>
          <ResolvedPlaceInfo place={proposal.resolvedPlace} />
          <OsmAttribution />
        </>
      ) : null}
      {proposal.meetAt ? (
        <p>
          <strong>{t.conv.when}:</strong> {formatWallClock(proposal.meetAt, proposal.meetTz, lang)}
        </p>
      ) : null}
      {proposal.instructions ? (
        <p dir="auto">
          <strong>{t.conv.instructions}:</strong> {proposal.instructions}
        </p>
      ) : null}
      {proposal.status === "accepted" && proposal.maps ? (
        <MapLinks lang={lang} links={proposal.maps} />
      ) : null}
      {pending ? (
        <form method="post" action={action} class="actions" data-async>
          {byFinder ? (
            <button type="submit" name="action" value="cancel" class="btn btn-secondary btn-sm">
              {t.conv.cancel}
            </button>
          ) : (
            <>
              <button type="submit" name="action" value="accept" class="btn btn-primary btn-sm">
                {t.conv.accept}
              </button>
              <button type="submit" name="action" value="decline" class="btn btn-secondary btn-sm">
                {t.conv.decline}
              </button>
            </>
          )}
        </form>
      ) : null}
      <Stamp at={proposal.createdAt} lang={lang} />
    </li>
  );
}

function MessageItem({ lang, message }: { lang: Language; message: Message }) {
  return (
    <li
      id={itemAnchor(message.id)}
      class={`bubble kind-message from-${message.sender}`}
      data-id={message.id}
      data-at={message.createdAt}
      data-rev="1"
    >
      <Who lang={lang} sender={message.sender} />
      <p class="body" dir="auto">
        {message.body}
      </p>
      <Stamp at={message.createdAt} lang={lang} />
    </li>
  );
}

function DaySeparator({ at, lang }: { at: string; lang: Language }) {
  const label = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(at));
  return (
    <li class="day" data-day>
      <time datetime={at.slice(0, 10)}>{label}</time>
    </li>
  );
}

export function TimelineItems({
  lang,
  token,
  detail,
  open,
}: {
  lang: Language;
  token: string;
  detail: ConversationDetail;
  open: boolean;
}) {
  let day = "";
  return (
    <>
      {timelineEntries(detail).map((entry) => {
        const separator =
          entry.at.slice(0, 10) !== day ? (
            <DaySeparator key={`d-${entry.at}`} at={entry.at} lang={lang} />
          ) : null;
        day = entry.at.slice(0, 10);
        return (
          <>
            {separator}
            {entry.kind === "message" ? (
              <MessageItem lang={lang} message={entry.item} />
            ) : entry.kind === "place" ? (
              <PlaceItem lang={lang} place={entry.item} />
            ) : (
              <PlanItem lang={lang} token={token} proposal={entry.item} open={open} />
            )}
          </>
        );
      })}
    </>
  );
}

/** Anchor of the newest timeline item, or null for an empty conversation. */
export function newestAnchor(detail: ConversationDetail): string | null {
  const last = timelineEntries(detail).at(-1);
  return last ? itemAnchor(last.item.id) : null;
}
