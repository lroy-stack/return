import { Hono } from "hono";
import type { AppEnv } from "../env";
import { capabilityHeaders } from "../lib/http";
import { negotiateLanguage } from "./lang";
import { EmergencyPage, HomePage, PrivacyPage } from "./pages";
import { htmlPage } from "./support";

export const staticRoutes = new Hono<AppEnv>();
staticRoutes.use("*", capabilityHeaders);

staticRoutes.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /"));
staticRoutes.get("/", (c) => htmlPage(c, <HomePage lang={negotiateLanguage(c)} />));
// No database access: this page must survive a D1 outage.
staticRoutes.get("/emergency", (c) => htmlPage(c, <EmergencyPage email={c.env.FALLBACK_CONTACT_EMAIL} />));
staticRoutes.get("/privacy", (c) => htmlPage(c, <PrivacyPage lang={negotiateLanguage(c)} />));
