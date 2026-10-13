import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Local D1/R2 state lives in .wrangler/state; E2E runs point this at a fresh directory so they never share data.
const persistPath = process.env.LOCAL_STATE_DIR;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      viteEnvironment: { name: "worker" },
      ...(persistPath ? { persistState: { path: persistPath } } : {}),
    }),
  ],
});
