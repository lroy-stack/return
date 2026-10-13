import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ConversationDetail,
  GeocodeReverseResponse,
  Item,
  ItemDetail,
  SharedLocation,
} from "../src/shared/schemas";
import { OWNER_LOCATIONS_PER_HOUR } from "../src/worker/domain/conversations";
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

const PLACE = {
  name: "Plaza Mayor",
  display_name: "Plaza Mayor, Madrid, España",
  address: { tourism: "Plaza Mayor", city: "Madrid", country: "España" },
};

let counter = 0;
/** A point nobody else in this file uses, so the D1 geocode cache never leaks between tests. */
function freshPoint(): { lat: number; lng: number } {
  counter += 1;
  return { lat: 41 + counter / 1000, lng: -3.5 };
}

async function count(sql: string, ...params: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...params)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("finder location with poor accuracy (M-07)", () => {
  it("keeps the first message and stores the position flagged approximate", async () => {
    const conv = await openConversation(await seedTag(), {
      message: "Found it at the station",
      location_source: "gps",
      location_lat: "40.41680",
      location_lng: "-3.70380",
      location_accuracy: "250000",
      location_confirmed: "yes",
    });
    const detail = await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`);
    expect(detail.messages.map((m) => m.body)).toEqual(["Found it at the station"]);
    expect(detail.locations).toHaveLength(1);
    expect(detail.locations[0]).toMatchObject({
      sharedBy: "finder",
      lat: 40.4168,
      accuracyM: 100_000,
      approximate: true,
    });
  });

  it("flags only fixes coarser than 1 km, and keeps strict coordinate ranges", async () => {
    const conv = await openConversation(await seedTag());
    const share = (accuracy: string, lat = "40.1") =>
      finderPost(`/c/${conv.token}/location`, {
        location_source: "gps",
        location_lat: lat,
        location_lng: "-3.1",
        location_accuracy: accuracy,
        location_confirmed: "yes",
      });
    expect((await share("1000")).status).toBe(303);
    expect((await share("1001")).status).toBe(303);
    expect((await share("95.5")).status).toBe(303);
    expect((await share("12", "95")).status).toBe(422);
    const { locations } = await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`);
    expect(locations.map((l) => l.approximate)).toEqual([false, true, false]);
  });
});

describe("POST /api/conversations/:id/locations (owner shares a position)", () => {
  it("stores the owner's position, resolves the place name and shows it to the finder", async () => {
    nominatim.respond = () => Response.json(PLACE);
    const conv = await openConversation(await seedTag());
    const point = freshPoint();
    const res = await api("POST", `/conversations/${conv.id}/locations`, {
      source: "gps",
      ...point,
      accuracyM: 18,
      label: "Outside the cafe",
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as SharedLocation;
    expect(created).toMatchObject({
      sharedBy: "owner",
      source: "gps",
      ...point,
      accuracyM: 18,
      approximate: false,
      label: "Outside the cafe",
    });
    expect(created.maps?.google).toContain("maps");

    let detail: ConversationDetail | undefined;
    await expect
      .poll(async () => {
        detail = await apiJson<ConversationDetail>("GET", `/conversations/${conv.id}`);
        return detail.locations[0]?.place?.name;
      })
      .toBe("Plaza Mayor");
    expect(detail?.locations[0]).toMatchObject({ sharedBy: "owner", id: created.id });

    const html = await (await finderGet(`/c/${conv.token}`)).text();
    expect(html).toContain("Plaza Mayor");
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM activity_events WHERE conversation_id = ? AND type = 'location.shared'",
        conv.id,
      ),
    ).toBe(1);
  });

  it("marks a coarse owner fix as approximate and never rejects it for accuracy", async () => {
    const conv = await openConversation(await seedTag());
    const created = await apiJson<SharedLocation>("POST", `/conversations/${conv.id}/locations`, {
      source: "gps",
      ...freshPoint(),
      accuracyM: 480_000,
    });
    expect(created).toMatchObject({ approximate: true, accuracyM: 100_000 });
  });

  it("validates coordinates and requires a position or a description", async () => {
    const conv = await openConversation(await seedTag());
    const post = (body: Record<string, unknown>) => api("POST", `/conversations/${conv.id}/locations`, body);
    expect((await post({ source: "gps", lat: 95, lng: 0 })).status).toBe(422);
    expect((await post({ source: "gps", lat: 10 })).status).toBe(422);
    expect((await post({ source: "gps" })).status).toBe(422);
    expect((await post({ source: "manual" })).status).toBe(422);
    expect((await post({ source: "manual", label: "Hotel lobby" })).status).toBe(201);
  });

  it("does not notify the owner about their own location", async () => {
    const conv = await openConversation(await seedTag());
    await apiJson("POST", `/conversations/${conv.id}/locations`, { source: "gps", ...freshPoint() });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(
      await count(
        "SELECT COUNT(*) AS n FROM notifications WHERE conversation_id = ? AND kind <> 'owner.new_conversation'",
        conv.id,
      ),
    ).toBe(0);
  });

  it("answers 404 for another owner's conversation and for unknown ids", async () => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO owners (id, email, created_at) VALUES ('other-owner', 'other@example.test', ?)",
      ).bind(now),
      env.DB.prepare(
        `INSERT OR IGNORE INTO conversations (id, owner_id, finder_token_hash, subject, status, last_message_at, created_at)
         VALUES ('foreign-loc-conv', 'other-owner', 'foreign-loc-hash', 'Not yours', 'open', ?, ?)`,
      ).bind(now, now),
    ]);
    const body = { source: "gps", ...freshPoint() };
    expect((await api("POST", "/conversations/foreign-loc-conv/locations", body)).status).toBe(404);
    expect((await api("POST", "/conversations/nope/locations", body)).status).toBe(404);
    expect(
      await count("SELECT COUNT(*) AS n FROM shared_locations WHERE conversation_id = 'foreign-loc-conv'"),
    ).toBe(0);
  });

  it("requires a same-origin request", async () => {
    const conv = await openConversation(await seedTag());
    const res = await api(
      "POST",
      `/conversations/${conv.id}/locations`,
      { source: "gps", ...freshPoint() },
      { origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
  });

  it("refuses closed and blocked conversations with 409", async () => {
    const closed = await openConversation(await seedTag());
    await api("POST", `/conversations/${closed.id}/close`);
    const body = { source: "gps", ...freshPoint() };
    const a = await api("POST", `/conversations/${closed.id}/locations`, body);
    expect(a.status).toBe(409);
    expect(((await a.json()) as { error: { code: string } }).error.code).toBe("conversation_closed");

    const blocked = await openConversation(await seedTag());
    await api("POST", `/conversations/${blocked.id}/block`);
    expect((await api("POST", `/conversations/${blocked.id}/locations`, body)).status).toBe(409);
  });

  it("limits the owner to an hourly ceiling per conversation", async () => {
    const conv = await openConversation(await seedTag());
    for (let i = 0; i < OWNER_LOCATIONS_PER_HOUR; i++) {
      const res = await api("POST", `/conversations/${conv.id}/locations`, {
        source: "manual",
        label: `p${i}`,
      });
      expect(res.status).toBe(201);
    }
    const over = await api("POST", `/conversations/${conv.id}/locations`, {
      source: "manual",
      label: "one more",
    });
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe("conversation_cap");
  });
});

describe("GET /api/geocode/reverse", () => {
  it("returns the place for a point, caches it and charges the owner budget only on a miss", async () => {
    nominatim.respond = () => Response.json(PLACE);
    const { lat, lng } = freshPoint();
    const first = await apiJson<GeocodeReverseResponse>("GET", `/geocode/reverse?lat=${lat}&lng=${lng}`);
    expect(first.place).toMatchObject({ name: "Plaza Mayor", detail: "Madrid, España" });
    expect(first.attribution).toContain("OpenStreetMap");
    await apiJson("GET", `/geocode/reverse?lat=${lat}&lng=${lng}`);
    expect(nominatim.calls).toHaveLength(1);
  });

  it("validates coordinates and degrades to a null place when OpenStreetMap is down", async () => {
    expect((await api("GET", "/geocode/reverse?lat=91&lng=0")).status).toBe(422);
    expect((await api("GET", "/geocode/reverse?lat=abc&lng=0")).status).toBe(422);
    const { lat, lng } = freshPoint();
    const down = await apiJson<GeocodeReverseResponse>("GET", `/geocode/reverse?lat=${lat}&lng=${lng}`);
    expect(down.place).toBeNull();
  });
});

describe("item last known position", () => {
  const newItem = (extra: Record<string, unknown> = {}) =>
    apiJson<Item>("POST", "/items", { name: "Camera", category: "camera", ...extra });

  it("round-trips coordinates through create, read and update", async () => {
    const item = await newItem({
      lastKnownLocation: "Plaza Mayor, Madrid",
      lastKnownLat: 40.4155,
      lastKnownLng: -3.7074,
      lastKnownAccuracyM: 30,
    });
    expect(item).toMatchObject({ lastKnownLat: 40.4155, lastKnownLng: -3.7074, lastKnownAccuracyM: 30 });

    const detail = await apiJson<ItemDetail>("GET", `/items/${item.id}`);
    expect(detail.item).toMatchObject({ lastKnownLocation: "Plaza Mayor, Madrid", lastKnownLat: 40.4155 });

    const moved = await apiJson<Item>("PATCH", `/items/${item.id}`, {
      lastKnownLocation: "Retiro park",
      lastKnownLat: 40.415,
      lastKnownLng: -3.684,
      lastKnownAccuracyM: 900_000,
    });
    expect(moved).toMatchObject({ lastKnownLat: 40.415, lastKnownLng: -3.684, lastKnownAccuracyM: 100_000 });
  });

  it("keeps the position when other fields change and drops it when only the text changes", async () => {
    const item = await newItem({
      lastKnownLocation: "Hotel",
      lastKnownLat: 1.5,
      lastKnownLng: 2.5,
      lastKnownAccuracyM: 10,
    });
    const renamed = await apiJson<Item>("PATCH", `/items/${item.id}`, { name: "Camera 2" });
    expect(renamed).toMatchObject({ lastKnownLat: 1.5, lastKnownLng: 2.5, lastKnownAccuracyM: 10 });
    const same = await apiJson<Item>("PATCH", `/items/${item.id}`, { lastKnownLocation: "Hotel" });
    expect(same.lastKnownLat).toBe(1.5);
    const typed = await apiJson<Item>("PATCH", `/items/${item.id}`, { lastKnownLocation: "Somewhere else" });
    expect(typed).toMatchObject({ lastKnownLat: null, lastKnownLng: null, lastKnownAccuracyM: null });
  });

  it("validates ranges and the lat/lng pair", async () => {
    expect((await api("POST", "/items", { name: "x", lastKnownLat: 91, lastKnownLng: 0 })).status).toBe(422);
    expect((await api("POST", "/items", { name: "x", lastKnownLat: 10 })).status).toBe(422);
    const item = await newItem();
    expect((await api("PATCH", `/items/${item.id}`, { lastKnownLng: 10 })).status).toBe(422);
  });

  it("requires both coordinates whenever a PATCH touches the position, so a row is never half-cleared", async () => {
    const item = await newItem({
      lastKnownLocation: "Hotel",
      lastKnownLat: 1.5,
      lastKnownLng: 2.5,
      lastKnownAccuracyM: 10,
    });
    for (const body of [
      { lastKnownLat: null },
      { lastKnownLng: null },
      { lastKnownLat: 3 },
      { lastKnownLat: null, lastKnownLng: 2 },
      { lastKnownLat: 3, lastKnownLng: null },
      { lastKnownAccuracyM: 5 },
    ]) {
      expect((await api("PATCH", `/items/${item.id}`, body)).status).toBe(422);
    }
    const intact = await apiJson<ItemDetail>("GET", `/items/${item.id}`);
    expect(intact.item).toMatchObject({ lastKnownLat: 1.5, lastKnownLng: 2.5, lastKnownAccuracyM: 10 });

    const cleared = await apiJson<Item>("PATCH", `/items/${item.id}`, {
      lastKnownLat: null,
      lastKnownLng: null,
    });
    expect(cleared).toMatchObject({ lastKnownLat: null, lastKnownLng: null, lastKnownAccuracyM: null });
  });

  it("never exposes the position on the finder page", async () => {
    const seeded = await seedTag();
    await apiJson("PATCH", `/items/${seeded.itemId}`, {
      lastKnownLocation: "Secret hideout",
      lastKnownLat: 12.3456,
      lastKnownLng: 65.4321,
    });
    const html = await (await finderGet(`/t/${seeded.token}`)).text();
    expect(html).not.toContain("12.3456");
    expect(html).not.toContain("Secret hideout");
  });
});
