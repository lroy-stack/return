import type { MapLinks } from "./schemas";

export interface MapTarget {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
}

/**
 * Directions links to an agreed destination in Google Maps and Apple Maps.
 * The origin is deliberately omitted: each person's own maps app uses their current
 * position locally, so RETURN never sees or stores it.
 */
export function mapLinks(target: MapTarget): MapLinks | null {
  const hasCoords = typeof target.lat === "number" && typeof target.lng === "number";
  const label = target.label?.trim() || null;
  if (!hasCoords && !label) return null;
  const destination = hasCoords
    ? `${round(target.lat as number)},${round(target.lng as number)}`
    : (label as string);

  const google = new URL("https://www.google.com/maps/dir/");
  google.searchParams.set("api", "1");
  google.searchParams.set("destination", destination);

  const apple = new URL("https://maps.apple.com/");
  apple.searchParams.set("daddr", destination);
  if (hasCoords && label) apple.searchParams.set("q", label);

  return { google: google.toString(), apple: apple.toString() };
}

/** ~1 m precision; more digits only leak noise. */
function round(n: number): string {
  return n.toFixed(5);
}
