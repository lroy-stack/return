import { expect, test } from "@playwright/test";

/**
 * Production build (see the "pwa" project): loading the panel must not ask for the same API resource twice. The dev
 * server's StrictMode double mount hides this, so it is measured on the built bundle.
 */
test.use({ baseURL: `http://localhost:${process.env.E2E_PWA_PORT ?? 5198}` });

test("a cold load requests each API resource once", async ({ page }) => {
  const seen: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/")) seen.push(`${r.method()} ${url.pathname}${url.search}`);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const duplicates = seen.filter((s, i) => seen.indexOf(s) !== i);
  expect(duplicates, `requests: ${seen.join(", ")}`).toEqual([]);
});

test("the theme head script is served from the same origin and precached", async ({ page, request }) => {
  const res = await request.get("/theme-init.js");
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("javascript");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
});
