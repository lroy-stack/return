import { expect, newFinderContext, test, unique } from "./fixtures";

/** Scenario 6. Marking an item lost is visible to finders immediately, and undoing it removes the banner. */

test("6. marking an item lost shows the lost banner on its tag page; marking it recovered removes it", async ({
  page: ownerPage,
  browser,
  owner,
}) => {
  const reward = `Reward ${unique("R")}: dinner for two`;
  const item = await owner.createItem({
    name: unique("Lost-state item"),
    publicTitle: unique("Camera bag"),
    rewardText: reward,
  });
  const tag = await owner.createTag(item.id);
  const finderContext = await newFinderContext(browser);
  const finder = await finderContext.newPage();
  const banner = finder.getByText("Reported lost");

  // Before: an ordinary tag page.
  await finder.goto(tag.url);
  await expect(banner).toHaveCount(0);
  await expect(finder.getByText(reward)).toHaveCount(0);

  // The owner marks it lost in the panel.
  await ownerPage.goto(`/items/${item.id}`);
  await expect(ownerPage.getByText("With you")).toBeVisible();
  await ownerPage.getByRole("button", { name: "Mark as lost" }).click();
  const lostDialog = ownerPage.getByRole("dialog", { name: /^Mark .* as lost$/ });
  await lostDialog.getByLabel("Where?").fill("Gate B12, Lisbon airport");
  await lostDialog.getByRole("button", { name: "Mark as lost" }).click();
  await expect(ownerPage.getByText("This item is marked as lost.")).toBeVisible();
  // "Lost" also appears elsewhere (attention strip, filters): scope to the item's own header.
  const statusPill = ownerPage
    .locator("#main header")
    .filter({ has: ownerPage.getByRole("heading", { level: 1 }) })
    .getByText("Lost", { exact: true });
  await expect(statusPill).toBeVisible();

  // Finders now see the banner, the default lost message and the reward.
  await finder.reload();
  await expect(banner).toBeVisible();
  await expect(finder.getByText("The owner is looking for this item right now")).toBeVisible();
  await expect(finder.getByText(reward)).toBeVisible();

  // The owner marks it recovered.
  await ownerPage.getByRole("button", { name: "Mark as recovered" }).click();
  await ownerPage
    .getByRole("dialog", { name: "Mark as recovered" })
    .getByRole("button", { name: "Mark as recovered" })
    .click();
  await expect(ownerPage.getByText("This item is marked as lost.")).toHaveCount(0);
  await expect(ownerPage.getByText("With you")).toBeVisible();
  await expect(statusPill).toHaveCount(0);

  // The banner is gone again, and so is the reward.
  await finder.reload();
  await expect(finder.getByRole("heading", { name: "Write to the owner" })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await expect(finder.getByText(reward)).toHaveCount(0);
  await finderContext.close();
});
