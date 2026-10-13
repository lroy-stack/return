import { expect, horizontalOverflow, requireTurnstileNetwork, test, unique } from "./fixtures";

/**
 * Scenario 8. A phone must never need sideways scrolling, even with long unbroken text
 * (URLs, serial-like strings) in the data.
 */

const LONG_WORD = "Supercalifragilisticexpialidocious".repeat(6);

test("8a. the inventory fits the viewport width, including items with very long names", async ({
  page,
  owner,
}) => {
  await owner.createItem({
    name: `${unique("Inv")}-${LONG_WORD}`.slice(0, 120),
    brand: LONG_WORD.slice(0, 80),
  });
  const shortName = unique("Short name");
  await owner.createItem({ name: shortName });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(shortName) })).toBeVisible();

  const { scrollWidth, innerWidth, viewportWidth } = await horizontalOverflow(page);
  expect(scrollWidth, "inventory scrollWidth").toBeLessThanOrEqual(innerWidth);
  expect(scrollWidth, "inventory scrollWidth vs device width").toBeLessThanOrEqual(viewportWidth);
});

test("8b. the tag page fits the viewport width with an ordinary public title and note", async ({
  page,
  owner,
}) => {
  const item = await owner.createItem({
    name: unique("Layout item"),
    publicTitle: "Blue Osprey backpack with a red strap and a torn side pocket",
    publicMessage: "Please call the front desk of the hotel and ask for the owner of room 214 before noon.",
  });
  const tag = await owner.createTag(item.id);

  await page.goto(tag.url);
  await expect(page.getByRole("heading", { name: "Write to the owner" })).toBeVisible();

  const { scrollWidth, innerWidth, viewportWidth } = await horizontalOverflow(page);
  expect(scrollWidth, "tag page scrollWidth").toBeLessThanOrEqual(innerWidth);
  expect(scrollWidth, "tag page scrollWidth vs device width").toBeLessThanOrEqual(viewportWidth);
});

// Regression: a long unbroken URL in the owner's public message used to widen the tag page on phones.
test("8b2. the tag page does not scroll sideways when the owner note contains a long URL", async ({
  page,
  owner,
}) => {
  const item = await owner.createItem({
    name: unique("Layout item"),
    publicTitle: "Blue backpack",
    publicMessage: `Details: https://example.com/lost-and-found/${LONG_WORD}`.slice(0, 600),
  });
  const tag = await owner.createTag(item.id);

  await page.goto(tag.url);
  await expect(page.getByRole("heading", { name: "Write to the owner" })).toBeVisible();

  const { scrollWidth, viewportWidth } = await horizontalOverflow(page);
  expect(scrollWidth, "tag page scrollWidth vs device width").toBeLessThanOrEqual(viewportWidth);
});

test("8b3. the tag page does not scroll sideways when the public title is one very long word", async ({
  page,
  owner,
}) => {
  const item = await owner.createItem({ name: unique("Layout item"), publicTitle: LONG_WORD.slice(0, 120) });
  const tag = await owner.createTag(item.id);

  await page.goto(tag.url);
  await expect(page.getByRole("heading", { name: "Write to the owner" })).toBeVisible();

  const { scrollWidth, viewportWidth } = await horizontalOverflow(page);
  expect(scrollWidth, "tag page scrollWidth vs device width").toBeLessThanOrEqual(viewportWidth);
});

test("8c. the conversation page fits the viewport width, including a long unbroken message", async ({
  page,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  const marker = unique("Layout");
  const conversation = await startConversation(
    tagged,
    `${marker} https://example.com/${LONG_WORD}${LONG_WORD}`,
  );

  await page.goto(conversation.path);
  await expect(page.getByText(marker)).toBeVisible();

  const { scrollWidth, innerWidth, viewportWidth } = await horizontalOverflow(page);
  expect(scrollWidth, "conversation page scrollWidth").toBeLessThanOrEqual(innerWidth);
  expect(scrollWidth, "conversation page scrollWidth vs device width").toBeLessThanOrEqual(viewportWidth);
});
