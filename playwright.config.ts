import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

/**
 * End-to-end tests against the real Worker + SPA served by Vite with local D1/R2 (Miniflare).
 * The dev auth bypass (ENVIRONMENT=development in .dev.vars, loopback host) stands in for Access.
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
    command: `pnpm db:migrate:local && pnpm exec vite dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
