import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationDetail, GeocodeSearchResponse } from "../src/shared/schemas";
import { DAILY_OUTBOUND_CAP, NOMINATIM_USER_AGENT, searchPlaces } from "../src/worker/services/geocode";
import { stubNominatim } from "../src/worker/services/nominatim-stub";
import { APP_VERSION } from "../src/worker/version";
import { api, apiJson } from "./helpers/api";
import {
  finderGet,
  finderPost,
  NOMINATIM_BASE,
  nominatim,
  openConversation,
  resetPublicStubs,
  seedTag,
} from "./helpers/public";

afterEach(resetPublicStubs);

const ATOCHA = {
  name: "Estación de Atocha",
  display_name: "Estación de Atocha, Plaza del Emperador Carlos V, Atocha, Madrid, España",
  address: {
    railway: "station",
    road: "Plaza del Emperador Carlos V",
    suburb: "Atocha",
    city: "Madrid",
    country: "España",
  },
};

let latCounter = 0;
/** A point nobody else in this file uses, so the D1 cache never leaks between tests. */
function freshPoint(): { lat: string; lng: string } {
  latCounter += 1;
  return { lat: (40 + latCounter / 100).toFixed(5), lng: "-3.69000" };
}

const gpsFields = (p: { lat: string; lng: string }) => ({
  location_source: "gps",
  location_lat: p.lat,
  location_lng: p.lng,
  location_accuracy: "12",
  location_confirmed: "yes",
});

interface Row {
  place_name: string | null;
  place_detail: string | null;
  place_address: string | null;
}
const locationRow = (conversationId: string) =>
  env.DB.prepare(
    "SELECT place_name, place_detail, place_address FROM shared_locations WHERE conversation_id = ?",
  )
    .bind(conversationId)
    .first<Row>();

async function settle(ms = 150): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPlace(conversationId: string): Promise<Row> {
  let row: Row | null = null;
  for (let i = 0; i < 60; i++) {
    row = await locationRow(conversationId);
    if (row?.place_name) return row;
    await settle(100);
  }
  throw new Error("place was never resolved");
}

describe("reverse geocoding of shared locations", () => {
  it("stores the place after the share and shows it with attribution and coordinates", async () => {
    nominatim.respond = () => Response.json(ATOCHA);
    const seeded = await seedTag({ settings: { identity: { panelLanguage: "es" } } });
    const conv = await openConversation(seeded);
    const point = freshPoint();

    const shared = await finderPost(`/c/${conv.token}/location`, gpsFields(point));
    expect(shared.status).toBe(303);
    const row = await waitForPlace(conv.id);
    expect(row).toEqual({
      place_name: "Estación de Atocha",
      place_detail: "Atocha, Madrid, España",
      place_address: ATOCHA.display_name,
    });

    const call = nominatim.calls.at(-1);
    expect(call?.url.pathname).toBe("/reverse");
    expect(call?.url.searchParams.get("lat")).toBe(point.lat);
    expect(call?.url.searchParams.get("accept-language")).toBe("es,en");
    expect(call?.url.searchParams.get("addressdetails")).toBe("1");
    expect(call?.url.origin).toBe(NOMINATIM_BASE);
    expect(call?.headers.get("User-Agent")).toBe(NOMINATIM_USER_AGENT);
    expect(NOMINATIM_USER_AGENT).toContain(`RETURN/${APP_VERSION} `);

    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).toContain('<p class="place-name">Estación de Atocha</p>');
    expect(html).toContain("Atocha, Madrid, España");
    expect(html).toContain("© OpenStreetMap contributors");
    expect(html).toContain("https://www.openstreetmap.org/copyright");
    expect(html).toContain(`${point.lat}, ${point.lng}`);

    const detail = await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`);
    expect(detail.locations[0]).toMatchObject({
      lat: Number(point.lat),
      place: { name: "Estación de Atocha", detail: "Atocha, Madrid, España", address: ATOCHA.display_name },
    });
  });

  it("resolves a location shared together with the first contact", async () => {
    nominatim.respond = () => Response.json(ATOCHA);
    const conv = await openConversation(await seedTag(), gpsFields(freshPoint()));
    expect((await waitForPlace(conv.id)).place_name).toBe("Estación de Atocha");
  });

  it("builds the name from the street when the point has no named feature", async () => {
    nominatim.respond = () =>
      Response.json({
        display_name: "12, Calle de Alcalá, Sol, Madrid, España",
        address: {
          house_number: "12",
          road: "Calle de Alcalá",
          suburb: "Sol",
          city: "Madrid",
          country: "España",
        },
      });
    const conv = await openConversation(await seedTag(), gpsFields(freshPoint()));
    expect(await waitForPlace(conv.id)).toMatchObject({
      place_name: "Calle de Alcalá 12",
      place_detail: "Sol, Madrid, España",
    });
  });

  it.each([
    ["a server error", () => new Response("boom", { status: 500 })],
    ["garbage JSON", () => new Response("<html>not json", { status: 200 })],
    ["an unexpected payload", () => Response.json({ hello: "world" })],
    [
      "a network failure",
      () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    ],
  ])("keeps the coordinates when Nominatim returns %s", async (_name, respond) => {
    nominatim.respond = respond;
    const conv = await openConversation(await seedTag());
    const point = freshPoint();
    const shared = await finderPost(`/c/${conv.token}/location`, gpsFields(point));
    expect(shared.status).toBe(303);
    await vi.waitFor(() => expect(nominatim.calls).toHaveLength(1));
    await settle();

    expect((await locationRow(conv.id))?.place_name).toBeNull();
    const page = await finderGet(`/c/${conv.token}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain(`${point.lat}, ${point.lng}`);
    expect(html).not.toContain("OpenStreetMap contributors");
    const detail = await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`);
    expect(detail.locations[0]?.place).toBeNull();
  });

  it("does not call Nominatim twice for the same rounded point", async () => {
    nominatim.respond = () => Response.json(ATOCHA);
    const seeded = await seedTag();
    const point = freshPoint();
    const first = await openConversation(seeded, gpsFields(point));
    await waitForPlace(first.id);
    expect(nominatim.calls).toHaveLength(1);

    // A sub-metre difference rounds to the same 5-decimal cache key.
    const second = await openConversation(seeded, gpsFields({ lat: `${point.lat}0004`, lng: point.lng }));
    expect((await waitForPlace(second.id)).place_name).toBe("Estación de Atocha");
    expect(nominatim.calls).toHaveLength(1);
  });

  it("never geocodes manual locations", async () => {
    const conv = await openConversation(await seedTag());
    const shared = await finderPost(`/c/${conv.token}/location`, {
      location_label: "Platform 3",
      location_confirmed: "yes",
    });
    expect(shared.status).toBe(303);
    await settle(300);
    expect(nominatim.calls).toHaveLength(0);
    expect((await locationRow(conv.id))?.place_name).toBeNull();
  });

  it("resolves proposals that carry coordinates and leaves the others alone", async () => {
    nominatim.respond = () => Response.json(ATOCHA);
    const conv = await openConversation(await seedTag());
    const point = freshPoint();
    const created = await api("POST", `/conversations/${conv.id}/proposals`, {
      kind: "meeting_point",
      place: "By the clock",
      lat: Number(point.lat),
      lng: Number(point.lng),
    });
    expect(created.status).toBe(201);
    await api("POST", `/conversations/${conv.id}/proposals`, { kind: "other", place: "Hotel lobby" });

    let resolved: ConversationDetail["proposals"][number] | undefined;
    for (let i = 0; i < 60; i++) {
      resolved = (await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`)).proposals[0];
      if (resolved?.resolvedPlace) break;
      await settle(100);
    }
    expect(resolved?.place).toBe("By the clock");
    expect(resolved?.resolvedPlace).toMatchObject({ name: "Estación de Atocha" });
    expect(nominatim.calls).toHaveLength(1);

    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).toContain("By the clock");
    expect(html).toContain('<p class="place-name">Estación de Atocha</p>');
    expect(html).toContain("© OpenStreetMap contributors");
    const plain = (await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`)).proposals[1];
    expect(plain?.resolvedPlace).toBeNull();
  });
});

describe("GET /api/geocode/search", () => {
  const hits = Array.from({ length: 7 }, (_, i) => ({
    name: `Cafe ${i}`,
    display_name: `Cafe ${i}, Gran Via, Madrid, España`,
    lat: `40.4${i}`,
    lon: "-3.70",
    address: { amenity: `Cafe ${i}`, city: "Madrid", country: "España" },
  }));

  it("requires the owner and a query of at least 3 characters", async () => {
    expect((await api("GET", "/geocode/search?q=gran+via", undefined, { jwt: null })).status).toBe(401);
    expect((await api("GET", "/geocode/search")).status).toBe(422);
    expect((await api("GET", "/geocode/search?q=ab")).status).toBe(422);
    expect(nominatim.calls).toHaveLength(0);
  });

  it("returns at most 5 results with attribution and caches the query", async () => {
    nominatim.respond = () => Response.json(hits);
    const url = "/geocode/search?q=Cafe%20Gran%20V%C3%ADa";
    const body = await apiJson<GeocodeSearchResponse>("GET", url);
    expect(body.attribution).toBe("© OpenStreetMap contributors");
    expect(body.results).toHaveLength(5);
    expect(body.results[0]).toEqual({
      name: "Cafe 0",
      detail: "Madrid, España",
      address: "Cafe 0, Gran Via, Madrid, España",
      lat: 40.4,
      lng: -3.7,
    });
    const call = nominatim.calls[0];
    expect(call?.url.pathname).toBe("/search");
    expect(call?.url.searchParams.get("limit")).toBe("5");
    expect(call?.headers.get("User-Agent")).toBe(NOMINATIM_USER_AGENT);

    const again = await apiJson<GeocodeSearchResponse>(
      "GET",
      "/geocode/search?q=%20cafe%20%20gran%20v%C3%ADa",
    );
    expect(again.results).toEqual(body.results);
    expect(nominatim.calls).toHaveLength(1);
  });

  it("says OpenStreetMap is unavailable when Nominatim fails, without a 5xx", async () => {
    nominatim.respond = () => new Response("down", { status: 502 });
    const res = await api("GET", "/geocode/search?q=nowhere+land");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ results: [], unavailable: true });
    expect(nominatim.calls).toHaveLength(1);
  });

  it("does not report 'unavailable' for a real search without matches, and caches it", async () => {
    nominatim.respond = () => Response.json([]);
    const first = await apiJson<GeocodeSearchResponse>("GET", "/geocode/search?q=zzzz+nothing");
    expect(first).toMatchObject({ results: [], unavailable: false });
    await apiJson("GET", "/geocode/search?q=zzzz+nothing");
    expect(nominatim.calls).toHaveLength(1);
  });

  it("limits each owner to 30 outbound searches per hour; cache hits are free", async () => {
    nominatim.respond = () => Response.json(hits);
    await env.DB.prepare("DELETE FROM geocode_cache WHERE key LIKE 'rl:%'").run();
    for (let i = 0; i < 30; i++) {
      expect((await api("GET", `/geocode/search?q=limit+probe+${i}`)).status).toBe(200);
    }
    expect(nominatim.calls).toHaveLength(30);
    // Already-searched queries still answer, and cost nothing.
    for (let i = 0; i < 5; i++)
      expect((await api("GET", "/geocode/search?q=limit+probe+0")).status).toBe(200);
    expect(nominatim.calls).toHaveLength(30);
    const blocked = await api("GET", "/geocode/search?q=limit+probe+new");
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    expect(nominatim.calls).toHaveLength(30);
  });
});

describe("picked places, cache retention and budgets", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM geocode_cache WHERE key LIKE 'rl:%' OR key LIKE 'cap:%'").run();
  });

  const found = {
    name: "Mercado de San Miguel",
    display_name: "Mercado de San Miguel, Plaza de San Miguel, Madrid, España",
    lat: "40.41540",
    lon: "-3.70890",
    address: { amenity: "Mercado de San Miguel", city: "Madrid", country: "España" },
  };

  it("keeps the name the owner picked: the proposal is never re-resolved to something else", async () => {
    nominatim.respond = (url) =>
      url.pathname === "/search" ? Response.json([found]) : Response.json(ATOCHA);
    const conv = await openConversation(await seedTag());
    const search = await apiJson<GeocodeSearchResponse>("GET", "/geocode/search?q=mercado+san+miguel");
    const pick = search.results[0];
    expect(pick?.name).toBe("Mercado de San Miguel");

    await api("POST", `/conversations/${conv.id}/proposals`, {
      kind: "public_place",
      place: pick?.name,
      lat: pick?.lat,
      lng: pick?.lng,
    });
    let resolved: ConversationDetail["proposals"][number] | undefined;
    await vi.waitFor(async () => {
      resolved = (await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`)).proposals[0];
      expect(resolved?.resolvedPlace).not.toBeNull();
    });
    expect(resolved?.resolvedPlace?.name).toBe("Mercado de San Miguel");
    expect(nominatim.calls.map((c) => c.url.pathname)).toEqual(["/search"]);
  });

  it("stores cache timestamps at day precision", async () => {
    nominatim.respond = () => Response.json(ATOCHA);
    const point = freshPoint();
    await waitForPlace((await openConversation(await seedTag(), gpsFields(point))).id);
    const row = await env.DB.prepare("SELECT created_at FROM geocode_cache WHERE key LIKE ?")
      .bind(`${point.lat},${point.lng},%`)
      .first<{ created_at: string }>();
    expect(row?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("forgets a conversation's cached places when the conversation is deleted", async () => {
    nominatim.respond = () => Response.json(ATOCHA);
    const point = freshPoint();
    const conv = await openConversation(await seedTag(), gpsFields(point));
    await waitForPlace(conv.id);
    const cached = () =>
      env.DB.prepare("SELECT COUNT(*) AS n FROM geocode_cache WHERE key LIKE ?")
        .bind(`${point.lat},${point.lng},%`)
        .first<{ n: number }>();
    expect((await cached())?.n).toBe(1);
    expect((await api("DELETE", `/conversations/${conv.id}`, { confirm: "DELETE" })).status).toBe(204);
    expect((await cached())?.n).toBe(0);
  });

  it("skips resolution once the global daily cap is spent, and keeps the coordinates", async () => {
    nominatim.respond = () => Response.json(ATOCHA);
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare("INSERT OR REPLACE INTO geocode_cache (key, payload, created_at) VALUES (?, ?, ?)")
      .bind(`cap:${day}`, String(DAILY_OUTBOUND_CAP), day)
      .run();
    const conv = await openConversation(await seedTag(), gpsFields(freshPoint()));
    await settle(400);
    expect(nominatim.calls).toHaveLength(0);
    expect((await locationRow(conv.id))?.place_name).toBeNull();
  });

  it("answers a search as unavailable (not an error) when the daily cap is spent", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare("INSERT OR REPLACE INTO geocode_cache (key, payload, created_at) VALUES (?, ?, ?)")
      .bind(`cap:${day}`, String(DAILY_OUTBOUND_CAP), day)
      .run();
    const body = await apiJson<GeocodeSearchResponse>("GET", "/geocode/search?q=capped+query");
    expect(body).toMatchObject({ results: [], unavailable: true });
    expect(nominatim.calls).toHaveLength(0);
  });

  describe("retry on the next owner view", () => {
    async function unresolved(): Promise<{ id: string }> {
      nominatim.respond = () => new Response("down", { status: 503 });
      const conv = await openConversation(await seedTag(), gpsFields(freshPoint()));
      await vi.waitFor(() => expect(nominatim.calls).toHaveLength(1));
      await settle();
      // Old enough for a retry; the first attempt has long finished.
      await env.DB.prepare("UPDATE shared_locations SET created_at = ? WHERE conversation_id = ?")
        .bind(new Date(Date.now() - 120_000).toISOString(), conv.id)
        .run();
      nominatim.calls.length = 0;
      return conv;
    }

    it("resolves a place on the next view once OpenStreetMap is back", async () => {
      const conv = await unresolved();
      nominatim.respond = () => Response.json(ATOCHA);
      await apiJson("GET", `/conversations/${conv.id}`);
      expect((await waitForPlace(conv.id)).place_name).toBe("Estación de Atocha");
      expect(nominatim.calls).toHaveLength(1);
    });

    it("retries at most once", async () => {
      const conv = await unresolved();
      await apiJson("GET", `/conversations/${conv.id}`);
      await vi.waitFor(() => expect(nominatim.calls).toHaveLength(1));
      await settle();
      await apiJson("GET", `/conversations/${conv.id}`);
      await apiJson("GET", `/conversations/${conv.id}`);
      await settle(300);
      expect(nominatim.calls).toHaveLength(1);
      expect((await locationRow(conv.id))?.place_name).toBeNull();
    });

    it("leaves fresh rows alone: the first attempt may still be running", async () => {
      nominatim.respond = () => new Response("down", { status: 503 });
      const conv = await openConversation(await seedTag(), gpsFields(freshPoint()));
      await vi.waitFor(() => expect(nominatim.calls).toHaveLength(1));
      await apiJson("GET", `/conversations/${conv.id}`);
      await settle(300);
      expect(nominatim.calls).toHaveLength(1);
    });
  });

  describe("hermetic seams", () => {
    it("answers from the built-in stub only in development with NOMINATIM_STUB=1", async () => {
      const dev = Object.assign(Object.create(env), { ENVIRONMENT: "development", NOMINATIM_STUB: "1" });
      const out = await searchPlaces(dev, "stub-owner", "stub query one", "en");
      expect(out).toMatchObject({ status: "ok" });
      expect(out.status === "ok" && out.results[0]?.name).toBe("stub query one (stub 1)");
      expect(nominatim.calls).toHaveLength(0);

      const prod = Object.assign(Object.create(env), { ENVIRONMENT: "production", NOMINATIM_STUB: "1" });
      nominatim.respond = () => Response.json([]);
      await searchPlaces(prod, "stub-owner", "stub query two", "en");
      expect(nominatim.calls).toHaveLength(1);
    });

    it("stub reverse answers are deterministic", () => {
      expect(stubNominatim("/reverse", { lat: "1.00000", lon: "2.00000" })).toMatchObject({
        name: "Stub Place",
      });
    });

    it("stub reverse has no result in open ocean, like Nominatim", () => {
      expect(stubNominatim("/reverse", { lat: "-30.12345", lon: "-30.54321" })).toEqual({
        error: "Unable to geocode",
      });
    });
  });
});
