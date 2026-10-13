import { describe, expect, it } from "vitest";
import { applyPatch, isEmptyPatch, settingsDiff } from "../src/app/lib/settings-patch";
import { DEFAULT_SETTINGS, type Settings } from "../src/shared/settings";

const clone = (): Settings => structuredClone(DEFAULT_SETTINGS);

describe("settingsDiff", () => {
  it("is empty when nothing changed", () => {
    expect(isEmptyPatch(settingsDiff(DEFAULT_SETTINGS, clone()))).toBe(true);
  });

  it("keeps only the changed leaves, nested", () => {
    const next = clone();
    next.privacy.recordScanCountry = !next.privacy.recordScanCountry;
    next.notifications.events.newMessage = !next.notifications.events.newMessage;
    expect(settingsDiff(DEFAULT_SETTINGS, next)).toEqual({
      privacy: { recordScanCountry: next.privacy.recordScanCountry },
      notifications: { events: { newMessage: next.notifications.events.newMessage } },
    });
  });

  it("replaces null and scalar values as a whole", () => {
    const next = clone();
    next.notifications.mutedUntil = "2030-01-01T00:00:00.000Z";
    expect(settingsDiff(DEFAULT_SETTINGS, next)).toEqual({
      notifications: { mutedUntil: "2030-01-01T00:00:00.000Z" },
    });
    expect(settingsDiff(next, DEFAULT_SETTINGS)).toEqual({ notifications: { mutedUntil: null } });
  });

  it("a patch applied to the base gives the target, and its inverse restores the base", () => {
    const next = clone();
    next.identity.panelLanguage = "es";
    next.tags.showNameOnCard = !next.tags.showNameOnCard;
    const patch = settingsDiff(DEFAULT_SETTINGS, next);
    expect(applyPatch(DEFAULT_SETTINGS, patch)).toEqual(next);
    expect(applyPatch(next, settingsDiff(next, DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });
});
