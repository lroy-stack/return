import { describe, expect, it } from "vitest";
import { centsToInput, parseMoneyToCents } from "../src/app/lib/format";

describe("parseMoneyToCents", () => {
  it.each([
    ["1.234,50", "es", 123450],
    ["1,234.50", "en", 123450],
    ["1,234.50", "es", 123450],
    ["1.234,50", "en", 123450],
    ["12,50", "es", 1250],
    ["12.50", "es", 1250],
    ["12,5", "en", 1250],
    ["12.5", "en", 1250],
    ["1.234", "es", 123400],
    ["1,234", "en", 123400],
    ["1,234", "es", 123],
    ["1.234", "en", 123],
    ["1.234.567", "es", 123456700],
    ["1,234,567.89", "en", 123456789],
    ["1 234,50", "es", 123450],
    ["0", "en", 0],
    ["  99  ", "en", 9900],
  ])("reads %s in %s as %d cents", (text, locale, cents) => {
    expect(parseMoneyToCents(text, locale)).toBe(cents);
  });

  it("returns undefined for an empty field", () => {
    expect(parseMoneyToCents("  ", "en")).toBeUndefined();
  });

  it.each(["abc", "-5", "1.23.4567", "1,2,3.5", "12€", "1.234,5.6", ","])("rejects %s", (text) => {
    expect(parseMoneyToCents(text, "en")).toBeNull();
  });
});

describe("centsToInput", () => {
  it("shows the amount with the locale's decimal separator and no grouping", () => {
    expect(centsToInput(123456, "en")).toBe("1234.56");
    expect(centsToInput(123456, "es")).toBe("1234,56");
    expect(centsToInput(null, "es")).toBe("");
  });

  it("round-trips through the parser", () => {
    for (const locale of ["en", "es", "de"]) {
      expect(parseMoneyToCents(centsToInput(98765, locale), locale)).toBe(98765);
    }
  });
});
