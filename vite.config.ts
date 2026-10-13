import { existsSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { swPlugin } from "./vite/sw-plugin.ts";

// Local D1/R2 state lives in .wrangler/state; E2E runs point this at a fresh directory so they never share data.
const persistPath = process.env.LOCAL_STATE_DIR;
// The real wrangler.jsonc is git-ignored (it holds one deployment's identifiers). Without it, or when E2E asks
// for it, the committed template is used.
const configPath =
  process.env.WRANGLER_CONFIG ?? (existsSync("wrangler.jsonc") ? "wrangler.jsonc" : "wrangler.example.jsonc");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    swPlugin(),
    cloudflare({
      configPath,
      viteEnvironment: { name: "worker" },
      ...(persistPath ? { persistState: { path: persistPath } } : {}),
    }),
  ],
});
