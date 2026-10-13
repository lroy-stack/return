import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.example.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENVIRONMENT: "test",
            PUBLIC_HOST: "return.test",
            APP_HOST: "app.return.test",
            ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
            ACCESS_AUD: "test-aud",
            OWNER_EMAILS: "owner@example.test",
            NOTIFY_FROM: "return@return.test",
            FALLBACK_CONTACT_EMAIL: "backup@example.test",
            TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
            TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
            IP_HMAC_SECRET: "test-secret",
            DEV_OWNER_EMAIL: "",
            // Throwaway P-256 pair generated with scripts/vapid-keys.mjs, used only by tests.
            VAPID_PUBLIC_KEY:
              "BHa-Th-SyO-86cc_ju3NFFPKQiG17_jE-PhYGKzkrnHI8eOsuLPIlT2F4bnkuZK047VBXbnq_YUMrSXEP26DS18",
            VAPID_PRIVATE_KEY:
              "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQggHJxJLJdbLtVpIzXx31P7pWM7MEtiTJ5WxdfIx2IGCuhRANCAAR2vk4fksjvvOnHP47tzRRTykIhte_4xPj4WBis5K5xyPHjrLizyJU9heG55LmStOO1QV256v2FDK0lxD9ug0tf",
            // Geocoding never reaches the real service in tests, and the 1 req/s throttle is off.
            NOMINATIM_URL: "https://nominatim.test",
            NOMINATIM_MIN_INTERVAL_MS: "0",
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
      // Integration tests drive the real Worker + D1 in workerd; under a loaded machine
      // (parallel files, dev servers) multi-step flows can exceed Vitest's 5 s default.
      testTimeout: 20_000,
    },
  };
});
