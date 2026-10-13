import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type { ConversationDetail, GeocodeResult } from "../src/shared/schemas";
import { api, apiJson } from "./helpers/api";
import {
  finderGet,
  finderPost,
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
    expect(call?.headers.get("User-Agent")).toBe(
      "RETURN/0.2 (+https://return.lr0y.dev; personal lost-item app)",
    );

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
    for (let i = 0; i < 30 && nominatim.calls.length === 0; i++) await settle(100);
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
    const body = await apiJson<{ results: GeocodeResult[]; attribution: string }>("GET", url);
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
    expect(call?.headers.get("User-Agent")).toContain("RETURN/0.2");

    const again = await apiJson<{ results: GeocodeResult[] }>(
      "GET",
      "/geocode/search?q=%20cafe%20%20gran%20v%C3%ADa",
    );
    expect(again.results).toEqual(body.results);
    expect(nominatim.calls).toHaveLength(1);
  });

  it("returns an empty list when Nominatim fails, without a 5xx", async () => {
    nominatim.respond = () => new Response("down", { status: 502 });
    const res = await api("GET", "/geocode/search?q=nowhere+land");
    expect(res.status).toBe(200);
    expect((await res.json()) as { results: unknown[] }).toMatchObject({ results: [] });
  });

  it("limits each owner to 30 searches per hour", async () => {
    nominatim.respond = () => Response.json(hits);
    await env.DB.prepare("DELETE FROM geocode_cache WHERE key LIKE 'rl:%'").run();
    for (let i = 0; i < 30; i++) {
      expect((await api("GET", "/geocode/search?q=limit+probe")).status).toBe(200);
    }
    const blocked = await api("GET", "/geocode/search?q=limit+probe");
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
  });
});
