/**
 * Place names from OpenStreetMap's Nominatim (data © OpenStreetMap contributors, ODbL).
 * Strictly secondary, like notify.ts: nothing here throws; failures are logged and the caller
 * falls back to showing coordinates.
 *
 * Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * - at most 1 request/second: `takeSlot` spaces outbound calls per isolate;
 * - only end-user-triggered requests: reverse lookups run when a person shares a point, forward
 *   search only behind an explicit owner action (never cron, batch or autocomplete);
 * - results are cached in D1 and an identical point or query is never requested twice;
 * - requests identify the app with a real User-Agent.
 */
import { z } from "zod";
import type { GeocodeResult, ResolvedPlace } from "../../shared/schemas";
import type { Language } from "../../shared/settings";
import { getSettings } from "../db/settings";
import { nowIso } from "../lib/time";

const NOMINATIM = "https://nominatim.openstreetmap.org";
export const NOMINATIM_USER_AGENT = "RETURN/0.2 (+https://return.lr0y.dev; personal lost-item app)";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

const TIMEOUT_MS = 4000;
const MIN_INTERVAL_MS = 1000;
/** A queued call that would wait longer than this gives up instead of piling up. */
const MAX_WAIT_MS = 10_000;
const MAX_RESULTS = 5;
const CACHE_TTL_MS = 90 * 86_400_000;
/** Owner place searches per hour. */
export const SEARCH_LIMIT_PER_HOUR = 30;

let nextSlotAt = 0;

/** Reserves the next outbound slot (>= 1 s after the previous one); false when the queue is too long. */
async function takeSlot(): Promise<boolean> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  if (slot - now > MAX_WAIT_MS) return false;
  nextSlotAt = slot + MIN_INTERVAL_MS;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  return true;
}

function logFailure(msg: string, detail: Record<string, unknown> = {}): void {
  // Never log the coordinates or the query text: they are the finder's data.
  console.error(JSON.stringify({ level: "error", msg, ...detail }));
}

const placeSchema = z.object({
  name: z.string(),
  detail: z.string().nullable(),
  address: z.string(),
});
const cachedReverse = placeSchema.nullable();
const cachedSearch = z.array(placeSchema.extend({ lat: z.number(), lng: z.number() }));

const nominatimItem = z.object({
  name: z.string().optional(),
  display_name: z.string().min(1),
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  address: z.record(z.string(), z.unknown()).optional(),
});
type NominatimItem = z.infer<typeof nominatimItem>;

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

function field(address: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = address?.[key];
    if (typeof value === "string" && value.trim() && value !== "yes") return value.trim();
  }
  return undefined;
}

/** Most specific meaningful name, a context line and the full address; null when nothing usable. */
export function toPlace(item: NominatimItem): ResolvedPlace | null {
  const a = item.address;
  const road = field(a, "road", "pedestrian", "footway", "path", "cycleway");
  const house = field(a, "house_number");
  const street = road ? (house ? `${road} ${house}` : road) : undefined;
  const name =
    item.name?.trim() ||
    field(a, "amenity", "shop", "tourism", "leisure", "historic", "office", "building") ||
    street ||
    field(a, "neighbourhood", "suburb", "city", "town", "village") ||
    item.display_name.split(",")[0]?.trim();
  if (!name) return null;
  const seen = new Set([name]);
  const parts = [
    field(a, "suburb", "neighbourhood", "quarter", "city_district"),
    field(a, "city", "town", "village", "municipality"),
    field(a, "country"),
  ].filter((p): p is string => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  return {
    name: clip(name, 120),
    detail: parts.length ? clip(parts.join(", "), 200) : null,
    address: clip(item.display_name, 400),
  };
}

async function readCache<T extends z.ZodType>(
  env: Env,
  key: string,
  schema: T,
): Promise<z.output<T> | undefined> {
  try {
    const row = await env.DB.prepare("SELECT payload FROM geocode_cache WHERE key = ?")
      .bind(key)
      .first<{ payload: string }>();
    if (!row) return undefined;
    const parsed = schema.safeParse(JSON.parse(row.payload));
    return parsed.success ? parsed.data : undefined;
  } catch (err) {
    logFailure("geocode cache read failed", { error: String(err) });
    return undefined;
  }
}

async function writeCache(env: Env, key: string, payload: unknown): Promise<void> {
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM geocode_cache WHERE created_at < ?").bind(
        new Date(Date.now() - CACHE_TTL_MS).toISOString(),
      ),
      env.DB.prepare("INSERT OR REPLACE INTO geocode_cache (key, payload, created_at) VALUES (?, ?, ?)").bind(
        key,
        JSON.stringify(payload),
        nowIso(),
      ),
    ]);
  } catch (err) {
    logFailure("geocode cache write failed", { error: String(err) });
  }
}

/** One throttled GET. Returns the parsed JSON, or undefined on timeout, non-200 or invalid JSON. */
async function nominatimGet(path: string, params: Record<string, string>): Promise<unknown> {
  if (!(await takeSlot())) {
    logFailure("geocode skipped", { reason: "queue_full" });
    return undefined;
  }
  const url = `${NOMINATIM}${path}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logFailure("geocode failed", { status: res.status, path });
      return undefined;
    }
    return await res.json();
  } catch (err) {
    logFailure("geocode failed", { path, error: String(err) });
    return undefined;
  }
}

const acceptLanguage = (lang: Language) => `${lang},en`;

/** Rounded to 5 decimals (~1 m): enough for a street address, and what makes the cache effective. */
export async function reverseGeocode(
  env: Env,
  lat: number,
  lng: number,
  lang: Language,
): Promise<ResolvedPlace | null> {
  const rLat = lat.toFixed(5);
  const rLng = lng.toFixed(5);
  const key = `${rLat},${rLng},${lang}`;
  const hit = await readCache(env, key, cachedReverse);
  if (hit !== undefined) return hit;

  const body = await nominatimGet("/reverse", {
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
    lat: rLat,
    lon: rLng,
    "accept-language": acceptLanguage(lang),
  });
  if (body === undefined) return null;
  // "Unable to geocode" arrives as 200 + {error}: a definitive answer, cached like any other.
  const noResult = typeof body === "object" && body !== null && "error" in body;
  const item = noResult ? null : nominatimItem.safeParse(body);
  if (item && !item.success) {
    logFailure("geocode failed", { reason: "unexpected_payload" });
    return null;
  }
  const place = item?.success ? toPlace(item.data) : null;
  await writeCache(env, key, place);
  return place;
}

const normalizeQuery = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

export async function searchPlaces(env: Env, q: string, lang: Language): Promise<GeocodeResult[]> {
  const query = normalizeQuery(q);
  const key = `q:${query},${lang}`;
  const hit = await readCache(env, key, cachedSearch);
  if (hit) return hit.slice(0, MAX_RESULTS);

  const body = await nominatimGet("/search", {
    format: "jsonv2",
    addressdetails: "1",
    limit: String(MAX_RESULTS),
    q: query,
    "accept-language": acceptLanguage(lang),
  });
  const items = z.array(nominatimItem).safeParse(body);
  if (!items.success) {
    if (body !== undefined) logFailure("geocode failed", { reason: "unexpected_payload" });
    return [];
  }
  const results: GeocodeResult[] = [];
  for (const item of items.data) {
    const place = toPlace(item);
    if (place && item.lat !== undefined && item.lon !== undefined && Number.isFinite(item.lat + item.lon)) {
      results.push({ ...place, lat: item.lat, lng: item.lon });
    }
    if (results.length === MAX_RESULTS) break;
  }
  await writeCache(env, key, results);
  return results;
}

/**
 * Counts one owner search against the hourly budget. Returns false once the budget is spent.
 * The counter lives in `geocode_cache` (key `rl:<owner>:<hour>`), so no extra table is needed.
 */
export async function consumeSearchBudget(env: Env, ownerId: string): Promise<boolean> {
  const hour = nowIso().slice(0, 13);
  const row = await env.DB.prepare(
    `INSERT INTO geocode_cache (key, payload, created_at) VALUES (?, '1', ?)
     ON CONFLICT(key) DO UPDATE SET payload = CAST(CAST(payload AS INTEGER) + 1 AS TEXT)
     RETURNING payload`,
  )
    .bind(`rl:${ownerId}:${hour}`, nowIso())
    .first<{ payload: string }>();
  return Number(row?.payload ?? 1) <= SEARCH_LIMIT_PER_HOUR;
}

export type PlaceTarget = { table: "shared_locations" | "proposals"; id: string };

/**
 * Resolves the point of a freshly stored row and writes the name next to it. Meant for
 * `waitUntil`: the row is already saved and shown with coordinates; this only improves it.
 */
export async function resolveAndStorePlace(
  env: Env,
  ownerId: string,
  target: PlaceTarget,
  point: { lat?: number | null; lng?: number | null },
): Promise<void> {
  try {
    if (point.lat == null || point.lng == null) return;
    const settings = await getSettings(env.DB, ownerId);
    const place = await reverseGeocode(env, point.lat, point.lng, settings.identity.panelLanguage);
    if (!place) return;
    await env.DB.prepare(
      `UPDATE ${target.table} SET place_name = ?, place_detail = ?, place_address = ? WHERE id = ?`,
    )
      .bind(place.name, place.detail, place.address, target.id)
      .run();
  } catch (err) {
    logFailure("resolve place failed", { error: String(err) });
  }
}
