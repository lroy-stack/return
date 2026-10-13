import { Hono } from "hono";
import { type GeocodeResult, geocodeSearchQuerySchema } from "../../shared/schemas";
import { getSettings } from "../db/settings";
import type { AppEnv } from "../env";
import { AppError, parseWith } from "../lib/http";
import { consumeSearchBudget, OSM_ATTRIBUTION, searchPlaces } from "../services/geocode";

export const geocodeApi = new Hono<AppEnv>();

/** Forward search runs only when the owner presses "search" (Nominatim policy: no autocomplete). */
geocodeApi.get("/search", async (c) => {
  const { q } = parseWith(geocodeSearchQuerySchema, c.req.query());
  const ownerId = c.get("ownerId");
  if (!(await consumeSearchBudget(c.env, ownerId))) {
    throw new AppError(429, "rate_limited", "Too many place searches this hour, try again later");
  }
  const { identity } = await getSettings(c.env.DB, ownerId);
  const results: GeocodeResult[] = await searchPlaces(c.env, q, identity.panelLanguage);
  return c.json({ results, attribution: OSM_ATTRIBUTION });
});
