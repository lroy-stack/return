import { isIos } from "./install";

/** A position fix. `accuracyM` is the 68 % radius in metres, null when the device did not say. */
export interface Fix {
  lat: number;
  lng: number;
  accuracyM: number | null;
}

export type GeoErrorKind = "unsupported" | "denied" | "unavailable" | "timeout";

export class GeoError extends Error {
  constructor(readonly kind: GeoErrorKind) {
    super(`geolocation ${kind}`);
    this.name = "GeoError";
  }
}

/** Quick, low-power fix first (indoors a GPS lock can take a minute) ... */
const COARSE: PositionOptions = { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 };
/** ... then one attempt at a precise one. */
const FINE: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 };

function getPosition(options: PositionOptions): Promise<Fix> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyM: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        }),
      (e) => reject(new GeoError(e.code === 1 ? "denied" : e.code === 3 ? "timeout" : "unavailable")),
      options,
    );
  });
}

/**
 * Two-stage geolocation. Must be called from a user gesture (the browser asks for permission there).
 * `onFix` receives the quick fix as soon as it exists and the refined one if it is better; the promise resolves
 * with the best fix. The error callback is the source of truth (Safari's Permissions API is unreliable): a denial
 * rejects at once, while a timeout or "unavailable" on the quick attempt still gets the precise attempt.
 */
export async function locate(onFix?: (fix: Fix, stage: "coarse" | "fine") => void): Promise<Fix> {
  if (!("geolocation" in navigator)) throw new GeoError("unsupported");
  let best: Fix | null = null;
  let failure: GeoError | null = null;
  try {
    best = await getPosition(COARSE);
    onFix?.(best, "coarse");
  } catch (e) {
    if (e instanceof GeoError && e.kind === "denied") throw e;
    failure = e instanceof GeoError ? e : new GeoError("unavailable");
  }
  try {
    const fine = await getPosition(FINE);
    if (!best || (fine.accuracyM ?? Infinity) <= (best.accuracyM ?? Infinity)) {
      best = fine;
      onFix?.(fine, "fine");
    }
  } catch (e) {
    if (!best) throw e instanceof GeoError ? e : (failure ?? new GeoError("unavailable"));
  }
  if (!best) throw failure ?? new GeoError("unavailable");
  return best;
}

export type GeoPlatform = "ios" | "android" | "other";

export function geoPlatform(): GeoPlatform {
  if (isIos()) return "ios";
  return /Android/i.test(navigator.userAgent) ? "android" : "other";
}
