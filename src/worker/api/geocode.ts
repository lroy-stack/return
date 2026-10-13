import { Hono } from "hono";
import { type GeocodeSearchResponse, geocodeSearchQuerySchema } from "../../shared/schemas";
import { getSettings } from "../db/settings";
import type { AppEnv } from "../env";
import { AppError, parseWith } from "../lib/http";
import { OSM_ATTRIBUTION, searchPlaces } from "../services/geocode";

export const geocodeApi = new Hono<AppEnv>();

/**
 * Forward search runs only when the owner presses "search" (Nominatim policy: no autocomplete).
 * Only searches that really reach OpenStreetMap count against the owner's hourly budget.
 */
geocodeApi.get("/search", async (c) => {
  const { q } = parseWith(geocodeSearchQuerySchema, c.req.query());
  const { identity } = await getSettings(c.env.DB, c.get("ownerId"));
  const outcome = await searchPlaces(c.env, c.get("ownerId"), q, identity.panelLanguage);
  if (outcome.status === "budget_exceeded") {
    throw new AppError(429, "rate_limited", "Too many place searches this hour, try again later");
  }
  return c.json<GeocodeSearchResponse>({
    results: outcome.status === "ok" ? outcome.results : [],
    attribution: OSM_ATTRIBUTION,
    unavailable: outcome.status === "unavailable",
  });
});
