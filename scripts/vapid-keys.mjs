#!/usr/bin/env node
import { webcrypto } from "node:crypto";
/**
 * Generates a VAPID key pair (P-256) for Web Push (ADR 0003, RFC 8292).
 *
 *   node scripts/vapid-keys.mjs | pnpm exec wrangler secret put VAPID_PRIVATE_KEY
 *   node scripts/vapid-keys.mjs --out vapid-private.key      (file mode 0600, never overwritten)
 *   node scripts/vapid-keys.mjs --print-private               (shows the secret on the terminal)
 *
 * stdout carries only the private key (PKCS#8, base64url), so it can be piped straight into
 * `wrangler secret put`. The public key (65-byte point, base64url) and the next steps go to
 * stderr. Without a pipe, `--out` or `--print-private` the script refuses to run, so the
 * private key never lands in a terminal scrollback by accident.
 */
import { writeFileSync } from "node:fs";

const base64url = (bytes) => Buffer.from(bytes).toString("base64url");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outFile = outIndex === -1 ? null : args[outIndex + 1];
const printPrivate = args.includes("--print-private");
const known = new Set(["--out", "--print-private", outFile]);
const unknown = args.filter((a) => !known.has(a));

if (unknown.length > 0 || (outIndex !== -1 && !outFile)) {
  console.error("Usage: node scripts/vapid-keys.mjs [--out <file> | --print-private]  (or pipe stdout)");
  process.exit(2);
}
if (!outFile && !printPrivate && process.stdout.isTTY) {
  console.error(
    "Refusing to print the private key to a terminal.\n" +
      "Pipe it: node scripts/vapid-keys.mjs | pnpm exec wrangler secret put VAPID_PRIVATE_KEY\n" +
      "or use --out <file> / --print-private.",
  );
  process.exit(2);
}

const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicKey = base64url(new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey)));
const privateKey = base64url(new Uint8Array(await webcrypto.subtle.exportKey("pkcs8", pair.privateKey)));

if (outFile) {
  try {
    // "wx": fail instead of overwriting an existing key.
    writeFileSync(outFile, `${privateKey}\n`, { flag: "wx", mode: 0o600 });
  } catch (err) {
    console.error(`Cannot write ${outFile}: ${err.code === "EEXIST" ? "file already exists" : err.message}`);
    process.exit(1);
  }
} else {
  process.stdout.write(privateKey);
  if (process.stdout.isTTY) process.stdout.write("\n");
}

console.error(`VAPID_PUBLIC_KEY=${publicKey}`);
console.error(
  [
    "",
    "Next steps:",
    '  1. Put the public key in wrangler.jsonc: "vars": { "VAPID_PUBLIC_KEY": "<value above>" }',
    "  2. Store the private key as a secret (the pipe form above does it; for --out:",
    `     ${outFile ? `pnpm exec wrangler secret put VAPID_PRIVATE_KEY < ${outFile}` : "pnpm exec wrangler secret put VAPID_PRIVATE_KEY"})`,
    "  3. Local dev: add both to .dev.vars (git-ignored).",
    "Rotating the pair invalidates every existing push subscription (devices must subscribe again).",
  ].join("\n"),
);
