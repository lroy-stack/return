import { describe, expect, it } from "vitest";
import { hostKind, isPublicPath } from "../src/worker/index";
import { api } from "./helpers/api";

const prod = { APP_HOST: "app.example.com", PUBLIC_HOST: "example.com", ENVIRONMENT: "production" } as Env;

describe("host routing", () => {
  it("classifies configured hosts", () => {
    expect(hostKind("app.example.com", prod)).toBe("app");
    expect(hostKind("example.com", prod)).toBe("public");
  });

  it("refuses unknown hosts in production (e.g. a stray workers.dev route)", () => {
    expect(hostKind("return-app.someone.workers.dev", prod)).toBe("unknown");
  });

  it("serves both surfaces on one origin outside production", () => {
    expect(
      hostKind("localhost", { ...prod, APP_HOST: "", PUBLIC_HOST: "", ENVIRONMENT: "development" }),
    ).toBe("both");
  });

  it("recognises finder paths", () => {
    expect(isPublicPath("/t/abc")).toBe(true);
    expect(isPublicPath("/T/ABC")).toBe(true);
    expect(isPublicPath("/c/xyz")).toBe(true);
    expect(isPublicPath("/api/items")).toBe(false);
    expect(isPublicPath("/items/1")).toBe(false);
  });
});

describe("unknown API paths", () => {
  it.each(["GET", "POST", "DELETE"])("answer %s with a JSON 404, not the panel's HTML", async (method) => {
    const res = await api(method, "/no/such/route", method === "POST" ? {} : undefined);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ error: { code: "not_found" } });
  });

  it("still asks for authentication first", async () => {
    expect((await api("GET", "/no/such/route", undefined, { jwt: null })).status).toBe(401);
  });
});
