import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it.each([["Mars/Olympus"], ["+01:00"], ["CET1CEST"], [""]])(
    "refuses the time zone %j",
    async (timezone) => {
      const res = await api("PUT", "/settings", { identity: { timezone } });
      expect(res.status).toBe(422);
    },
  );

  it.each([["Europe/Madrid"], ["Asia/Kolkata"], ["America/Argentina/Buenos_Aires"], ["UTC"]])(
    "accepts the time zone %s",
    async (timezone) => {
      const saved = await apiJson<Settings>("PUT", "/settings", { identity: { timezone } });
      expect(saved.identity.timezone).toBe(timezone);
    },
  );

  it.each([["zz_??"], ["en_GB"], ["not a locale"]])("refuses the locale %j", async (locale) => {
    expect((await api("PUT", "/settings", { identity: { locale } })).status).toBe(422);
  });

  it("accepts a real locale", async () => {
    expect(
      (await apiJson<Settings>("PUT", "/settings", { identity: { locale: "es-ES" } })).identity.locale,
    ).toBe("es-ES");
  });

  describe("PATCH /api/settings", () => {
    it("deep-merges a partial document and leaves every other field alone", async () => {
      await apiJson("PUT", "/settings", {
        ...DEFAULT_SETTINGS,
        tags: { ...DEFAULT_SETTINGS.tags, printedEmail: "printed@example.test" },
        contact: { ...DEFAULT_SETTINGS.contact, email: "a@example.test", phone: "+34 600 000 000" },
      });
      const merged = await apiJson<Settings>("PATCH", "/settings", {
        contact: { visibility: { email: true } },
        identity: { publicName: "Lena" },
      });
      expect(merged.contact.visibility).toEqual({ ...DEFAULT_SETTINGS.contact.visibility, email: true });
      expect(merged.contact.phone).toBe("+34 600 000 000");
      expect(merged.tags.printedEmail).toBe("printed@example.test");
      expect(merged.identity.publicName).toBe("Lena");
      expect(await apiJson<Settings>("GET", "/settings")).toEqual(merged);
    });

    it("can set a field to null", async () => {
      await apiJson("PATCH", "/settings", { contact: { email: "x@example.test" } });
      const cleared = await apiJson<Settings>("PATCH", "/settings", { contact: { email: null } });
      expect(cleared.contact.email).toBeNull();
    });

    it("validates the merged result and stores nothing on failure", async () => {
      const before = await apiJson<Settings>("GET", "/settings");
      const bad = await api("PATCH", "/settings", { identity: { timezone: "Mars/Olympus" } });
      expect(bad.status).toBe(422);
      expect(await apiJson<Settings>("GET", "/settings")).toEqual(before);
    });

    it("rejects a body that is not an object and records activity on success", async () => {
      expect((await api("PATCH", "/settings", [] as never)).status).toBe(422);
      await apiJson("PATCH", "/settings", {});
      const { events } = await apiJson<{ events: { type: string }[] }>("GET", "/activity");
      expect(events.filter((e) => e.type === "settings.updated").length).toBeGreaterThan(0);
    });

    it("requires a same-origin request", async () => {
      expect((await api("PATCH", "/settings", {}, { origin: "https://evil.example" })).status).toBe(403);
      expect((await api("PATCH", "/settings", {}, { jwt: null })).status).toBe(401);
    });
  });

  it("keeps every other section when a stored document holds an unknown time zone", async () => {
    const ownerId = (await apiJson<{ ownerId: string }>("GET", "/me")).ownerId;
    const stored = {
      ...DEFAULT_SETTINGS,
      identity: {
        ...DEFAULT_SETTINGS.identity,
        publicName: "Kept",
        timezone: "Mars/Olympus",
        locale: "zz_??",
      },
      tags: { ...DEFAULT_SETTINGS.tags, printedEmail: "printed@example.test" },
    };
    await env.DB.prepare("UPDATE settings SET data = ? WHERE owner_id = ?")
      .bind(JSON.stringify(stored), ownerId)
      .run();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const read = await apiJson<Settings>("GET", "/settings");
    expect(read.identity).toMatchObject({
      publicName: "Kept",
      timezone: DEFAULT_SETTINGS.identity.timezone,
      locale: DEFAULT_SETTINGS.identity.locale,
    });
    expect(read.tags.printedEmail).toBe("printed@example.test");
    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("identity.timezone");
    expect(logged).toContain("identity.locale");
  });

  describe("test email", () => {
    afterEach(() => vi.restoreAllMocks());

    it("explains a missing recipient with a stable code and an English message", async () => {
      await apiJson("PUT", "/settings", {});
      const res = await api("POST", "/settings/test-email", {});
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ok: false,
        code: "no_recipient",
        message: expect.any(String),
      });
    });

    it("reports success with code 'sent'", async () => {
      await apiJson("PUT", "/settings", { notifications: { emailAddress: "me@example.test" } });
      vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "t" } as never);
      expect(await (await api("POST", "/settings/test-email", {})).json()).toMatchObject({
        ok: true,
        code: "sent",
      });
    });

    it.each([
      [
        Object.assign(new Error("not onboarded"), { code: "E_SENDER_DOMAIN_NOT_AVAILABLE" }),
        "sender_not_verified",
      ],
      [new Error("could not find domain config of sending domain"), "sender_not_verified"],
      [Object.assign(new Error("nope"), { code: "E_RECIPIENT_NOT_ALLOWED" }), "recipient_not_allowed"],
      [Object.assign(new Error("slow down"), { code: "E_RATE_LIMIT_EXCEEDED" }), "rate_limited"],
      [Object.assign(new Error("bounced"), { code: "E_DELIVERY_FAILED" }), "delivery_failed"],
      [new Error("something odd"), "send_failed"],
    ])("turns the delivery error %# into the code %s", async (error, code) => {
      await apiJson("PUT", "/settings", { notifications: { emailAddress: "me@example.test" } });
      vi.spyOn(env.EMAIL, "send").mockRejectedValue(error);
      const body = (await (await api("POST", "/settings/test-email", {})).json()) as {
        ok: boolean;
        code: string;
        message: string;
      };
      expect(body).toMatchObject({ ok: false, code });
      expect(body.message).not.toMatch(/E_[A-Z_]+/);
      expect(body.message.length).toBeGreaterThan(20);
    });
  });
});
