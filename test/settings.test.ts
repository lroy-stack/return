import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../src/shared/settings";
import { api, apiJson } from "./helpers/api";

describe("settings", () => {
  it("returns defaults for a fresh owner", async () => {
    expect(await apiJson<Settings>("GET", "/settings")).toEqual(DEFAULT_SETTINGS);
  });

  it("saves a full document, persists it and records activity", async () => {
    const next: Settings = {
      ...DEFAULT_SETTINGS,
      identity: { ...DEFAULT_SETTINGS.identity, publicName: "Lena", defaultPublicLanguage: "de" },
      contact: { ...DEFAULT_SETTINGS.contact, email: "lena@example.test" },
      privacy: { ...DEFAULT_SETTINGS.privacy, activityRetentionDays: 30 },
    };
    expect(await apiJson<Settings>("PUT", "/settings", next)).toEqual(next);
    expect(await apiJson<Settings>("GET", "/settings")).toEqual(next);
    const { events } = await apiJson<{ events: { type: string }[] }>("GET", "/activity");
    expect(events.map((e) => e.type)).toContain("settings.updated");
  });

  it("fills defaults for missing sections but rejects invalid values", async () => {
    const minimal = await apiJson<Settings>("PUT", "/settings", {});
    expect(minimal).toEqual(DEFAULT_SETTINGS);
    const bad = await api("PUT", "/settings", {
      contact: { email: "nope" },
      privacy: { activityRetentionDays: 1 },
      tags: { labelDigits: 9 },
    });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("validation_failed");
    expect(await apiJson<Settings>("GET", "/settings")).toEqual(DEFAULT_SETTINGS);
  });

  it("reports an unreachable recipient from the test email without failing the request", async () => {
    const res = await api("POST", "/settings/test-email", {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, error: "no_recipient" });
  });

  it("answers 200 with a boolean outcome when a recipient exists", async () => {
    await apiJson("PUT", "/settings", {
      notifications: { emailAddress: "me@example.test" },
    });
    const res = await api("POST", "/settings/test-email", {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(typeof body.ok).toBe("boolean");
    if (!body.ok) expect(body.error).toBeTruthy();
  });
});
