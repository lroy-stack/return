#!/usr/bin/env node
// Guarded release: `pnpm run release [--dry-run] [--migrate]`. No dependencies.
// Refuses a dirty tree, a branch other than main, a main that differs from origin/main and pending remote
// migrations. Then runs the gates, builds and deploys with the git sha as version tag.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const migrate = args.has("--migrate");
const unknown = [...args].filter((a) => a !== "--dry-run" && a !== "--migrate");
if (unknown.length)
  fail(`Unknown argument(s): ${unknown.join(" ")}. Usage: pnpm run release [--dry-run] [--migrate]`);

const MIGRATE_CMD = "pnpm exec wrangler d1 migrations apply DB --remote";
const problems = [];

function fail(msg) {
  console.error(`\nrelease: ${msg}`);
  process.exit(1);
}

function run(cmd, cmdArgs, { capture = false, allowFail = false } = {}) {
  const res = spawnSync(cmd, cmdArgs, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (res.status !== 0 && !allowFail)
    fail(
      `\`${[cmd, ...cmdArgs].join(" ")}\` failed (exit ${res.status}).${capture ? `\n${res.stderr}` : ""}`,
    );
  return res;
}

const git = (...a) => run("git", a, { capture: true }).stdout.trim();

// A guard failure refuses the release; in --dry-run it is reported and the run continues.
function guard(ok, message) {
  if (ok) return;
  if (!dryRun) fail(message);
  problems.push(message);
  console.log(`  WOULD REFUSE: ${message}`);
}

console.log(`release: ${dryRun ? "DRY RUN (no migrate, no deploy)" : "live"}`);

// 1. Git guards
console.log("\n[1/5] git state");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
guard(branch === "main", `on branch "${branch}", releases come from main only.`);
const dirty = git("status", "--porcelain");
guard(!dirty, `working tree is dirty:\n${dirty}\nCommit or stash first.`);
run("git", ["fetch", "origin", "main", "--quiet"]);
const local = git("rev-parse", "main");
const remote = git("rev-parse", "origin/main");
guard(
  local === remote,
  `local main (${local.slice(0, 7)}) differs from origin/main (${remote.slice(0, 7)}). Push or pull first.`,
);
const sha = git("rev-parse", "--short", "HEAD");
const subject = git("log", "-1", "--format=%s");
console.log(`  branch=${branch} sha=${sha} subject="${subject}"`);

// 2. Pending remote migrations
console.log("\n[2/5] remote D1 migrations");
const mig = run("pnpm", ["exec", "wrangler", "d1", "migrations", "list", "DB", "--remote"], {
  capture: true,
});
const pending = !/No migrations to apply/i.test(mig.stdout);
if (pending) {
  console.log(mig.stdout);
  if (dryRun) {
    problems.push("unapplied remote migrations");
    console.log(`  WOULD REFUSE (or apply with --migrate after confirmation): ${MIGRATE_CMD}`);
  } else if (!migrate) {
    fail(`unapplied remote migrations. Apply them first:\n  ${MIGRATE_CMD}\nor re-run with --migrate.`);
  } else if (process.env.CI || !process.stdin.isTTY) {
    fail("--migrate needs an interactive terminal; refusing in CI / non-interactive mode.");
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`Apply the migrations above to PRODUCTION D1? [y/N] `))
      .trim()
      .toLowerCase();
    rl.close();
    if (answer !== "y") fail("migration not confirmed, aborting.");
    run("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "DB", "--remote"]);
  }
} else {
  console.log("  none pending");
}

// 3. Gates + build
console.log("\n[3/5] gates and build");
for (const script of ["lint", "typecheck", "test", "build"]) {
  console.log(`\n> pnpm ${script}`);
  const res = run("pnpm", [script], { allowFail: dryRun });
  if (res.status !== 0) {
    problems.push(`pnpm ${script} failed`);
    console.log(`  WOULD REFUSE: pnpm ${script} failed (exit ${res.status}).`);
  }
}

// 4. Deploy
console.log("\n[4/5] deploy");
const deployArgs = ["exec", "wrangler", "deploy", "--tag", sha, "--message", subject];
if (dryRun) {
  console.log(
    `  (dry run) would run: pnpm ${deployArgs.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`,
  );
} else {
  run("pnpm", deployArgs);
}

// 5. Post-deploy checks
console.log("\n[5/5] post-deploy checks");
if (dryRun) {
  console.log(
    "  (dry run) deployments list and live checks are read-only; running them against the current production:",
  );
}
const deployments = run("pnpm", ["exec", "wrangler", "deployments", "list"], {
  capture: true,
  allowFail: true,
});
console.log(deployments.stdout.trimEnd().split("\n").slice(-12).join("\n")); // newest deployment is last

const cfgUrl = new URL("../wrangler.jsonc", import.meta.url);
if (!existsSync(cfgUrl))
  fail("wrangler.jsonc is missing: copy wrangler.example.jsonc and fill in your deployment's values.");
const cfg = readFileSync(cfgUrl, "utf8");
const pub = cfg.match(/"PUBLIC_HOST":\s*"([^"]+)"/)?.[1];
const app = cfg.match(/"APP_HOST":\s*"([^"]+)"/)?.[1];
if (!pub || !app) fail("could not read PUBLIC_HOST / APP_HOST from wrangler.jsonc.");
const checks = [
  [`https://${pub}/p/emergency`, 200, "public static page"],
  [`https://${pub}/t/0000000000000000000000000`, 404, "unknown tag"],
  [`https://${app}/`, 302, "panel redirects to Access"],
];
let bad = 0;
for (const [url, expected, label] of checks) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const ok = res.status === expected;
    if (!ok) bad++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${res.status} (want ${expected}) ${label} ${url}`);
  } catch (err) {
    bad++;
    console.log(`  FAIL ${label} ${url}: ${err}`);
  }
}
if (bad)
  fail(`${bad} live check(s) failed. Roll back: pnpm exec wrangler rollback (see docs/operations.md).`);
if (problems.length)
  fail(`dry run finished; a real release would be refused (${problems.length} problem(s) above).`);
console.log(dryRun ? "\nrelease: dry run OK" : `\nrelease: deployed ${sha}`);
