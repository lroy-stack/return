import { Hono } from "hono";
import type { Me } from "../../shared/schemas";
import { authenticateOwner } from "../auth/access";
import { ensureOwner } from "../db/owners";
import type { AppEnv } from "../env";
import { AppError, sameOriginWrites, toErrorResponse } from "../lib/http";
import { activityApi } from "./activity";
import { contactsApi } from "./contacts";
import { conversationsApi } from "./conversations";
import { dataApi } from "./data";
import { filesApi } from "./files";
import { itemsApi } from "./items";
import { overviewApi } from "./overview";
import { recoveriesApi } from "./recoveries";
import { settingsApi } from "./settings";
import { systemApi } from "./system";
import { tagsApi } from "./tags";
import { trackersApi } from "./trackers";

export const ownerApi = new Hono<AppEnv>();
ownerApi.onError(toErrorResponse);

// Every /api request must carry a valid Cloudflare Access identity of a configured owner.
ownerApi.use("*", async (c, next) => {
  const auth = await authenticateOwner(c.req.raw, c.env);
  if (!auth.ok) throw new AppError(401, "unauthorized", "Authentication required", { reason: auth.reason });
  c.set("ownerEmail", auth.email);
  c.set("ownerId", await ensureOwner(c.env.DB, auth.email));
  await next();
});
ownerApi.use("*", sameOriginWrites);

ownerApi.get("/me", (c) => c.json<Me>({ ownerId: c.get("ownerId"), email: c.get("ownerEmail") }));
ownerApi.route("/overview", overviewApi);
ownerApi.route("/items", itemsApi);
ownerApi.route("/files", filesApi);
ownerApi.route("/tags", tagsApi);
ownerApi.route("/trackers", trackersApi);
ownerApi.route("/recoveries", recoveriesApi);
ownerApi.route("/conversations", conversationsApi);
ownerApi.route("/contacts", contactsApi);
ownerApi.route("/settings", settingsApi);
ownerApi.route("/activity", activityApi);
ownerApi.route("/data", dataApi);
ownerApi.route("/system", systemApi);
ownerApi.notFound(() => {
  throw new AppError(404, "not_found", "Unknown API route");
});
