import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_ALWAYS_PASS_SECRET, verifyTurnstile } from "../src/worker/services/turnstile";

const base = { TURNSTILE_SECRET_KEY: TURNSTILE_ALWAYS_PASS_SECRET, PUBLIC_HOST: "" } as Env;

describe("Turnstile verification", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts Cloudflare's always-pass test secret offline in local development only", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(
      await verifyTurnstile({ ...base, ENVIRONMENT: "development" }, "XXXX.DUMMY.TOKEN.XXXX", null),
    ).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still requires a token in development", async () => {
    expect(await verifyTurnstile({ ...base, ENVIRONMENT: "development" }, null, null)).toBe(false);
  });

  it("always calls siteverify in production, even with the test secret", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: false }));
    expect(await verifyTurnstile({ ...base, ENVIRONMENT: "production" }, "token", "203.0.113.9")).toBe(false);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("never short-circuits a real secret in development", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ success: false }));
    const env = { ...base, ENVIRONMENT: "development", TURNSTILE_SECRET_KEY: "0x4AAAA-real-secret" } as Env;
    expect(await verifyTurnstile(env, "token", null)).toBe(false);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
