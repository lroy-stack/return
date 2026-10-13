import { describe, expect, it } from "vitest";
import { authenticateOwner } from "../src/worker/auth/access";

const base = {
  ENVIRONMENT: "development",
  DEV_OWNER_EMAIL: "dev@example.test",
  ACCESS_TEAM_DOMAIN: "",
  ACCESS_AUD: "",
  OWNER_EMAILS: "owner@example.test",
} as Env;

describe("local development auth bypass", () => {
  it("is honoured only in development on a loopback host", async () => {
    const res = await authenticateOwner(new Request("http://localhost:5173/api/me"), base);
    expect(res).toEqual({ ok: true, email: "dev@example.test" });
  });

  it("is ignored in production even on localhost", async () => {
    const res = await authenticateOwner(new Request("http://localhost:5173/api/me"), {
      ...base,
      ENVIRONMENT: "production",
    });
    expect(res.ok).toBe(false);
  });

  it("is ignored on a non-loopback host in development (e.g. a LAN IP or tunnel)", async () => {
    for (const url of ["http://192.168.1.20:5173/api/me", "https://abc.trycloudflare.com/api/me"]) {
      const res = await authenticateOwner(new Request(url), base);
      expect(res.ok).toBe(false);
    }
  });

  it("fails closed when Access is not configured", async () => {
    const res = await authenticateOwner(new Request("https://app.example.com/api/me"), {
      ...base,
      ENVIRONMENT: "production",
    });
    expect(res).toEqual({ ok: false, reason: "access_not_configured" });
  });
});
