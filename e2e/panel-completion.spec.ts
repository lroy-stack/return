/**
 * Phase 3 panel flows: blocks with a duration, the blocked list, retiring a tag, thank & close after a recovery,
 * the unsaved-changes guard and inventory filters in the URL.
 */
import { chooseOption, expect, requireTurnstileNetwork, test, unique } from "./fixtures";

test("blocking a finder sends a duration, lists it in Settings and unblocking clears it", async ({
  page,
  owner,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  const conversation = await startConversation(tagged);
  await page.goto(`/conversations/${conversation.id}`);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Block finder" }).click();
  const dialog = page.getByRole("dialog", { name: "Block this finder?" });
  await chooseOption(dialog, "Block for", "7 days");
  await dialog.getByLabel(/^Reason/).fill("Rude");
  await dialog.getByRole("button", { name: "Block finder" }).click();
  await expect(page.getByText("This finder is blocked.")).toBeVisible();
  expect((await owner.conversation(conversation.id)).conversation.status).toBe("blocked");

  await page.goto("/settings/privacy");
  const row = page.getByRole("listitem").filter({ hasText: "Rude" });
  await expect(row).toContainText("Until");
  await row.getByRole("button", { name: "Unblock" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Rude" })).toHaveCount(0);
  expect((await owner.conversation(conversation.id)).conversation.status).toBe("closed");
});

test("revoking a tag warns that the card stops working and counts open conversations", async ({
  page,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  await startConversation(tagged);
  await page.goto("/tags");
  await page
    .getByRole("button", { name: new RegExp(tagged.tag.label) })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: new RegExp(tagged.tag.label) });
  await sheet.getByRole("button", { name: "Revoke" }).click();
  const confirm = page.getByRole("dialog", { name: "Revoke this tag?" });
  await expect(confirm).toContainText("printed card or NFC chip stops working");
  await expect(confirm).toContainText("1 conversation started from this tag stays open");
});

test("recovering an item offers to close its open conversations", async ({
  page,
  owner,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  const conversation = await startConversation(tagged);
  await owner.markLost(tagged.item.id);
  await page.goto(`/items/${tagged.item.id}`);
  await page.getByRole("button", { name: "Mark as recovered" }).first().click();
  await page
    .getByRole("dialog", { name: "Mark as recovered" })
    .getByRole("button", { name: "Mark as recovered" })
    .click();
  const thanks = page.getByRole("dialog", { name: "Thank the finder, then close" });
  await expect(thanks).toBeVisible();
  await thanks.getByRole("button", { name: "Close conversation" }).click();
  await expect(thanks).toBeHidden();
  expect((await owner.conversation(conversation.id)).conversation.status).toBe("closed");
  const detail = await owner.item(tagged.item.id);
  expect(detail.recoveryEvents.map((e) => e.status)).toEqual(["lost", "recovered"]);
});

test("a sheet with unsaved changes asks before it closes", async ({ page, owner }) => {
  const item = await owner.createItem({ name: unique("Guard") });
  await page.goto(`/items/${item.id}`);
  await page.getByRole("button", { name: "Item actions", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Edit item/ }).click();
  const sheet = page.getByRole("dialog", { name: "Edit item" });
  await sheet.getByLabel(/^Name\b/).fill("Changed");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  const ask = page.getByRole("dialog", { name: "Discard your changes?" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Keep editing" }).click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await ask.getByRole("button", { name: "Discard" }).click();
  await expect(sheet).toBeHidden();
  expect((await owner.item(item.id)).item.name).toBe(item.name);
});

test("inventory filters live in the URL", async ({ page, owner }) => {
  const item = await owner.createItem({ name: unique("Filterable") });
  await page.goto("/?status=lost&archived=1");
  await expect(page.getByRole("button", { name: "Archived" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/");
  await page.getByRole("searchbox").fill(item.name);
  await expect(page).toHaveURL(new RegExp(`q=${item.name}`));
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue(item.name);
  await expect(page.getByRole("link", { name: new RegExp(item.name) })).toBeVisible();
});

test("a failed owner email shows a persistent banner and the test email reports its code", async ({
  page,
}) => {
  // Local email always succeeds, so the failure comes from the API contract itself (alerts + TestEmailResult).
  await page.route("**/api/alerts", (route) =>
    route.fulfill({
      json: {
        alerts: [
          {
            kind: "owner_email_failed",
            code: "sender_not_verified",
            message: "The sending domain is not onboarded in Cloudflare Email Sending.",
            since: "2026-10-12T08:00:00.000Z",
          },
        ],
      },
    }),
  );
  await page.route("**/api/settings/test-email", (route) =>
    route.fulfill({
      json: { ok: false, code: "rate_limited", message: "Cloudflare's sending limit was reached." },
    }),
  );
  await page.goto("/");
  const banner = page.getByRole("region", { name: "Alerts" });
  await expect(banner).toContainText("Email to you is failing");
  await expect(banner).toContainText("sending domain is not set up in Cloudflare Email Sending");

  await page.goto("/settings/notifications");
  await page.getByRole("button", { name: "Send test email" }).click();
  await expect(page.getByText("Cloudflare's sending limit was reached. Try again later.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Alerts" })).toBeVisible();
});
