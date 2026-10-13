import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;
/** Wiped on every run so each suite starts from an empty database, as in CI (and never touches `pnpm dev` data). */
const STATE_DIR = ".wrangler/e2e";

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
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: [
      `rm -rf ${STATE_DIR}`,
      `pnpm exec wrangler d1 migrations apply DB --local --persist-to ${STATE_DIR}`,
      `LOCAL_STATE_DIR=${STATE_DIR} pnpm exec vite dev --port ${PORT} --strictPort`,
    ].join(" && "),
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
