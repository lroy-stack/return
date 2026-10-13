import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";
import { APP, accessJwt, PUBLIC, worker } from "./helpers/auth";

describe("owner API authentication", () => {
  it("accepts a valid Access JWT for a configured owner", async () => {
    const res = await api("GET", "/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: "owner@example.test" });
  });

  it("rejects requests without the Access assertion", async () => {
    const res = await api("GET", "/me", undefined, { jwt: null });
    expect(res.status).toBe(401);
  });

  it("rejects a JWT for a different audience", async () => {
    const res = await api("GET", "/me", undefined, { jwt: await accessJwt(undefined, { aud: "other-app" }) });
    expect(res.status).toBe(401);
  });

  it("rejects a JWT from another issuer", async () => {
    const res = await api("GET", "/me", undefined, {
      jwt: await accessJwt(undefined, { iss: "https://evil.example" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects an expired JWT", async () => {
    const res = await api("GET", "/me", undefined, { jwt: await accessJwt(undefined, { expSeconds: -60 }) });
    expect(res.status).toBe(401);
  });

  it("rejects a forged unsigned token", async () => {
    const forged = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ email: "owner@example.test" }))}.`;
    const res = await api("GET", "/me", undefined, { jwt: forged });
    expect(res.status).toBe(401);
  });

  it("rejects authenticated users who are not owners", async () => {
    const res = await api("GET", "/me", undefined, { email: "stranger@example.test" });
    expect(res.status).toBe(401);
  });

  it("does not honour a client-sent email header", async () => {
    const res = await worker.fetch(
      new Request(`${APP}/api/me`, {
        headers: { "Cf-Access-Authenticated-User-Email": "owner@example.test" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects cross-origin writes (CSRF)", async () => {
    const res = await api("POST", "/items", { name: "Bag" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("does not expose the owner API on the public host", async () => {
    const res = await worker.fetch(
      new Request(`${PUBLIC}/api/me`, { headers: { "Cf-Access-Jwt-Assertion": await accessJwt() } }),
    );
    expect(res.status).not.toBe(200);
  });
});
