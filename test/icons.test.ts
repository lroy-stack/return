/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import spriteSource from "../public/p/icons.svg?raw";
import { EMPTY_ART, ICON_FILLS, ICONS } from "../src/app/ui/icons.generated";
import { ITEM_ART } from "../src/app/ui/item-art.generated";
import { ITEM_CATEGORIES } from "../src/shared/schemas";
import {
  buildSprite,
  compileArt,
  compileLineIcon,
  type IconPaths,
  minifyPath,
  pathPoints,
} from "../vite/icons";

const raw = (files: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(files).map(([file, source]) => [file.replace(/^.*\/([\w-]+)\.svg$/, "$1"), source]),
  );
const iconSources = raw(
  import.meta.glob<string>("../src/assets/icons/*.svg", { query: "?raw", import: "default", eager: true }),
);
const emptySources = raw(
  import.meta.glob<string>("../src/assets/empty/*.svg", { query: "?raw", import: "default", eager: true }),
);
const artSources = raw(
  import.meta.glob<string>("../src/assets/item-art/*.svg", { query: "?raw", import: "default", eager: true }),
);
const appSources = import.meta.glob<string>(["../src/app/**/*.{ts,tsx}", "!**/*.generated.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});
const finderSources = import.meta.glob<string>(
  ["../src/worker/**/*.{ts,tsx}", "../public/p/*.{html,js,css}"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
);

const NAV_ICONS = ["inventory", "inbox", "tag", "settings", "plus"];

describe("icon sources ↔ generated outputs", () => {
  const compiled = Object.entries(iconSources).map(
    ([name, src]) => [name, compileLineIcon(src, 24).paths] as const,
  );
  const outlines = Object.fromEntries(compiled.filter(([n]) => !n.endsWith("-fill")));
  const fills = Object.fromEntries(
    compiled.filter(([n]) => n.endsWith("-fill")).map(([n, p]) => [n.slice(0, -5), p]),
  );
  const empty = Object.fromEntries(
    Object.entries(emptySources).map(([n, src]) => [n, compileLineIcon(src, 64)]),
  );

  it("panel data is up to date (run `pnpm icons:build` after editing src/assets)", () => {
    expect(ICONS).toEqual(outlines);
    expect(ICON_FILLS).toEqual(fills);
    expect(EMPTY_ART).toEqual(empty);
    expect(ITEM_ART).toEqual(
      Object.fromEntries(Object.entries(artSources).map(([n, s]) => [n, compileArt(s).nodes])),
    );
  });

  it("finder sprite is up to date and CSP-safe", () => {
    expect(spriteSource).toBe(buildSprite(outlines as Record<string, IconPaths>, empty));
    expect(spriteSource).not.toMatch(/\sstyle=|<style|<script/);
    const ids = [...spriteSource.matchAll(/<symbol id="([\w-]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("icon grammar", () => {
  it("keeps every line inside the 20-unit live area (2-unit padding)", () => {
    const outside: string[] = [];
    for (const [name, paths] of [...Object.entries(ICONS), ...Object.entries(ICON_FILLS)]) {
      for (const d of paths.filter(Boolean) as string[]) {
        for (const [x, y] of pathPoints(d)) {
          if (x < 2 || x > 22 || y < 2 || y > 22) outside.push(`${name} (${x}, ${y})`);
        }
      }
    }
    expect(outside).toEqual([]);
  });

  it("has a filled variant for every navigation icon", () => {
    for (const name of NAV_ICONS) expect(Object.keys(ICON_FILLS)).toContain(name);
  });

  it("rejects colours, per-element stroke widths and inline styles in line icons", () => {
    const head =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">';
    expect(() => compileLineIcon(`${head}<path d="M4 4h16" stroke="#f00"/></svg>`, 24)).toThrow(
      /currentColor/,
    );
    expect(() => compileLineIcon(`${head}<path d="M4 4h16" stroke-width="3"/></svg>`, 24)).toThrow(/host/);
    expect(() => compileLineIcon(`${head}<path d="M4 4h16" style="fill:red"/></svg>`, 24)).toThrow(/style/);
  });

  it("minifies path data without moving any point by more than 0.05 units", () => {
    const d =
      "M3 13.5L5.16 6.65A2 2 0 0 1 7.07 5.25l9.86 0a2 2 0 0 1 1.91 1.4L21 13.5zm-1 2c1 2 3 4 5 4s4-2 5-4";
    const before = pathPoints(d);
    const after = pathPoints(minifyPath(d));
    expect(after).toHaveLength(before.length);
    after.forEach(([x, y], i) => {
      const [bx, by] = before[i] ?? [Number.NaN, Number.NaN];
      expect(Math.abs(x - bx)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(y - by)).toBeLessThanOrEqual(0.05);
    });
    expect(pathPoints("M0 0a2 2 0 011.5 2")).toEqual([
      [0, 0],
      [1.5, 2],
    ]);
  });
});

describe("icon names used in code exist", () => {
  const PATTERNS = [
    /<Icon\b[^>]*?\bname="([\w-]+)"/g,
    /\b(?:icon|leadingIcon|iconEnd)="([\w-]+)"/g,
    /\b(?:icon|name): "([\w-]+)"/g,
  ];

  it("panel (src/app): every literal icon name is in the set", () => {
    const missing: string[] = [];
    let seen = 0;
    for (const [file, source] of Object.entries(appSources)) {
      if (!/from "[./]*(?:ui\/)?Icon"/.test(source)) continue;
      for (const re of PATTERNS) {
        for (const [, name = ""] of source.matchAll(re)) {
          seen++;
          if (!(name in ICONS)) missing.push(`${file}: ${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
    // Guards the scan itself: ~150 literal references exist today.
    expect(seen).toBeGreaterThan(100);
  });

  it("item categories: every category has a line icon and an illustration", () => {
    for (const category of ITEM_CATEGORIES) {
      // Mirrors src/app/lib/categories.ts (not importable here: it pulls the React Icon into the worker project).
      expect(ICONS).toHaveProperty(category === "other" ? "box" : category);
      expect(ITEM_ART).toHaveProperty(category);
    }
  });

  it("finder pages: every /p/icons.svg#id reference exists in the sprite", () => {
    const ids = new Set([...spriteSource.matchAll(/<symbol id="([\w-]+)"/g)].map((m) => m[1]));
    const missing: string[] = [];
    for (const [file, source] of Object.entries(finderSources)) {
      for (const [, id = ""] of source.matchAll(/\/p\/icons\.svg#([\w-]+)/g)) {
        if (!ids.has(id)) missing.push(`${file}: ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
