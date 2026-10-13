import { describe, expect, it } from "vitest";
import {
  formatMeeting,
  isPastMeeting,
  isRealWallClock,
  isValidLocale,
  isValidTimeZone,
  nowInZone,
  parseWallClock,
  wallClockToInstant,
  zoneLabel,
} from "../src/shared/datetime";

describe("wall-clock validation", () => {
  it.each(["2026-10-14T18:30", "2028-02-29T00:00", "2026-12-31T23:59"])("accepts %s", (v) => {
    expect(isRealWallClock(v)).toBe(true);
  });

  it.each([
    "2026-02-31T18:30",
    "2026-02-29T18:30",
    "2026-04-31T10:00",
    "2026-13-01T10:00",
    "2026-10-14T24:00",
    "2026-10-14T18:60",
    "2026-10-14 18:30",
    "2026-10-14",
  ])("rejects %s", (v) => {
    expect(isRealWallClock(v)).toBe(false);
  });

  it("splits a valid value into parts", () => {
    expect(parseWallClock("2026-10-14T18:30")).toEqual({
      year: 2026,
      month: 10,
      day: 14,
      hour: 18,
      minute: 30,
    });
  });
});

describe("zones and locales", () => {
  it("knows real zones and refuses the rest", () => {
    for (const ok of ["Europe/Madrid", "UTC", "Asia/Kolkata", "America/Argentina/Buenos_Aires"]) {
      expect(isValidTimeZone(ok)).toBe(true);
    }
    for (const bad of ["Mars/Olympus", "+01:00", "CET", "", "Europe/", "europe"]) {
      expect(isValidTimeZone(bad)).toBe(false);
    }
  });

  it("validates BCP 47 locales", () => {
    expect(isValidLocale("en-GB")).toBe(true);
    expect(isValidLocale("de")).toBe(true);
    expect(isValidLocale("en_GB")).toBe(false);
    expect(isValidLocale("zz_??")).toBe(false);
  });
});

describe("converting wall clocks", () => {
  it("resolves the instant a zone's clock shows, summer and winter", () => {
    expect(wallClockToInstant("2026-07-01T12:00", "Europe/Madrid")?.toISOString()).toBe(
      "2026-07-01T10:00:00.000Z",
    );
    expect(wallClockToInstant("2026-12-01T12:00", "Europe/Madrid")?.toISOString()).toBe(
      "2026-12-01T11:00:00.000Z",
    );
    expect(wallClockToInstant("2026-12-01T12:00", "America/New_York")?.toISOString()).toBe(
      "2026-12-01T17:00:00.000Z",
    );
    expect(wallClockToInstant("2026-12-01T12:00", "Asia/Kolkata")?.toISOString()).toBe(
      "2026-12-01T06:30:00.000Z",
    );
  });

  it("returns null for junk", () => {
    expect(wallClockToInstant("2026-02-31T12:00", "UTC")).toBeNull();
    expect(wallClockToInstant("2026-02-01T12:00", "Mars/Olympus")).toBeNull();
  });

  it("round-trips through nowInZone", () => {
    const now = new Date("2026-10-13T20:15:30Z");
    expect(nowInZone("Asia/Tokyo", now)).toBe("2026-10-14T05:15");
    expect(wallClockToInstant(nowInZone("Asia/Tokyo", now), "Asia/Tokyo")?.toISOString()).toBe(
      "2026-10-13T20:15:00.000Z",
    );
  });

  it("treats the past with a 10 minute grace, on the zone's clock", () => {
    const now = new Date("2026-10-13T20:00:00Z");
    expect(isPastMeeting("2026-10-13T21:55", "Europe/Madrid", now)).toBe(false); // 19:55 UTC, 5 min ago
    expect(isPastMeeting("2026-10-13T21:45", "Europe/Madrid", now)).toBe(true); // 19:45 UTC, 15 min ago
    expect(isPastMeeting("2026-10-13T21:45", "America/New_York", now)).toBe(false); // 01:45 UTC tomorrow
  });
});

describe("formatting", () => {
  it("names the zone after the time", () => {
    expect(formatMeeting("2026-10-14T18:30", "Europe/Madrid", "en-GB")).toBe("14 Oct 2026, 18:30 (Madrid)");
    expect(formatMeeting("2026-10-14T18:30", "America/Argentina/Buenos_Aires", "en-GB")).toContain(
      "(Buenos Aires)",
    );
    expect(formatMeeting("2026-10-14T18:30", null, "en-GB")).toBe("14 Oct 2026, 18:30");
  });

  it("labels zones by city", () => {
    expect(zoneLabel("America/New_York")).toBe("New York");
    expect(zoneLabel("UTC")).toBe("UTC");
  });
});
