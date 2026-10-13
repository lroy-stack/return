import { describe, expect, it } from "vitest";
import {
  filterOptions,
  firstEnabled,
  fold,
  step,
  TYPEAHEAD_MS,
  type TypeaheadBuffer,
  typeaheadMatch,
} from "../src/app/ui/select-logic";

const zones = [
  {
    label: "Berlin",
    description: "GMT+02:00 · Central European Summer Time",
    keywords: "Europe/Berlin GMT+2",
  },
  {
    label: "Lisbon",
    description: "GMT+01:00 · Western European Summer Time",
    keywords: "Europe/Lisbon GMT+1",
  },
  { label: "Zürich", description: "GMT+02:00", keywords: "Europe/Zurich GMT+2" },
  { label: "London", description: "GMT+01:00 · British Summer Time", keywords: "Europe/London GMT+1" },
];

describe("fold", () => {
  it("ignores case and accents", () => {
    expect(fold("Zürich")).toBe("zurich");
    expect(fold("ESPAÑOL")).toBe("espanol");
  });
});

describe("filterOptions", () => {
  it("returns every option for an empty or blank query", () => {
    expect(filterOptions(zones, "")).toEqual(zones);
    expect(filterOptions(zones, "   ")).toEqual(zones);
  });

  it("matches label, description and keywords, accent-insensitively", () => {
    expect(filterOptions(zones, "zurich").map((z) => z.label)).toEqual(["Zürich"]);
    expect(filterOptions(zones, "british").map((z) => z.label)).toEqual(["London"]);
    expect(filterOptions(zones, "gmt+1").map((z) => z.label)).toEqual(["Lisbon", "London"]);
  });

  it("requires every term to match", () => {
    expect(filterOptions(zones, "gmt+1 summer british").map((z) => z.label)).toEqual(["London"]);
    expect(filterOptions(zones, "berlin lisbon")).toEqual([]);
  });

  it("returns the same option objects (memoised rows stay stable)", () => {
    expect(filterOptions(zones, "berlin")[0]).toBe(zones[0]);
  });
});

const list = [
  { label: "A", disabled: true },
  { label: "B" },
  { label: "C", disabled: true },
  { label: "D" },
  { label: "E" },
];

describe("firstEnabled", () => {
  it("skips disabled options in both directions", () => {
    expect(firstEnabled(list)).toBe(1);
    expect(firstEnabled(list, 2)).toBe(3);
    expect(firstEnabled(list, 2, -1)).toBe(1);
    expect(firstEnabled(list, 0, -1)).toBe(-1);
    expect(firstEnabled([])).toBe(-1);
  });
});

describe("step", () => {
  it("moves without wrapping and skips disabled options", () => {
    expect(step(list, 1, 1)).toBe(3);
    expect(step(list, 3, -1)).toBe(1);
    expect(step(list, 4, 1)).toBe(4);
    expect(step(list, 1, -1)).toBe(1);
  });

  it("moves by pages and stops at the ends", () => {
    expect(step(list, 1, 10)).toBe(4);
    expect(step(list, 4, -10)).toBe(1);
  });

  it("starts from the first enabled option when nothing is active", () => {
    expect(step(list, -1, 1)).toBe(1);
    expect(step(list, -1, -1)).toBe(4);
  });
});

describe("typeaheadMatch", () => {
  const items = ["Deutsch", "English", "Español", "Euskara", "Français"];
  const text = (s: string) => s;
  const enabled = () => true;
  const fresh = (): TypeaheadBuffer => ({ value: "", at: 0 });

  it("finds the first match after the current one for a single letter", () => {
    const b = fresh();
    expect(typeaheadMatch(items, text, enabled, b, "e", 0, 10_000)).toBe(1);
  });

  it("builds a prefix from keys typed within the window", () => {
    const b = fresh();
    typeaheadMatch(items, text, enabled, b, "e", 0, 10_000);
    expect(typeaheadMatch(items, text, enabled, b, "s", 0, 10_100)).toBe(2);
  });

  it("cycles through matches when the same letter repeats", () => {
    const b = fresh();
    const first = typeaheadMatch(items, text, enabled, b, "e", 0, 10_000);
    const second = typeaheadMatch(items, text, enabled, b, "e", first, 10_100);
    const third = typeaheadMatch(items, text, enabled, b, "e", second, 10_200);
    expect([first, second, third]).toEqual([1, 2, 3]);
    expect(typeaheadMatch(items, text, enabled, b, "e", third, 10_300)).toBe(1);
  });

  it("starts a new prefix after the window and matches accent-insensitively", () => {
    const b = fresh();
    typeaheadMatch(items, text, enabled, b, "e", 0, 10_000);
    expect(typeaheadMatch(items, text, enabled, b, "f", 1, 10_000 + TYPEAHEAD_MS + 1)).toBe(4);
    const c = fresh();
    expect(typeaheadMatch(["Ñandú", "Óscar"], text, enabled, c, "o", -1, 1)).toBe(1);
  });

  it("skips disabled items and reports no match", () => {
    const b = fresh();
    expect(typeaheadMatch(items, text, (s) => s !== "English", b, "e", 0, 10_000)).toBe(2);
    expect(typeaheadMatch(items, text, enabled, fresh(), "z", 0, 1)).toBe(-1);
  });
});
