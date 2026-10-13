import { Hono } from "hono";
import { ownerApi } from "./api";
import type { AppEnv } from "./env";
import { appHeaders, toErrorResponse } from "./lib/http";
import { publicApp } from "./public";
import { runMaintenance } from "./services/maintenance";

type HostKind = "public" | "app" | "both" | "unknown";

/**
 * One Worker, two surfaces:
 *  - PUBLIC_HOST (e.g. example.com): finder pages under /t/ and /c/. No owner API, no panel.
 *  - APP_HOST (e.g. app.example.com): owner panel (SPA) and /api, behind Cloudflare Access.
 * Locally (no hosts configured, or a loopback host) both surfaces share one origin; their
 * paths do not overlap.
 */
export function hostKind(hostname: string, env: Env): HostKind {
  if (env.APP_HOST && hostname === env.APP_HOST) return "app";
  if (env.PUBLIC_HOST && hostname === env.PUBLIC_HOST) return "public";
  if (env.ENVIRONMENT !== "production") return "both";
  return "unknown";
}

const PUBLIC_PATH = /^\/(t|T|c)\/|^\/(robots\.txt|emergency|privacy)$/;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH.test(pathname);
}

const appSurface = new Hono<AppEnv>();
appSurface.onError(toErrorResponse);
appSurface.use("*", appHeaders);
appSurface.route("/api", ownerApi);
// Everything else on the app host is the panel (static SPA with client-side routing).
appSurface.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  // Copy so security headers can be added (asset responses have immutable headers).
  return new Response(res.body, res);
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const kind = hostKind(url.hostname, env);
    switch (kind) {
      case "public":
        return publicApp.fetch(request, env, ctx);
      case "app":
        if (isPublicPath(url.pathname) && env.PUBLIC_HOST) {
          return Response.redirect(`https://${env.PUBLIC_HOST}${url.pathname}${url.search}`, 308);
        }
        return appSurface.fetch(request, env, ctx);
      case "both":
        return isPublicPath(url.pathname)
          ? publicApp.fetch(request, env, ctx)
          : appSurface.fetch(request, env, ctx);
      case "unknown":
        return new Response("Not found", { status: 404 });
      default: {
        const exhaustive: never = kind;
        throw new Error(`unhandled host kind ${exhaustive}`);
      }
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runMaintenance(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
