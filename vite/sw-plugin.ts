import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { build, type Plugin } from "vite";

/** Bundles `src/sw/sw.ts` (or the kill switch) into one classic script with the build constants inlined. */
export async function bundleServiceWorker(options: {
  root: string;
  kill: boolean;
  buildId: string;
  precache: string[];
}): Promise<string> {
  const { root, kill, buildId, precache } = options;
  const result = await build({
    root,
    configFile: false,
    envDir: false,
    publicDir: false,
    logLevel: "warn",
    define: { __BUILD_ID__: JSON.stringify(buildId), __PRECACHE__: JSON.stringify(precache) },
    build: {
      write: false,
      minify: true,
      target: "es2022",
      emptyOutDir: false,
      lib: {
        entry: path.join(root, kill ? "src/sw/kill.ts" : "src/sw/sw.ts"),
        formats: ["iife"],
        name: "returnSw",
      },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunk = outputs.flatMap((o) => ("output" in o ? o.output : [])).find((o) => o.type === "chunk");
  if (!chunk) throw new Error("sw-plugin: service worker bundle produced no chunk");
  return chunk.code;
}

/**
 * Emits `/sw.js` for the owner panel (ADR 0002) with a build id and the precache list injected.
 *  - Build id: `SW_BUILD_ID` if set, otherwise a hash of the emitted file names (content-hashed) plus the bytes of
 *    the unhashed public files that are precached (manifest, icons).
 *  - `SW_KILL=1` emits the kill-switch worker (`src/sw/kill.ts`) instead; see docs/operations.md.
 */
export function swPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "return:service-worker",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    configResolved(config) {
      root = config.root;
    },
    async generateBundle(_options, bundle) {
      const kill = process.env.SW_KILL === "1";
      const emitted = Object.keys(bundle).filter((f) => f.startsWith("assets/") && !f.endsWith(".map"));
      const publicFiles = [
        "manifest.webmanifest",
        "theme-init.js",
        ...readdirSync(path.join(root, "public/icons")).map((f) => `icons/${f}`),
      ].sort();
      const hash = createHash("sha256");
      for (const file of [...emitted].sort()) hash.update(file);
      for (const file of publicFiles) hash.update(readFileSync(path.join(root, "public", file)));
      const buildId = process.env.SW_BUILD_ID ?? hash.digest("hex").slice(0, 10);
      const precache = [...emitted, ...publicFiles].map((f) => `/${f}`);

      const code = await bundleServiceWorker({ root, kill, buildId, precache });
      this.emitFile({ type: "asset", fileName: "sw.js", source: code });
    },
  };
}
