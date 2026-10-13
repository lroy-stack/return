import type { GeocodeReverseResponse, ResolvedPlace } from "../../shared/schemas";
import { api, qs } from "./api";
import type { Fix } from "./geolocation";

/** The place name for a position, or null when OpenStreetMap has none or cannot be asked (use the coordinates then). */
export async function reverseLookup(fix: Fix): Promise<ResolvedPlace | null> {
  try {
    const res = await api.get<GeocodeReverseResponse>(
      `/geocode/reverse${qs({ lat: fix.lat.toFixed(6), lng: fix.lng.toFixed(6) })}`,
    );
    return res.place;
  } catch {
    return null;
  }
}

/** "40.41650, -3.70380": what a place without a name is called. */
export const coordsText = (fix: Pick<Fix, "lat" | "lng">): string =>
  `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}`;
