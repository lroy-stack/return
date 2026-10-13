import { describe, expect, it } from "vitest";
import { createFormatter } from "../src/app/lib/format";

describe("noteStamps", () => {
  const notes =
    "Lost at the gate\n[2026-10-14T18:30:00.000Z] Found by a cleaner\n[2026-10-15T07:05:00.000Z] Picked up";

  it("shows server timestamps in the owner's locale and zone", () => {
    const out = createFormatter("es-ES", "Europe/Madrid").noteStamps(notes);
    expect(out).toContain("14 oct 2026");
    expect(out).toContain("20:30");
    expect(out).not.toContain("2026-10-14T18:30:00.000Z");
    expect(out.split("\n")[0]).toBe("Lost at the gate");
  });

  it("follows the zone", () => {
    expect(createFormatter("en-GB", "America/New_York").noteStamps(notes)).toContain("14:30");
  });

  it("leaves text that only looks like a stamp, and unparseable stamps, alone", () => {
    const text = "see [2026-10-14T18:30:00.000Z] inline\n[2026-13-45T99:99:99Z] nope";
    expect(createFormatter("en-GB", "UTC").noteStamps(text)).toBe(text);
  });
});
