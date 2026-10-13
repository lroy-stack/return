import { describe, expect, it } from "vitest";
import { isStorable, type SwRequestInfo, type SwStrategy, strategyFor } from "../src/shared/sw-routing";

const ORIGIN = "https://app.return.test";
const req = (path: string, init: Partial<SwRequestInfo> = {}): SwRequestInfo => ({
  url: path.startsWith("http") ? path : `${ORIGIN}${path}`,
  method: "GET",
  mode: "cors",
  ...init,
});

describe("strategyFor", () => {
  const apiPaths = [
    "/api/items",
    "/api/items/123?x=1",
    "/api/system",
    "/api/alerts",
    "/api/files/abc",
    "/api/export",
    "/api",
    "/api/",
    "/API/items",
    "//api/items",
    "/api/../api/items",
    "/assets/../api/items",
  ];
  const privatePaths = [
    "/cdn-cgi/access/logout",
    "/cdn-cgi/access/get-identity",
    "/cdn-cgi/trace",
    "/cdn-cgi",
  ];

  it.each([...apiPaths, ...privatePaths])("never touches %s (fetch and navigation)", (path) => {
    expect(strategyFor(req(path), ORIGIN)).toBe<SwStrategy>("passthrough");
    expect(strategyFor(req(path, { mode: "navigate" }), ORIGIN)).toBe<SwStrategy>("passthrough");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])(
    "passes %s through on any path",
    (method) => {
      for (const path of ["/", "/items/1", "/assets/index-abc.js", "/api/items", "/manifest.webmanifest"]) {
        expect(strategyFor(req(path, { method }), ORIGIN)).toBe("passthrough");
        expect(strategyFor(req(path, { method, mode: "navigate" }), ORIGIN)).toBe("passthrough");
      }
    },
  );

  it.each([
    "https://return.test/assets/index-abc.js",
    "https://evil.test/assets/index-abc.js",
    "http://app.return.test/assets/index-abc.js",
    "https://app.return.test:8443/assets/index-abc.js",
    "https://myteam.cloudflareaccess.com/cdn-cgi/access/login/app.return.test",
  ])("passes cross-origin %s through", (url) => {
    expect(strategyFor(req(url), ORIGIN)).toBe("passthrough");
    expect(strategyFor(req(url, { mode: "navigate" }), ORIGIN)).toBe("passthrough");
  });

  it("passes an unparsable URL through", () => {
    expect(strategyFor({ url: "not a url", method: "GET", mode: "cors" }, ORIGIN)).toBe("passthrough");
  });

  it.each([
    "/",
    "/items/abc",
    "/conversations",
    "/settings/system",
    "/tags/print",
    "/t/AAAA",
    "/some/unknown",
  ])("navigations to %s are network-first", (path) => {
    expect(strategyFor(req(path, { mode: "navigate" }), ORIGIN)).toBe("navigation");
  });

  it.each([
    "/assets/index-abc123.js",
    "/assets/index-abc123.css",
    "/icons/icon-192.png",
    "/manifest.webmanifest",
  ])("%s is cache-first", (path) => {
    expect(strategyFor(req(path), ORIGIN)).toBe("cache-first");
  });

  it.each([
    "/",
    "/sw.js",
    "/robots.txt",
    "/p/public.css",
    "/assets/",
    "/assets/a/b.js",
    "/icons/x/y.png",
    "/items/1",
  ])("other subresource %s is passthrough", (path) => {
    expect(strategyFor(req(path), ORIGIN)).toBe("passthrough");
  });
});

describe("isStorable", () => {
  it.each(["/", "/assets/index-abc.js", "/icons/icon-512.png", "/manifest.webmanifest", "/theme-init.js"])(
    "allows %s",
    (path) => {
      expect(isStorable(path)).toBe(true);
    },
  );

  it.each([
    "/api/items",
    "/api/system",
    "/cdn-cgi/access/logout",
    "/items/1",
    "/conversations/1",
    "/sw.js",
    "/assets/a/b.js",
    "//api/x",
  ])("refuses %s", (path) => {
    expect(isStorable(path)).toBe(false);
  });
});
