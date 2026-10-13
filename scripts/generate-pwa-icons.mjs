#!/usr/bin/env node
// Regenerates public/icons/*.png from the brand mark (same glyph as Shell.tsx `Logo`, colours from
// src/shared/brand.ts). Uses the Chromium that Playwright already installs: `pnpm icons:pwa`.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BRAND } from "../src/shared/brand.ts";

const OUT = path.join(import.meta.dirname, "../public/icons");
const GLYPH = `<path d="M10 22V10h7a4 4 0 0 1 0 8h-7m6 0 5 4" fill="none" stroke="${BRAND.warmWhite}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

/** "any": the rounded logo tile on a transparent canvas. */
const rounded = `<rect width="32" height="32" rx="9" fill="${BRAND.petrol}"/>${GLYPH}`;
/** Full-bleed tile with the glyph enlarged inside the maskable safe zone (centre 80 %). Also the iOS touch icon. */
const bleed = `<rect width="32" height="32" fill="${BRAND.petrol}"/><g transform="translate(16 16) scale(1.2) translate(-15.5 -16)">${GLYPH}</g>`;

const ICONS = [
  { file: "icon-192.png", size: 192, body: rounded, transparent: true },
  { file: "icon-512.png", size: 512, body: rounded, transparent: true },
  { file: "icon-maskable-512.png", size: 512, body: bleed, transparent: false },
  { file: "apple-touch-icon.png", size: 180, body: bleed, transparent: false },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { file, size, body, transparent } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block}</style><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}">${body}</svg>`,
    );
    const png = await page.screenshot({ omitBackground: transparent, type: "png" });
    writeFileSync(path.join(OUT, file), png);
    await page.close();
    console.log(`public/icons/${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
