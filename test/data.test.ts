import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import type { Item, Tag } from "../src/shared/schemas";
import type { ExportDocument } from "../src/worker/db/export";
import { api, apiJson } from "./helpers/api";
import { PNG_BYTES, seedForeignOwner, upload } from "./helpers/files";

const FINDER_HASH = "a".repeat(64);

/** Builds a realistic account: nesting, replaced tag, recovery, conversation with every child row. */
async function seedAccount(): Promise<{ ownerId: string; tagTokens: string[] }> {
  const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
  const bag = await apiJson<Item>("POST", "/items", { name: "Suitcase", brand: "Samsonite" });
  const pouch = await apiJson<Item>("POST", "/items", { name: "Cable pouch", parentId: bag.id });
  const { tags } = await apiJson<{ tags: Tag[] }>("POST", "/tags", { itemId: bag.id, count: 2 });
  const { tag: replacement } = await apiJson<{ tag: Tag }>("POST", `/tags/${tags[0]?.id}/replace`);
  await apiJson("POST", "/trackers", { name: "AirTag", itemId: bag.id });
  await apiJson("POST", "/contacts", { name: "Ana", email: "ana@example.test", notify: true });
  const lost = await apiJson<{ id: string }>("POST", `/items/${pouch.id}/lost`, { lostPlace: "Airport" });
  await apiJson("PATCH", `/recoveries/${lost.id}`, { status: "found", notes: "A cafe has it" });
  await apiJson("PUT", "/settings", { identity: { publicName: "Lena" }, tags: { labelPrefix: "RT-" } });
  const photo = await upload({ itemId: bag.id, kind: "photo", bytes: PNG_BYTES, filename: "bag.png" });
  expect(photo.status).toBe(201);
  const t = "2026-05-01T10:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO blocks (id, owner_id, ip_hmac, reason, expires_at, created_at) VALUES ('block-1', ?1, 'hmac-spammer', 'spam', NULL, ?2), ('block-2', ?1, 'hmac-timed', NULL, '2099-01-01T00:00:00.000Z', ?2)",
    ).bind(ownerId, t),
    env.DB.prepare(
      `INSERT INTO conversations (id, owner_id, item_id, tag_id, finder_token_hash, finder_name, subject, last_message_at, created_at)
       VALUES ('conv-1', ?1, ?2, ?3, ?4, 'Finder', 'Found your suitcase', ?5, ?5)`,
    ).bind(ownerId, bag.id, tags[1]?.id, FINDER_HASH, t),
    env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('msg-1', 'conv-1', 'finder', 'Hello, I have it', ?)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO shared_locations (id, conversation_id, shared_by, source, label, lat, lng, created_at) VALUES ('loc-1', 'conv-1', 'finder', 'gps', 'Cafe', 38.7223, -9.1393, ?)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO proposals (id, conversation_id, proposed_by, kind, place, created_at) VALUES ('prop-1', 'conv-1', 'finder', 'hotel_reception', 'Hotel Lisboa', ?)",
    ).bind(t),
  ]);
  return {
    ownerId,
    tagTokens: [...tags.map((x) => x.token), replacement.token],
  };
}

const exportAs = async (): Promise<ExportDocument> => (await api("GET", "/data/export")).json();
const importBody = (data: unknown) => ({ confirm: "RESTORE", data });

/** Simulates losing the database: the owner and (by cascade) all of its rows disappear. */
async function wipeOwner(): Promise<string> {
  const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
  await env.DB.prepare("DELETE FROM owners WHERE id = ?").bind(ownerId).run();
  return ownerId;
}

let original: ExportDocument;
let seeded: { ownerId: string; tagTokens: string[] };

beforeAll(async () => {
  await seedForeignOwner();
  seeded = await seedAccount();
  original = await exportAs();
});

describe("data export and restore", () => {
  it("exports everything the owner needs to restore, and nothing of other owners", async () => {
    const res = await api("GET", "/data/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename="return-export-\d{4}-\d{2}-\d{2}\.json"/,
    );
    const doc = (await res.json()) as ExportDocument;
    expect(doc).toMatchObject({
      format: "return-export",
      version: 1,
      owner: { email: "owner@example.test" },
    });
    expect(doc.settings.identity.publicName).toBe("Lena");
    expect(doc.items.map((i) => i.name).sort()).toEqual(["Cable pouch", "Suitcase"]);
    expect(doc.tags.map((t) => t.token).sort()).toEqual([...seeded.tagTokens].sort());
    expect(doc.files).toHaveLength(1);
    expect(JSON.stringify(doc.files)).not.toContain("iVBOR");
    expect(doc.conversations).toHaveLength(1);
    expect(doc.conversations[0]?.conversation.finder_token_hash).toBe(FINDER_HASH);
    expect(doc.conversations[0]?.messages.map((m) => m.id)).toEqual(["msg-1"]);
    expect(doc.sharedLocations.map((l) => l.id)).toEqual(["loc-1"]);
    expect(doc.proposals.map((p) => p.id)).toEqual(["prop-1"]);
    expect(doc.trackers).toHaveLength(1);
    expect(doc.trustedContacts).toHaveLength(1);
    expect(doc.recoveries).toHaveLength(1);
    expect(JSON.stringify(doc)).not.toContain("foreign");
    expect(doc.items.every((i) => !("owner_id" in i))).toBe(true);
    const { events } = await apiJson<{ events: { type: string }[] }>("GET", "/activity");
    expect(events.map((e) => e.type)).toContain("data.exported");
  });

  it("refuses to restore into an account that already has items", async () => {
    const res = await api("POST", "/data/import", importBody(original));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("not_empty");
  });

  it("validates the request: confirmation, format and version", async () => {
    await wipeOwner();
    const post = (body: unknown) => api("POST", "/data/import", body as Record<string, unknown>);
    expect((await post({ data: original })).status).toBe(422);
    expect((await post({ confirm: "yes", data: original })).status).toBe(422);
    expect((await post(importBody({ ...original, format: "other" }))).status).toBe(422);
    expect((await post(importBody({ ...original, version: 2 }))).status).toBe(422);
    const { items: _items, ...withoutItems } = original;
    expect((await post(importBody(withoutItems))).status).toBe(422);
  });

  it("rolls back completely when the database rejects a row, settings included", async () => {
    await wipeOwner();
    const [first, ...rest] = original.tags;
    // Two tags with the same sequence number pass validation but violate UNIQUE(owner_id, seq).
    const broken = {
      ...original,
      tags: [first, ...rest, { ...first, id: "dup-tag", token: "abcdefghjkmnpqrstvwxyz0123" }],
    };
    const res = await api("POST", "/data/import", importBody(broken));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("import_failed");
    const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
    const counts = await env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM items WHERE owner_id = ?1) + (SELECT COUNT(*) FROM tags WHERE owner_id = ?1)
              + (SELECT COUNT(*) FROM settings WHERE owner_id = ?1) AS n`,
    )
      .bind(ownerId)
      .first<{ n: number }>();
    expect(counts?.n).toBe(0);
  });

  describe("hostile export files", () => {
    const attack = async (mutate: (doc: ExportDocument) => void, expected = 422, code?: string) => {
      await wipeOwner();
      const doc = structuredClone(original);
      mutate(doc);
      const res = await api("POST", "/data/import", importBody(doc));
      expect(res.status).toBe(expected);
      if (code) expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
      const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
      const n = await env.DB.prepare(
        "SELECT (SELECT COUNT(*) FROM items WHERE owner_id = ?1) + (SELECT COUNT(*) FROM tags WHERE owner_id = ?1) + (SELECT COUNT(*) FROM settings WHERE owner_id = ?1) AS n",
      )
        .bind(ownerId)
        .first<{ n: number }>();
      expect(n?.n, "nothing may be written").toBe(0);
    };

    it("rejects blocks and recovery events that are malformed or point nowhere", async () => {
      await attack((doc) => {
        doc.blocks[0] = { ...doc.blocks[0], ip_hmac: "" };
      }, 422);
      await attack((doc) => {
        doc.blocks[0] = { ...doc.blocks[0], expires_at: "tomorrow" };
      }, 422);
      await attack(
        (doc) => {
          doc.recoveryEvents[0] = { ...doc.recoveryEvents[0], recovery_id: "nowhere" };
        },
        422,
        "invalid_reference",
      );
      await attack((doc) => {
        doc.recoveryEvents[0] = { ...doc.recoveryEvents[0], status: "teleported" };
      }, 422);
    });

    it("rejects a file row pointing at another key (e.g. someone's backup)", () =>
      attack(
        (doc) => {
          doc.files[0] = { ...doc.files[0], r2_key: "backups/victim/2026-01-01.json" };
        },
        422,
        "invalid_file_key",
      ));

    it("rejects file content types outside the upload allow-list", () =>
      attack((doc) => {
        doc.files[0] = { ...doc.files[0], content_type: "text/html" };
      }));

    it("rejects messages, locations and proposals that point at a foreign conversation", async () => {
      await attack((doc) => {
        const first = doc.conversations[0];
        if (first) first.messages[0] = { ...first.messages[0], conversation_id: "foreign-conv" };
      });
      await attack((doc) => {
        doc.sharedLocations[0] = { ...doc.sharedLocations[0], conversation_id: "foreign-conv" };
      });
      await attack((doc) => {
        doc.proposals[0] = { ...doc.proposals[0], conversation_id: "foreign-conv" };
      });
    });

    it("rejects references to rows that are not part of the export", async () => {
      for (const [table, column] of [
        ["items", "parent_id"],
        ["items", "public_photo_id"],
        ["tags", "item_id"],
        ["tags", "replaced_by"],
        ["trackers", "item_id"],
        ["recoveries", "item_id"],
        ["files", "item_id"],
      ] as const) {
        await attack(
          (doc) => {
            const rows = doc[table];
            rows[0] = { ...rows[0], [column]: "foreign-item" };
          },
          422,
          "invalid_reference",
        );
      }
      for (const column of ["item_id", "tag_id", "recovery_id"]) {
        await attack(
          (doc) => {
            const first = doc.conversations[0];
            if (first) first.conversation = { ...first.conversation, [column]: "foreign-item" };
          },
          422,
          "invalid_reference",
        );
      }
    });

    it("rejects malformed contact_visibility, enums and timestamps", async () => {
      await attack((doc) => {
        doc.items[0] = { ...doc.items[0], contact_visibility: "not-json" };
      });
      await attack((doc) => {
        doc.items[0] = { ...doc.items[0], category: "spaceship" };
      });
      await attack((doc) => {
        doc.items[0] = { ...doc.items[0], created_at: "yesterday" };
      });
      await attack((doc) => {
        doc.tags[0] = { ...doc.tags[0], status: "zombie" };
      });
    });

    it("answers 409 when an id, tag token or finder hash already exists", async () => {
      await attack(
        (doc) => {
          doc.items[0] = { ...doc.items[0], id: "foreign-item" };
          for (const row of [...doc.files, ...doc.tags, ...doc.trackers, ...doc.recoveries]) {
            if (row.item_id === original.items[0]?.id) row.item_id = "foreign-item";
          }
          for (const item of doc.items)
            if (item.parent_id === original.items[0]?.id) item.parent_id = "foreign-item";
          for (const c of doc.conversations)
            if (c.conversation.item_id === original.items[0]?.id) c.conversation.item_id = "foreign-item";
          doc.files = doc.files.map((f) => ({ ...f, r2_key: `owners/x/items/${f.item_id}/${f.id}` }));
        },
        409,
        "id_conflict",
      );
      await attack(
        (doc) => {
          doc.tags[0] = { ...doc.tags[0], token: "zzzzzzzzzzzzzzzzzzzzzzzzzz" };
        },
        409,
        "id_conflict",
      );
    });
  });

  it("rewrites canonical file keys to the restoring owner", async () => {
    await wipeOwner();
    expect((await api("POST", "/data/import", importBody(original))).status).toBe(200);
    const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
    const file = await env.DB.prepare("SELECT id, item_id, r2_key FROM item_files WHERE owner_id = ?")
      .bind(ownerId)
      .first<{ id: string; item_id: string; r2_key: string }>();
    expect(file?.r2_key).toBe(`owners/${ownerId}/items/${file?.item_id}/${file?.id}`);
  });

  it("refuses a restore when only a contact, tracker or conversation exists", async () => {
    await wipeOwner();
    await apiJson("POST", "/contacts", { name: "Only a contact" });
    expect((await api("POST", "/data/import", importBody(original))).status).toBe(409);
    await wipeOwner();
    await apiJson("POST", "/trackers", { name: "Only a tracker" });
    expect((await api("POST", "/data/import", importBody(original))).status).toBe(409);
  });

  it("restores into a fresh owner keeping ids, tag tokens and finder links", async () => {
    const oldOwnerId = await wipeOwner();
    const res = await api("POST", "/data/import", importBody(original));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      imported: {
        items: 2,
        files: 1,
        tags: 3,
        trackers: 1,
        recoveries: 1,
        recoveryEvents: 2,
        blocks: 2,
        trustedContacts: 1,
        conversations: 1,
        messages: 1,
        sharedLocations: 1,
        proposals: 1,
      },
      // File bytes are not in the export: the restored row points at a key that holds nothing.
      filesChecked: 1,
      missingFiles: [{ id: original.files[0]?.id, itemId: original.files[0]?.item_id, filename: "bag.png" }],
    });

    const restored = await exportAs();
    expect(restored.settings).toEqual(original.settings);
    for (const key of [
      "items",
      "tags",
      "trackers",
      "recoveries",
      "recoveryEvents",
      "blocks",
      "trustedContacts",
      "sharedLocations",
      "proposals",
      "conversations",
    ] as const) {
      expect(restored[key], key).toEqual(original[key]);
    }
    const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
    expect(ownerId).not.toBe(oldOwnerId);
    const owned = await env.DB.prepare("SELECT owner_id FROM conversations WHERE id = 'conv-1'").first<{
      owner_id: string;
    }>();
    expect(owned?.owner_id).toBe(ownerId);

    const { tags } = await apiJson<{ tags: Tag[] }>("GET", "/tags");
    expect(tags.some((t) => t.status === "revoked" && t.replacedBy !== null)).toBe(true);
    const suitcase = restored.items.find((i) => i.name === "Suitcase");
    expect(restored.items.find((i) => i.name === "Cable pouch")?.parent_id).toBe(suitcase?.id);
    const { events } = await apiJson<{ events: { type: string }[] }>("GET", "/activity");
    expect(events.map((e) => e.type)).toContain("data.imported");
    expect((await api("POST", "/data/import", importBody(original))).status).toBe(409);
  });

  it("restores older exports that have no blocks or recovery events, and sees files that survived", async () => {
    const oldOwnerId = await wipeOwner();
    const legacy = structuredClone(original) as Partial<ExportDocument>;
    delete legacy.blocks;
    delete legacy.recoveryEvents;
    const file = original.files[0];
    const { ownerId } = await apiJson<{ ownerId: string }>("GET", "/me");
    await env.FILES.put(`owners/${ownerId}/items/${file?.item_id}/${file?.id}`, PNG_BYTES);
    const res = await api("POST", "/data/import", importBody(legacy));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      imported: { blocks: 0, recoveryEvents: 0 },
      filesChecked: 1,
      missingFiles: [],
    });
    expect(ownerId).not.toBe(oldOwnerId);
  });

  it("leaves notification and activity history out of the export", async () => {
    const doc = (await exportAs()) as unknown as Record<string, unknown>;
    expect(Object.keys(doc)).not.toContain("notifications");
    expect(Object.keys(doc)).not.toContain("activity");
    expect(JSON.stringify(doc)).not.toContain("foreign-event");
  });

  it("also refuses a restore when only a tag exists", async () => {
    await wipeOwner();
    await apiJson("POST", "/tags", { count: 1 });
    expect((await api("POST", "/data/import", importBody(original))).status).toBe(409);
  });
});
