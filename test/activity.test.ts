import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { ActivityEvent } from "../src/shared/schemas";
import { api, apiJson } from "./helpers/api";
import { seedForeignOwner } from "./helpers/files";

type Page = { events: ActivityEvent[]; nextBefore: string | null };

beforeAll(async () => {
  await apiJson("GET", "/me");
  const owner = await env.DB.prepare("SELECT id FROM owners WHERE email = 'owner@example.test'").first<{
    id: string;
  }>();
  const statements = Array.from({ length: 5 }, (_, i) =>
    env.DB.prepare(
      "INSERT INTO activity_events (id, owner_id, type, data, created_at) VALUES (?, ?, 'item.created', ?, ?)",
    ).bind(`ev-${i}`, owner?.id, i === 0 ? '{"name":"Laptop"}' : null, `2026-02-0${i + 1}T10:00:00.000Z`),
  );
  await env.DB.batch(statements);
  await seedForeignOwner();
});

describe("activity", () => {
  it("returns newest first with parsed data", async () => {
    const page = await apiJson<Page>("GET", "/activity");
    expect(page.events.map((e) => e.id)).toEqual(["ev-4", "ev-3", "ev-2", "ev-1", "ev-0"]);
    expect(page.events[4]?.data).toEqual({ name: "Laptop" });
    expect(page.events[0]?.data).toBeNull();
    expect(page.nextBefore).toBeNull();
  });

  it("paginates with limit and before", async () => {
    const first = await apiJson<Page>("GET", "/activity?limit=2");
    expect(first.events.map((e) => e.id)).toEqual(["ev-4", "ev-3"]);
    expect(first.nextBefore).toEqual(expect.any(String));
    const second = await apiJson<Page>("GET", `/activity?limit=2&before=${first.nextBefore}`);
    expect(second.events.map((e) => e.id)).toEqual(["ev-2", "ev-1"]);
    const third = await apiJson<Page>("GET", `/activity?limit=2&before=${second.nextBefore}`);
    expect(third.events.map((e) => e.id)).toEqual(["ev-0"]);
    expect(third.nextBefore).toBeNull();
  });

  it("validates limit and before", async () => {
    for (const query of ["limit=0", "limit=101", "limit=abc", "before=yesterday", "before=!!!"]) {
      expect((await api("GET", `/activity?${query}`)).status, query).toBe(422);
    }
    expect((await apiJson<Page>("GET", "/activity?limit=100")).events.length).toBeGreaterThan(0);
  });

  it("never includes another owner's events", async () => {
    const page = await apiJson<Page>("GET", "/activity?limit=100");
    expect(page.events.map((e) => e.id)).not.toContain("foreign-event");
  });

  it("pages through 60 events that share one timestamp without loss or duplicates", async () => {
    const owner = await env.DB.prepare("SELECT id FROM owners WHERE email = 'owner@example.test'").first<{
      id: string;
    }>();
    const t = "2026-09-01T00:00:00.000Z";
    await env.DB.batch(
      Array.from({ length: 60 }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO activity_events (id, owner_id, type, created_at) VALUES (?, ?, 'item.updated', ?)",
        ).bind(`same-${String(i).padStart(2, "0")}`, owner?.id, t),
      ),
    );
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: Page = await apiJson<Page>(
        "GET",
        `/activity?limit=25${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`,
      );
      seen.push(...page.events.map((e) => e.id));
      cursor = page.nextBefore;
      if (!cursor) break;
    }
    const same = seen.filter((id) => id.startsWith("same-"));
    expect(same).toHaveLength(60);
    expect(new Set(seen).size).toBe(seen.length);
    expect(same).toEqual([...same].sort().reverse());
  });
});
