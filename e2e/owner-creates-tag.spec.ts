import { expect, newFinderContext, test, unique } from "./fixtures";

/**
 * Scenario 1. The owner builds an item and a tag in the panel; the finder page built from it shows
 * only what the owner chose to publish.
 */
test("1. owner creates an item and a tag in the panel; the tag page exposes only the public title", async ({
  page,
  browser,
}) => {
  const mark = unique("Panel");
  const privateValues = {
    name: `Hidden name ${mark}`,
    brand: `Brandx${mark}`,
    model: `Modelx${mark}`,
    serial: `SERIAL-${mark}`,
    notes: `Private note ${mark}: passport is in the lining`,
  };
  const publicTitle = `Green rucksack ${mark}`;

  // Create the item through the form.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
  await page.getByRole("button", { name: "Add item" }).first().click();
  const createDialog = page.getByRole("dialog", { name: "Add item" });
  await createDialog.getByLabel(/^Name\b/).fill(privateValues.name);
  await createDialog.getByLabel("Brand").fill(privateValues.brand);
  await createDialog.getByLabel("Model").fill(privateValues.model);
  await createDialog.getByText("Private details").click();
  await createDialog.getByLabel("Serial number").fill(privateValues.serial);
  await createDialog.getByLabel("Private notes").fill(privateValues.notes);
  await createDialog.getByRole("button", { name: "Add item" }).click();

  // The item page opens; give it a public title.
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: privateValues.name })).toBeVisible();
  await page
    .getByRole("region", { name: "Public page for this item" })
    .getByRole("button", { name: "Edit" })
    .click();
  const publicDialog = page.getByRole("dialog", { name: "Public page for this item" });
  await publicDialog.getByLabel("Public title").fill(publicTitle);
  await publicDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("region", { name: "Public page for this item" })).toContainText(publicTitle);

  // Create the tag from the item page and read its URL from the tag sheet.
  const tags = page.getByRole("region", { name: "Tags", exact: true });
  await tags.getByRole("button", { name: "Add tag" }).click();
  await tags.getByRole("listitem").getByRole("button").click();
  const tagDialog = page.getByRole("dialog", { name: /^Tag / });
  const tagUrl = await tagDialog.getByLabel("Tag URL").inputValue();
  expect(tagUrl).toMatch(/^http:\/\/localhost:5199\/t\/[0-9a-z]{26}$/);

  // The finder (a different browser, no cookies) sees the public title only.
  const finderContext = await newFinderContext(browser);
  const finder = await finderContext.newPage();
  const response = await finder.goto(tagUrl);
  expect(response?.status()).toBe(200);
  await expect(finder.getByRole("heading", { level: 1, name: publicTitle })).toBeVisible();
  await expect(finder.getByRole("heading", { name: "Write to the owner" })).toBeVisible();

  const html = await finder.content();
  const body = await finder.locator("body").innerText();
  for (const [field, value] of Object.entries(privateValues)) {
    expect(html, `${field} must not appear in the page source`).not.toContain(value);
    expect(body, `${field} must not appear in the rendered text`).not.toContain(value);
  }
  expect(await response?.text()).not.toContain(privateValues.serial);
  await finderContext.close();
});
