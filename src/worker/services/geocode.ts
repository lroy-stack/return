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
 * - requests identify the app with a real User-Agent;
 * - a global daily cap on outbound calls bounds the load whatever the traffic.
 *
 * The cache holds rounded coordinates that finders shared, so it follows the conversations: entries
 * live at most CACHE_TTL_DAYS, carry day-precision timestamps, and are deleted with the conversation
 * they came from (`purgePlaceCacheStatement`).
 */
import { z } from "zod";
import type { GeocodeResult, ResolvedPlace } from "../../shared/schemas";
import { LANGUAGES, type Language } from "../../shared/settings";
import { getSettings } from "../db/settings";
import { daysAgoIso } from "../lib/time";
import { APP_VERSION } from "../version";
import { stubNominatim } from "./nominatim-stub";

const DEFAULT_NOMINATIM = "https://nominatim.openstreetmap.org";
/** Nominatim's policy asks for an identifying User-Agent: each deployment names its own public host. */
export function nominatimUserAgent(publicHost: string | undefined): string {
  const contact = publicHost ? `+https://${publicHost}; ` : "";
  return `RETURN/${APP_VERSION} (${contact}personal lost-item app)`;
}
export { OSM_ATTRIBUTION } from "../../shared/osm";

const TIMEOUT_MS = 4000;
const DEFAULT_MIN_INTERVAL_MS = 1000;
/** A queued call that would wait longer than this gives up instead of piling up. */
const MAX_WAIT_MS = 10_000;
const MAX_RESULTS = 5;
/** No longer than the shortest conversation retention the owner is likely to choose. */
export const CACHE_TTL_DAYS = 30;
/** Owner place searches that reach OpenStreetMap, per hour (cache hits are free). */
export const SEARCH_LIMIT_PER_HOUR = 30;
/** Outbound calls per UTC day across everything; beyond it places stay as coordinates. */
export const DAILY_OUTBOUND_CAP = 500;
/** An unresolved place is retried only once it is this old, so the first attempt can finish. */
const RETRY_AFTER_MS = 60_000;
const RETRIES_PER_VIEW = 3;

let nextSlotAt = 0;

function minIntervalMs(env: Env): number {
  const configured = Number(env.NOMINATIM_MIN_INTERVAL_MS);
  return env.NOMINATIM_MIN_INTERVAL_MS !== undefined && Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_MIN_INTERVAL_MS;
}

/** Reserves the next outbound slot (>= the minimum interval after the previous one); false when the queue is too long. */
async function takeSlot(env: Env): Promise<boolean> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  if (slot - now > MAX_WAIT_MS) return false;
  nextSlotAt = slot + minIntervalMs(env);
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  return true;
}

/** Day precision is all the retention logic needs; it keeps the cache from recording when a finder was here. */
const today = () => new Date().toISOString().slice(0, 10);

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

async function writeCache(env: Env, entries: { key: string; payload: unknown }[]): Promise<void> {
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM geocode_cache WHERE created_at < ?").bind(
        daysAgoIso(CACHE_TTL_DAYS).slice(0, 10),
      ),
      ...entries.map((e) =>
        env.DB.prepare(
          "INSERT OR REPLACE INTO geocode_cache (key, payload, created_at) VALUES (?, ?, ?)",
        ).bind(e.key, JSON.stringify(e.payload), today()),
      ),
    ]);
  } catch (err) {
    logFailure("geocode cache write failed", { error: String(err) });
  }
}

/** Counts one outbound call against the global daily cap; false once the cap is spent. */
async function takeDailyBudget(env: Env): Promise<boolean> {
  try {
    const row = await env.DB.prepare(
      `INSERT INTO geocode_cache (key, payload, created_at) VALUES (?1, '1', ?2)
       ON CONFLICT(key) DO UPDATE SET payload = CAST(CAST(payload AS INTEGER) + 1 AS TEXT)
       RETURNING payload`,
    )
      .bind(`cap:${today()}`, today())
      .first<{ payload: string }>();
    return Number(row?.payload ?? 1) <= DAILY_OUTBOUND_CAP;
  } catch (err) {
    logFailure("geocode budget failed", { error: String(err) });
    return false;
  }
}

const reverseKey = (lat: number, lng: number, lang: Language) =>
  `${lat.toFixed(5)},${lng.toFixed(5)},${lang}`;

/** Deleting a conversation must also forget the places it shared: their cache keys, in every language. */
export function purgePlaceCacheStatement(
  db: D1Database,
  conversationIdsSql: string,
  binds: unknown[],
): D1PreparedStatement {
  const languages = LANGUAGES.map((l) => `SELECT '${l}' AS lang`).join(" UNION ");
  // printf('%.5f') mirrors Number#toFixed(5) used by `reverseKey`.
  return db
    .prepare(
      `DELETE FROM geocode_cache WHERE key IN (
         SELECT printf('%.5f,%.5f,', p.lat, p.lng) || l.lang
           FROM (SELECT lat, lng FROM shared_locations WHERE lat IS NOT NULL AND conversation_id IN (${conversationIdsSql})
                 UNION SELECT lat, lng FROM proposals WHERE lat IS NOT NULL AND conversation_id IN (${conversationIdsSql})) p
          CROSS JOIN (${languages}) l)`,
    )
    .bind(...binds, ...binds);
}

export type GetOutcome =
  | { ok: true; body: unknown }
  | { ok: false; reason: "queue_full" | "daily_cap" | "failed" };

function usesStub(env: Env): boolean {
  return env.ENVIRONMENT === "development" && env.NOMINATIM_STUB === "1";
}

/** One throttled, budgeted GET. Not ok on timeout, non-200, invalid JSON, a full queue or a spent daily cap. */
async function nominatimGet(env: Env, path: string, params: Record<string, string>): Promise<GetOutcome> {
  if (usesStub(env)) return { ok: true, body: stubNominatim(path, params) };
  if (!(await takeDailyBudget(env))) {
    logFailure("geocode skipped", { reason: "daily_cap" });
    return { ok: false, reason: "daily_cap" };
  }
  if (!(await takeSlot(env))) {
    logFailure("geocode skipped", { reason: "queue_full" });
    return { ok: false, reason: "queue_full" };
  }
  const url = `${env.NOMINATIM_URL || DEFAULT_NOMINATIM}${path}?${new URLSearchParams(params).toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": nominatimUserAgent(env.PUBLIC_HOST), Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      logFailure("geocode failed", { status: res.status, path });
      return { ok: false, reason: "failed" };
    }
    return { ok: true, body: await res.json() };
  } catch (err) {
    logFailure("geocode failed", { path, error: String(err) });
    return { ok: false, reason: "failed" };
  }
}

const acceptLanguage = (lang: Language) => `${lang},en`;

/**
 * Rounded to 5 decimals (~1 m): enough for a street address, and what makes the cache effective.
 * Places the owner picked from a search are cached under this same key, so a picked place is
 * never resolved again to a different name.
 */
export async function reverseGeocode(
  env: Env,
  lat: number,
  lng: number,
  lang: Language,
): Promise<ResolvedPlace | null> {
  const key = reverseKey(lat, lng, lang);
  const hit = await readCache(env, key, cachedReverse);
  if (hit !== undefined) return hit;

  const got = await nominatimGet(env, "/reverse", {
    format: "jsonv2",
    addressdetails: "1",
    zoom: "18",
    lat: lat.toFixed(5),
    lon: lng.toFixed(5),
    "accept-language": acceptLanguage(lang),
  });
  if (!got.ok) return null;
  // "Unable to geocode" arrives as 200 + {error}: a definitive answer, cached like any other.
  const noResult = typeof got.body === "object" && got.body !== null && "error" in got.body;
  const item = noResult ? null : nominatimItem.safeParse(got.body);
  if (item && !item.success) {
    logFailure("geocode failed", { reason: "unexpected_payload" });
    return null;
  }
  const place = item?.success ? toPlace(item.data) : null;
  await writeCache(env, [{ key, payload: place }]);
  return place;
}

export type ReverseOutcome = { status: "ok"; place: ResolvedPlace | null } | { status: "budget_exceeded" };

/**
 * Place name for a point the owner picked ("Use my location"). A cached point is free; one that has to
 * leave for OpenStreetMap is charged to the same hourly owner budget as place searches.
 */
export async function reversePlaceForOwner(
  env: Env,
  ownerId: string,
  lat: number,
  lng: number,
  lang: Language,
): Promise<ReverseOutcome> {
  const hit = await readCache(env, reverseKey(lat, lng, lang), cachedReverse);
  if (hit !== undefined) return { status: "ok", place: hit };
  if (!(await consumeSearchBudget(env, ownerId))) return { status: "budget_exceeded" };
  return { status: "ok", place: await reverseGeocode(env, lat, lng, lang) };
}

const normalizeQuery = (q: string) => q.trim().toLowerCase().replace(/\s+/g, " ");

export type SearchOutcome =
  | { status: "ok"; results: GeocodeResult[] }
  /** OpenStreetMap was not asked or did not answer. */
  | { status: "unavailable" }
  /** The owner's hourly budget of outbound searches is spent. */
  | { status: "budget_exceeded" };

/**
 * Forward search. Cached queries are free; only a call that really leaves for OpenStreetMap is
 * charged to the owner's hourly budget. Each result is also cached under its reverse key.
 */
export async function searchPlaces(
  env: Env,
  ownerId: string,
  q: string,
  lang: Language,
): Promise<SearchOutcome> {
  const query = normalizeQuery(q);
  const key = `q:${query},${lang}`;
  const hit = await readCache(env, key, cachedSearch);
  if (hit) return { status: "ok", results: hit.slice(0, MAX_RESULTS) };

  if (!(await consumeSearchBudget(env, ownerId))) return { status: "budget_exceeded" };
  const got = await nominatimGet(env, "/search", {
    format: "jsonv2",
    addressdetails: "1",
    limit: String(MAX_RESULTS),
    q: query,
    "accept-language": acceptLanguage(lang),
  });
  if (!got.ok) return { status: "unavailable" };
  const items = z.array(nominatimItem).safeParse(got.body);
  if (!items.success) {
    logFailure("geocode failed", { reason: "unexpected_payload" });
    return { status: "unavailable" };
  }
  const results: GeocodeResult[] = [];
  for (const item of items.data) {
    const place = toPlace(item);
    if (place && item.lat !== undefined && item.lon !== undefined && Number.isFinite(item.lat + item.lon)) {
      results.push({ ...place, lat: item.lat, lng: item.lon });
    }
    if (results.length === MAX_RESULTS) break;
  }
  await writeCache(env, [
    { key, payload: results },
    ...results.map((r) => ({
      key: reverseKey(r.lat, r.lng, lang),
      payload: { name: r.name, detail: r.detail, address: r.address },
    })),
  ]);
  return { status: "ok", results };
}

/**
 * Counts one outbound owner search against the hourly budget. Returns false once it is spent.
 * The counter lives in `geocode_cache` (key `rl:<owner>:<hour>`), so no extra table is needed.
 */
async function consumeSearchBudget(env: Env, ownerId: string): Promise<boolean> {
  const hour = new Date().toISOString().slice(0, 13);
  const row = await env.DB.prepare(
    `INSERT INTO geocode_cache (key, payload, created_at) VALUES (?, '1', ?)
     ON CONFLICT(key) DO UPDATE SET payload = CAST(CAST(payload AS INTEGER) + 1 AS TEXT)
     RETURNING payload`,
  )
    .bind(`rl:${ownerId}:${hour}`, today())
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

const PLACE_TABLES = ["shared_locations", "proposals"] as const;

/**
 * A place that could not be resolved the first time is tried once more when the owner next opens
 * the conversation (still a user-triggered, cached, throttled lookup). `place_retried` makes it
 * once per row. Meant for `waitUntil`.
 */
export async function retryUnresolvedPlaces(
  env: Env,
  ownerId: string,
  conversationId: string,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETRY_AFTER_MS).toISOString();
    let budget = RETRIES_PER_VIEW;
    for (const table of PLACE_TABLES) {
      if (budget <= 0) return;
      const { results } = await env.DB.prepare(
        `SELECT id, lat, lng FROM ${table}
          WHERE conversation_id = ? AND lat IS NOT NULL AND place_name IS NULL AND place_retried = 0 AND created_at < ?
          LIMIT ?`,
      )
        .bind(conversationId, cutoff, budget)
        .all<{ id: string; lat: number; lng: number }>();
      for (const row of results) {
        const claimed = await env.DB.prepare(
          `UPDATE ${table} SET place_retried = 1 WHERE id = ? AND place_retried = 0`,
        )
          .bind(row.id)
          .run();
        if (!claimed.meta.changes) continue;
        budget -= 1;
        await resolveAndStorePlace(env, ownerId, { table, id: row.id }, row);
      }
    }
  } catch (err) {
    logFailure("retry places failed", { error: String(err) });
  }
}
