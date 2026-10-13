import { Hono } from "hono";
import type { AppEnv } from "../env";
import { conversationRoutes } from "./conversation-routes";
import { staticRoutes } from "./static-routes";
import { handlePublicError, notFoundPage } from "./support";
import { photoRoute, tagRoutes } from "./tag-routes";

/**
 * Finder-facing surface. Served on the public host (and on loopback in development).
 * Tag and conversation pages are capability URLs: no-store, noindex, no referrer.
 */
export const publicApp = new Hono<AppEnv>();
publicApp.onError(handlePublicError);
publicApp.notFound(notFoundPage);

// The photo route comes first: it sets its own short private cache instead of no-store.
for (const prefix of ["/t", "/T"]) {
  publicApp.route(prefix, photoRoute);
  publicApp.route(prefix, tagRoutes);
}
publicApp.route("/c", conversationRoutes);
publicApp.route("/", staticRoutes);
