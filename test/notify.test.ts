import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/shared/settings";
import { saveSettings } from "../src/worker/db/settings";
import { notifyOwner } from "../src/worker/services/notify";

const OWNER = "notify-owner";

async function seed(trustedContacts: number) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM owners WHERE id = ?").bind(OWNER),
    env.DB.prepare(
      "INSERT INTO owners (id, email, created_at) VALUES (?, 'n@example.test', '2026-01-01')",
    ).bind(OWNER),
    ...Array.from({ length: trustedContacts }, (_, i) =>
      env.DB.prepare(
        `INSERT INTO trusted_contacts (id, owner_id, name, email, notify, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, '2026-01-01', '2026-01-01')`,
      ).bind(`tc-${i}`, OWNER, `Contact ${i}`, `c${i}@example.test`),
    ),
  ]);
  await saveSettings(env.DB, OWNER, {
    ...DEFAULT_SETTINGS,
    notifications: { ...DEFAULT_SETTINGS.notifications, emailAddress: "owner@example.test" },
  });
}

async function sentCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE owner_id = ? AND status = 'sent'",
  )
    .bind(OWNER)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("owner notifications", () => {
  beforeEach(() => {
    vi.spyOn(env.EMAIL, "send").mockResolvedValue({ messageId: "test" } as never);
  });

  it("alerts the owner and trusted contacts on first contact", async () => {
    await seed(2);
    await notifyOwner(env, OWNER, { kind: "new_conversation", itemName: "Backpack", preview: "Found it" });
    expect(await sentCount()).toBe(3);
  });

  it("applies the hourly cap to every email, including trusted-contact alerts", async () => {
    await seed(5);
    const now = new Date().toISOString();
    await env.DB.batch(
      Array.from({ length: 28 }, (_, i) =>
        env.DB.prepare(
          `INSERT INTO notifications (id, owner_id, channel, kind, recipient, status, created_at)
           VALUES (?, ?, 'email', 'owner.new_message', 'x@example.test', 'sent', ?)`,
        ).bind(`cap-${i}`, OWNER, now),
      ),
    );
    await notifyOwner(env, OWNER, { kind: "new_conversation", itemName: "Backpack", preview: "Found it" });
    expect(await sentCount()).toBe(30);
  });

  it("stores the failure and does not throw when delivery fails", async () => {
    await seed(0);
    vi.spyOn(env.EMAIL, "send").mockRejectedValue(new Error("smtp down"));
    await expect(
      notifyOwner(env, OWNER, { kind: "new_conversation", itemName: "Backpack", preview: "Found it" }),
    ).resolves.toBeUndefined();
    const row = await env.DB.prepare("SELECT status, error FROM notifications WHERE owner_id = ?")
      .bind(OWNER)
      .first<{ status: string; error: string }>();
    expect(row).toMatchObject({ status: "failed" });
    expect(row?.error).toContain("smtp down");
  });
});
