import { defineConfig, devices } from "@playwright/test";

/** `E2E_PORT` / `E2E_STATE_DIR` let a second run (another agent, CI shard) use its own server and database. */
const PORT = Number(process.env.E2E_PORT ?? 5199);
/** Production build served by `vite preview` for the PWA spec, with its own database (see e2e/pwa.spec.ts). */
const PWA_PORT = Number(process.env.E2E_PWA_PORT ?? 5198);
/** Wiped on every run so each suite starts from an empty database, as in CI (and never touches `pnpm dev` data). */
const STATE_DIR = process.env.E2E_STATE_DIR ?? ".wrangler/e2e";
const PWA_STATE_DIR = `${STATE_DIR}-pwa`;
/** E2E always runs on the committed template, never on a deployment's real wrangler.jsonc. */
const CONFIG = "wrangler.example.jsonc";
const PWA = /pwa.*\.spec\.ts/;
/**
 * Opt-in README screenshots (`pnpm screenshots`): own server, port and wiped state dir, fictional demo data.
 * With SCREENSHOTS=1 only that project and server exist, so the regular suite can never run or start them.
 */
const SCREENSHOTS = process.env.SCREENSHOTS === "1";
const SCREENS_PORT = 5196;
const SCREENS_STATE_DIR = ".wrangler/screens";

/**
 * End-to-end tests against the real Worker + SPA served by Vite with local D1/R2 (Miniflare).
 * The dev auth bypass (ENVIRONMENT=development in .dev.vars, loopback host) stands in for Access.
 * NOMINATIM_STUB=1 keeps place search offline (see .dev.vars.example).
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Own output dir: the regular suite wipes test-results/ and must not pull files out from under this run.
  ...(SCREENSHOTS && { outputDir: ".wrangler/screens-results" }),
  use: { baseURL: `http://localhost:${SCREENSHOTS ? SCREENS_PORT : PORT}`, trace: "retain-on-failure" },
  projects: SCREENSHOTS
    ? [{ name: "screenshots", testMatch: /screenshots\.capture\.ts/, use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "mobile", testIgnore: PWA, use: { ...devices["Pixel 7"] } },
        {
          name: "desktop",
          testIgnore: PWA,
          use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
        },
        // Service worker and install behaviour only exist in the production build, so this project has its own server.
        // `channel: "chromium"` = full Chromium in new headless mode: the default headless shell denies
        // `showNotification` even with the permission granted, which the push specs need.
        { name: "pwa", testMatch: PWA, use: { ...devices["Desktop Chrome"], channel: "chromium" } },
      ],
  webServer: SCREENSHOTS
    ? [
        {
          command: [
            `rm -rf ${SCREENS_STATE_DIR}`,
            `pnpm exec wrangler d1 migrations apply DB --local --config ${CONFIG} --persist-to ${SCREENS_STATE_DIR}`,
            `WRANGLER_CONFIG=${CONFIG} LOCAL_STATE_DIR=${SCREENS_STATE_DIR} pnpm exec vite dev --port ${SCREENS_PORT} --strictPort`,
          ].join(" && "),
          url: `http://localhost:${SCREENS_PORT}/robots.txt`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : [
        {
          command: [
            `rm -rf ${STATE_DIR}`,
            `pnpm exec wrangler d1 migrations apply DB --local --config ${CONFIG} --persist-to ${STATE_DIR}`,
            `WRANGLER_CONFIG=${CONFIG} LOCAL_STATE_DIR=${STATE_DIR} pnpm exec vite dev --port ${PORT} --strictPort`,
          ].join(" && "),
          url: `http://localhost:${PORT}/robots.txt`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: [
            `rm -rf ${PWA_STATE_DIR}`,
            `pnpm exec wrangler d1 migrations apply DB --local --config ${CONFIG} --persist-to ${PWA_STATE_DIR}`,
            `WRANGLER_CONFIG=${CONFIG} pnpm exec vite build`,
            `WRANGLER_CONFIG=${CONFIG} LOCAL_STATE_DIR=${PWA_STATE_DIR} pnpm exec vite preview --port ${PWA_PORT} --strictPort`,
          ].join(" && "),
          url: `http://localhost:${PWA_PORT}/robots.txt`,
          reuseExistingServer: false,
          timeout: 180_000,
        },
      ],
});
