import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * Selection family (docs/design/system.md § 9a): Select, Combobox and Menu, alone and inside a Sheet.
 * Everything runs on /gallery, which needs no data and never writes through the API.
 * Fine-pointer behaviour (glass listbox) runs in the desktop project; touch keeps the native <select>.
 */

const GALLERY = "/gallery";

async function openGallery(page: Page) {
  await page.goto(GALLERY);
  await expect(page.getByRole("heading", { level: 1, name: "Component gallery" })).toBeVisible();
}

const listboxOf = (page: Page, combobox: Locator) =>
  combobox.getAttribute("aria-controls").then((id) => page.locator(`[id="${id}"]`));

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no layout box");
  return b;
}

async function activeOptionText(page: Page, combobox: Locator): Promise<string> {
  const id = await combobox.getAttribute("aria-activedescendant");
  expect(id, "an option is active").toBeTruthy();
  return (await page.locator(`[id="${id}"]`).innerText()).split("\n")[0] ?? "";
}

test.describe("fine pointer", () => {
  test.skip(({ isMobile }) => isMobile, "touch devices use the native <select>");

  test("Select opens with ArrowDown, moves, picks with Enter and keeps focus on the trigger", async ({
    page,
  }) => {
    await openGallery(page);
    const nfc = page.getByRole("combobox", { name: "NFC chip" });
    await nfc.focus();
    await page.keyboard.press("ArrowDown");
    await expect(nfc).toHaveAttribute("aria-expanded", "true");
    expect(await activeOptionText(page, nfc)).toBe("Written");
    await page.keyboard.press("ArrowDown");
    expect(await activeOptionText(page, nfc)).toBe("Written and locked");
    await page.keyboard.press("Enter");
    await expect(nfc).toHaveAttribute("aria-expanded", "false");
    await expect(nfc).toHaveText("Written and locked");
    await expect(nfc).toBeFocused();
  });

  test("a programmatic click (assistive technology, el.click()) opens the Select", async ({ page }) => {
    await openGallery(page);
    const nfc = page.getByRole("combobox", { name: "NFC chip" });
    await nfc.evaluate((el: HTMLElement) => el.click());
    await expect(nfc).toHaveAttribute("aria-expanded", "true");
    await expect(await listboxOf(page, nfc)).toBeVisible();
  });

  test("Escape inside a Sheet closes the listbox first and keeps the Sheet open", async ({ page }) => {
    await openGallery(page);
    await page.getByRole("button", { name: "Open sheet", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Add item" });
    await expect(sheet).toBeVisible();
    const category = sheet.getByRole("combobox", { name: "Category" });
    await category.click();
    await expect(category).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(category).toHaveAttribute("aria-expanded", "false");
    await expect(sheet).toBeVisible();
    await expect(category).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("clicking the scrim with a listbox open closes only the listbox", async ({ page }) => {
    await openGallery(page);
    await page.getByRole("button", { name: "Open sheet", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Add item" });
    const category = sheet.getByRole("combobox", { name: "Category" });
    await category.click();
    await expect(category).toHaveAttribute("aria-expanded", "true");
    // The side panel sits on the right; the left edge of the window is scrim.
    await page.mouse.click(24, 400);
    await expect(category).toHaveAttribute("aria-expanded", "false");
    await expect(sheet).toBeVisible();
    // Only that one click was consumed: the next scrim click closes the sheet as usual.
    await page.mouse.click(24, 400);
    await expect(sheet).toBeHidden();
  });

  test("the listbox floats above the Sheet, next to its trigger", async ({ page }) => {
    await openGallery(page);
    await page.getByRole("button", { name: "Open sheet", exact: true }).click();
    const category = page
      .getByRole("dialog", { name: "Add item" })
      .getByRole("combobox", { name: "Category" });
    await category.click();
    const listbox = await listboxOf(page, category);
    const [trigger, list] = await Promise.all([box(category), box(listbox)]);
    expect(list.y).toBeGreaterThan(trigger.y + trigger.height);
    expect(list.y - (trigger.y + trigger.height)).toBeLessThan(16);
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=option]") !== null,
      { x: list.x + list.width / 2, y: list.y + 24 },
    );
    expect(hit, "options are on top (top layer), not covered by the sheet").toBe(true);
  });

  test("Combobox: typing filters, Enter picks the first match", async ({ page }) => {
    await openGallery(page);
    const zone = page.getByRole("combobox", { name: "Time zone" });
    await zone.click();
    await zone.fill("gmt+1");
    await expect(zone).toHaveAttribute("aria-expanded", "true");
    const first = await activeOptionText(page, zone);
    await page.keyboard.press("Enter");
    await expect(zone).toHaveAttribute("aria-expanded", "false");
    await expect(zone).toHaveValue(first);
  });

  test("Combobox: free text reverts on blur", async ({ page }) => {
    await openGallery(page);
    const zone = page.getByRole("combobox", { name: "Time zone" });
    await expect(zone).toHaveValue("Berlin");
    await zone.click();
    await zone.fill("Atlantis");
    await page.keyboard.press("Tab");
    await expect(zone).toHaveValue("Berlin");
  });

  test("Combobox: an exact match commits when the pointer dismisses the list", async ({ page }) => {
    await openGallery(page);
    const zone = page.getByRole("combobox", { name: "Time zone" });
    await zone.click();
    await zone.fill("lisbon");
    await expect(zone).toHaveAttribute("aria-expanded", "true");
    const heading = page.getByRole("heading", { name: "Selection: Select, Combobox, Menu" });
    await heading.click();
    await expect(zone).toHaveAttribute("aria-expanded", "false");
    await expect(zone).toHaveValue("Lisbon");
  });

  test("Combobox placed above its field stays attached while the list shrinks", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 });
    await openGallery(page);
    const zone = page.getByRole("combobox", { name: "Time zone" });
    await zone.evaluate((el) => {
      const r = el.getBoundingClientRect();
      window.scrollBy(0, r.bottom - window.innerHeight + 24);
    });
    await zone.click();
    const listbox = await listboxOf(page, zone);
    const popover = listbox.locator("xpath=..");
    await expect(popover).toHaveAttribute("data-side", "top");
    await zone.pressSequentially("lisb");
    await expect(listbox.getByRole("option")).toHaveCount(1);
    const gap = await zone.evaluate((input) => {
      const pop = document.getElementById(input.getAttribute("aria-controls") ?? "")?.parentElement;
      return pop ? input.getBoundingClientRect().top - pop.getBoundingClientRect().bottom : Number.NaN;
    });
    expect(gap).toBeGreaterThanOrEqual(2);
    expect(gap).toBeLessThanOrEqual(10);
  });

  test("Menu: Escape returns focus to its button", async ({ page }) => {
    await openGallery(page);
    const button = page.getByRole("button", { name: "Sheet actions" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Open sheet" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Open large sheet" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");
  });

  test("Menu: an action that opens a Sheet gets focus back when the Sheet closes", async ({ page }) => {
    await openGallery(page);
    const button = page.getByRole("button", { name: "Sheet actions" });
    await button.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Add item" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(button).toBeFocused();
  });
});

test.describe("touch", () => {
  test.skip(({ isMobile }) => !isMobile, "fine pointers get the glass listbox");

  test("Select renders the native picker on coarse pointers", async ({ page }) => {
    await openGallery(page);
    const nfc = page.getByRole("combobox", { name: "NFC chip" });
    await expect(nfc).toHaveJSProperty("tagName", "SELECT");
    await nfc.selectOption("locked");
    await expect(nfc).toHaveValue("locked");
  });
});
