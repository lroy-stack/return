import type { Page } from "@playwright/test";
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

/**
 * Scenario 13. Tablet (768) and small laptop (1024) widths: every panel screen fits the width, and the
 * chrome matches the layout (nav rail from 640 px, sidebar from 1024 px, never the phone tab bar).
 * Viewport-specific tests inside the existing projects, so they also run with touch emulation.
 */
const PANEL_WIDTHS = [
  { width: 768, height: 1024, chrome: "rail" },
  { width: 1024, height: 768, chrome: "sidebar" },
] as const;

interface NavFacts {
  inAside: boolean;
  visible: boolean;
}

async function mainNavs(page: Page): Promise<NavFacts[]> {
  return page
    .locator('nav[aria-label="Main"]')
    .evaluateAll((navs) =>
      navs.map((n) => ({ inAside: n.closest("aside") !== null, visible: n.checkVisibility() })),
    );
}

async function expectFits(page: Page, what: string) {
  const { scrollWidth, innerWidth, viewportWidth } = await horizontalOverflow(page);
  expect(scrollWidth, `${what} scrollWidth vs window`).toBeLessThanOrEqual(innerWidth);
  expect(scrollWidth, `${what} scrollWidth vs viewport`).toBeLessThanOrEqual(viewportWidth);
}

for (const { width, height, chrome } of PANEL_WIDTHS) {
  test.describe(`panel at ${width} px`, () => {
    test.use({ viewport: { width, height } });

    test(`13a. ${width}: the ${chrome} is the only navigation shown, the phone tab bar is not`, async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();

      const shown = (await mainNavs(page)).filter((n) => n.visible);
      expect(shown, "exactly one visible main navigation").toHaveLength(1);
      expect(shown[0]?.inAside, "it is a side panel, not the bottom tab bar").toBe(true);
      // Rail: icon-only create button; sidebar: the labelled "New" button.
      const rail = page.getByRole("button", { name: "Create something new" });
      const sidebar = page.getByRole("button", { name: "New", exact: true });
      await expect(chrome === "rail" ? rail : sidebar).toBeVisible();
      await expect(chrome === "rail" ? sidebar : rail).toHaveCount(0);
      const box = await page.getByRole("navigation", { name: "Main" }).boundingBox();
      expect(box?.x ?? Number.POSITIVE_INFINITY, "the panel sits at the left edge").toBeLessThan(40);
    });

    for (const screen of ["inventory", "item", "inbox", "tags", "settings"] as const) {
      test(`13b. ${width}: ${screen} does not scroll sideways`, async ({ page, owner }) => {
        const item = await owner.createItem({
          name: `${unique("Tablet")}-${LONG_WORD}`.slice(0, 120),
          brand: LONG_WORD.slice(0, 80),
          publicTitle: LONG_WORD.slice(0, 120),
          privateNotes: `Notes ${LONG_WORD}${LONG_WORD}`,
        });
        await owner.createTag(item.id);
        const target = {
          inventory: { path: "/", heading: "Inventory" },
          item: { path: `/items/${item.id}`, heading: item.name },
          inbox: { path: "/conversations", heading: "Inbox" },
          tags: { path: "/tags", heading: "Tags" },
          settings: { path: "/settings", heading: "Settings" },
        }[screen];

        await page.goto(target.path);
        await expect(page.getByRole("heading", { level: 1, name: target.heading })).toBeVisible();
        await expectFits(page, screen);

        if (screen === "item") {
          // The private section opens on demand; its long values must wrap too.
          await page.locator("#sec-private").getByRole("heading", { name: "Private details" }).click();
          await expectFits(page, "item with the private section open");
        }
      });
    }

    test(`13c. ${width}: the inbox opens a conversation full width with a way back to the list`, async ({
      page,
      tagged,
      startConversation,
    }) => {
      await requireTurnstileNetwork();
      const message = `${unique("Tablet thread")} https://example.com/${LONG_WORD}`;
      const conversation = await startConversation(tagged, message);

      await page.goto("/conversations");
      await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
      const list = page.getByRole("region", { name: "Conversations" });
      const thread = page.getByRole("region", { name: "Conversation", exact: true });
      await expect(thread, "list first: no thread pane yet").toBeHidden();
      await list
        .getByRole("link", { name: new RegExp(tagged.publicTitle) })
        .first()
        .click();

      await expect(page).toHaveURL(new RegExp(`/conversations/${conversation.id}$`));
      await expect(thread.getByText(message.slice(0, 20))).toBeVisible();
      await expect(list, "below 1280 px the list gives way to the thread").toBeHidden();
      await expectFits(page, "conversation thread");

      await thread.getByRole("link", { name: "Inbox" }).click();
      await expect(page).toHaveURL(/\/conversations$/);
      await expect(list).toBeVisible();
    });
  });
}

test.describe("inbox at 1280 px", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("13d. from 1280 px the list and the open conversation sit side by side", async ({
    page,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);

    await page.goto(`/conversations/${conversation.id}`);
    const list = page.getByRole("region", { name: "Conversations" });
    const thread = page.getByRole("region", { name: "Conversation", exact: true });
    await expect(thread.getByRole("log")).toBeVisible();
    await expect(list).toBeVisible();
    await expect(
      thread.getByRole("link", { name: "Inbox" }),
      "no back link in the split layout",
    ).toBeHidden();
    const [listBox, threadBox] = [await list.boundingBox(), await thread.boundingBox()];
    expect(listBox && threadBox && listBox.x + listBox.width <= threadBox.x + 1).toBe(true);
    await expectFits(page, "split inbox");
  });
});
