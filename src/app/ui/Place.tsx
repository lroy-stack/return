import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "../../shared/osm";
import type { MapLinks as MapLinkSet, ResolvedPlace } from "../../shared/schemas";
import { useT } from "../lib/i18n";
import { cx } from "./cx";
import { Icon } from "./Icon";

const coord = (n: number) => n.toFixed(5);

/** "© OpenStreetMap contributors" linked to the licence. Licence wording is never translated. */
export function OsmAttribution({ className }: { className?: string }) {
  return (
    <a
      href={OSM_COPYRIGHT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "touch-target underline decoration-line-strong underline-offset-2 hover:text-fg",
        className,
      )}
    >
      {OSM_ATTRIBUTION}
    </a>
  );
}

/**
 * A shared or proposed location, readable first: resolved name → context line → small coordinates
 * (+ accuracy) → OSM attribution. Falls back to the typed label and then to coordinates, so a location is
 * never shown empty. `label` is what a person typed ("Café next to the ticket machines").
 */
export function PlaceLabel({
  place,
  label,
  lat,
  lng,
  accuracyM,
  className,
}: {
  place: ResolvedPlace | null;
  label?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  className?: string;
}) {
  const hasCoords = lat != null && lng != null;
  const coords = hasCoords
    ? `${coord(lat)}, ${coord(lng)}${accuracyM != null ? ` · ±${Math.round(accuracyM)} m` : ""}`
    : null;
  const title = place?.name ?? label ?? coords ?? "";
  return (
    <div className={cx("flex min-w-0 gap-2.5", className)}>
      <Icon name="pin" className="mt-0.5 size-5 shrink-0 text-primary-text" />
      <div className="min-w-0">
        <p className="text-body font-semibold">{title}</p>
        {place?.detail ? <p className="text-subhead text-muted">{place.detail}</p> : null}
        {place && label && label !== place.name ? <p className="text-subhead">“{label}”</p> : null}
        {coords && title !== coords ? (
          <p className="font-mono text-caption text-muted tabular-nums">{coords}</p>
        ) : null}
        {place ? (
          <p className="text-caption text-muted">
            <OsmAttribution />
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Directions to a point as one compact pair (Google / Apple). Visible text is the brand name; the accessible
 * name is the full "Open in … Maps" phrase, which contains the visible label (WCAG 2.5.3). Destination only.
 */
export function MapLinks({ maps, className }: { maps: MapLinkSet | null; className?: string }) {
  const t = useT();
  if (!maps) return null;
  const link =
    "pressable inline-flex min-h-9 flex-1 whitespace-nowrap items-center justify-center gap-1.5 rounded-full bg-fill px-3.5 text-subhead font-semibold text-fg hover:bg-fill-hover pointer-coarse:min-h-11";
  return (
    <div className={cx("flex max-w-sm flex-wrap gap-2", className)}>
      <a
        href={maps.google}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t("thread.openGoogle")} (${t("common.opensNewTab")})`}
        className={link}
      >
        <Icon name="map" className="size-4" />
        Google Maps
      </a>
      <a
        href={maps.apple}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t("thread.openApple")} (${t("common.opensNewTab")})`}
        className={link}
      >
        <Icon name="map" className="size-4" />
        Apple Maps
      </a>
    </div>
  );
}
