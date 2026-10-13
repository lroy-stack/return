/**
 * Owner PWA (ADR 0002) against the PRODUCTION build served by `vite preview` (see playwright.config.ts): the service
 * worker only exists in built output. A tiny reverse proxy sits in front of the preview server so a test can serve a
 * second `/sw.js` (a new build id) without a second build; it also makes the Origin header match for the Worker.
 */
import { createServer, type IncomingMessage, type Server } from "node:http";
import { expect, type Page, test } from "@playwright/test";
import { bundleServiceWorker } from "../vite/sw-plugin.ts";

const UPSTREAM = "http://localhost:5198";
const PROXY_PORT = 5197;
const PROXY = `http://localhost:${PROXY_PORT}`;

let server: Server;
/** When set, `/sw.js` is served with every occurrence of `from` replaced by `to` (a different build id). */
let swRewrite: { from: string; to: string } | null = null;
/** When set, `/sw.js` is served as exactly this script (the kill switch). */
let swReplacement: string | null = null;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

test.use({ baseURL: PROXY });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", UPSTREAM);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string" && !["host", "origin", "accept-encoding", "connection"].includes(k))
          headers.set(k, v);
      }
      if (req.headers.origin) headers.set("origin", UPSTREAM);
      // A 304 has no body to rewrite, and the browser would keep its cached worker.
      if ((swRewrite || swReplacement) && url.pathname === "/sw.js") {
        headers.delete("if-none-match");
        headers.delete("if-modified-since");
      }
      const method = req.method ?? "GET";
      const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await readBody(req));
      const upstream = await fetch(url, { method, headers, body, redirect: "manual" });
      const out = new Headers(upstream.headers);
      out.delete("content-encoding");
      out.delete("content-length");
      let payload = Buffer.from(await upstream.arrayBuffer());
      if (swRewrite && url.pathname === "/sw.js") {
        payload = Buffer.from(payload.toString("utf8").replaceAll(swRewrite.from, swRewrite.to));
      }
      const outHeaders: Record<string, string> = {};
      out.forEach((value, key) => {
        outHeaders[key] = value;
      });
      if (swReplacement && url.pathname === "/sw.js") payload = Buffer.from(swReplacement);
      res.writeHead(upstream.status, outHeaders);
      res.end(payload);
    } catch (e) {
      res.writeHead(502).end(String(e));
    }
  });
  await new Promise<void>((resolve) => server.listen(PROXY_PORT, resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const cacheUrls = (page: Page) =>
  page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) out.push(req.url);
    }
    return out;
  });

const cacheNames = (page: Page) => page.evaluate(() => caches.keys());

/** Loads the panel and waits until the service worker is active and controls the page. */
async function openControlled(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test("manifest is valid, served as a manifest, and Chromium reports no installability errors", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(link).toHaveAttribute("crossorigin", "use-credentials");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/icons/apple-touch-icon.png",
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");

  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toMatch(/manifest\+json|application\/json/);
  expect(res.headers()["cache-control"]).toContain("no-cache");
  const manifest = await res.json();
  expect(manifest).toMatchObject({
    id: "/",
    name: "RETURN",
    short_name: "RETURN",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);

  const sizes = new Set<string>();
  const purposes = new Set<string>();
  for (const icon of manifest.icons as { src: string; sizes: string; type: string; purpose: string }[]) {
    const png = await request.get(icon.src);
    expect(png.status(), icon.src).toBe(200);
    expect(png.headers()["content-type"]).toBe("image/png");
    const bytes = await png.body();
    const [w, h] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    sizes.add(icon.sizes);
    purposes.add(icon.purpose);
  }
  expect([...sizes]).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect([...purposes]).toEqual(expect.arrayContaining(["any", "maskable"]));
  const apple = await request.get("/icons/apple-touch-icon.png");
  expect(apple.status()).toBe(200);
  expect((await apple.body()).readUInt32BE(16)).toBe(180);

  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  // Playwright contexts are incognito, which Chromium reports as its own (irrelevant here) installability error.
  expect(installabilityErrors.filter((e) => e.errorId !== "in-incognito")).toEqual([]);
});

test("the service worker activates, scopes to / and is always revalidated", async ({ page, request }) => {
  await openControlled(page);
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { scope: r?.scope, active: r?.active?.state, updateViaCache: r?.updateViaCache };
  });
  expect(reg).toEqual({ scope: `${PROXY}/`, active: "activated", updateViaCache: "none" });
  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  expect(sw.headers()["content-type"]).toMatch(/javascript/);
  expect(await cacheNames(page)).toEqual([expect.stringMatching(/^return-app-[0-9a-f]{10}$/)]);
});

test("after browsing the panel, Cache Storage holds no /api/ or /cdn-cgi/ URL", async ({ page }) => {
  await openControlled(page);
  const apiCalls: string[] = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) apiCalls.push(r.url());
  });
  for (const path of ["/", "/conversations", "/tags", "/settings/system", "/settings/session"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  expect(apiCalls.length).toBeGreaterThan(0);
  const urls = await cacheUrls(page);
  expect(urls).toContain(`${PROXY}/`);
  expect(urls.some((u) => u.includes("/assets/"))).toBe(true);
  for (const url of urls) {
    expect(new URL(url).pathname, url).toMatch(
      /^\/(?:$|assets\/[^/]+$|icons\/[^/]+$|manifest\.webmanifest$|theme-init\.js$)/,
    );
  }
  expect(urls.filter((u) => u.includes("/api/") || u.includes("/cdn-cgi/"))).toEqual([]);
});

test("offline: a reload still renders the shell with an offline message, and recovers when back online", async ({
  page,
  context,
}) => {
  await openControlled(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main" }).first()).toBeAttached();
  await expect(page.getByText("You are offline")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("You are offline")).toBeHidden();
});

test("a new build id shows 'Update ready'; Reload activates it and cleans the old cache", async ({
  page,
}) => {
  await openControlled(page);
  const [oldCache] = await cacheNames(page);
  expect(oldCache).toBeTruthy();
  const oldId = (oldCache ?? "").replace("return-app-", "");
  swRewrite = { from: oldId, to: `${oldId}-next` };
  try {
    await page.evaluate(() => {
      (window as unknown as { __beforeReload: boolean }).__beforeReload = true;
    });
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    const toast = page.getByRole("status").filter({ hasText: "Update ready" });
    await expect(toast).toBeVisible();
    // Sticky: still there after the normal auto-dismiss window.
    await page.waitForTimeout(5000);
    await expect(toast).toBeVisible();
    // The old worker keeps serving until the owner chooses to reload.
    expect(await cacheNames(page)).toEqual(expect.arrayContaining([oldCache, `${oldCache}-next`]));

    await toast.getByRole("button", { name: "Reload" }).click();
    // The page reloads itself once the new worker takes control (evaluate throws while it navigates).
    await expect
      .poll(() =>
        page
          .evaluate(() => (window as unknown as { __beforeReload?: boolean }).__beforeReload ?? "reloaded")
          .catch(() => "navigating"),
      )
      .toBe("reloaded");
    await expect.poll(() => cacheNames(page)).toEqual([`${oldCache}-next`]);
    await expect(page.getByText("Update ready")).toBeHidden();
  } finally {
    swRewrite = null;
  }
});

test("kill switch: serving the kill worker unregisters the worker, deletes every cache and reloads onto the network", async ({
  page,
}) => {
  await openControlled(page);
  expect((await cacheNames(page)).length).toBe(1);
  swReplacement = await bundleServiceWorker({
    root: process.cwd(),
    kill: true,
    buildId: "kill",
    precache: [],
  });
  try {
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length).catch(() => -1),
      )
      .toBe(0);
    await page.waitForLoadState("load");
    await expect.poll(() => cacheNames(page)).toEqual([]);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  } finally {
    swReplacement = null;
  }
});
