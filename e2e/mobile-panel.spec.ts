import type { BrowserContext, Locator, Page } from "@playwright/test";
import { decodeQr, expect, type FinderConversation, ORIGIN, type Tagged, test, unique } from "./fixtures";

/**
 * Spec 004 (mobile UX), owner panel: chat layout (M-05), install + theme + landscape shell (M-03, M-10, M-12),
 * no focus zoom and instant-apply settings (M-04, M-11), the P2 batch and owner location (M-02).
 * Phones are emulated with real touch (coarse pointer); these tests only run in the "mobile" project.
 */
test.beforeEach(({ browserName: _browser }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "own viewports; runs once, in the mobile project");
});

const PHONE = { width: 375, height: 812 };
const touch = (viewport: { width: number; height: number }) => ({ viewport, hasTouch: true, isMobile: true });

async function post(page: Page, path: string, data: unknown): Promise<void> {
  const res = await page.request.post(`/api${path}`, { data, headers: { Origin: ORIGIN } });
  expect(res.ok(), `${path}: ${await res.text()}`).toBeTruthy();
}

async function patchSettings(page: Page, data: unknown): Promise<void> {
  const res = await page.request.patch("/api/settings", { data, headers: { Origin: ORIGIN } });
  expect(res.ok(), await res.text()).toBeTruthy();
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await locator.boundingBox();
  if (!b) throw new Error("element has no box (not visible)");
  return b;
}

async function threadWith(
  page: Page,
  startConversation: (tagged: Tagged) => Promise<FinderConversation>,
  tagged: Tagged,
  messages: number,
): Promise<string> {
  const conv = await startConversation(tagged);
  for (let i = 0; i < messages; i++)
    await post(page, `/conversations/${conv.id}/messages`, {
      body: `Owner message ${i + 1}. ${"Lorem ipsum dolor sit amet. ".repeat(1 + (i % 4))}`,
    });
  return conv.id;
}

async function atBottom(page: Page): Promise<boolean> {
  return page.getByRole("log").evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4);
}

// ----------------------------------------------------------------------------------------------- 4M.3 chat
const CHAT_VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "393x852", width: 393, height: 852 },
  { name: "landscape 667x375", width: 667, height: 375 },
  { name: "landscape 844x390", width: 844, height: 390 },
];

for (const vp of CHAT_VIEWPORTS) {
  test.describe(`owner chat at ${vp.name}`, () => {
    test.use(touch(vp));

    test("composer stays visible above the tab bar, nothing shows through, sending keeps the bottom", async ({
      page,
      tagged,
      startConversation,
    }) => {
      const id = await threadWith(page, startConversation, tagged, 12);
      await page.goto(`/conversations/${id}`);
      const composer = page.getByRole("textbox", { name: "Your reply" });
      await expect(composer).toBeVisible();
      await expect.poll(() => atBottom(page), { message: "opens at the newest message" }).toBe(true);

      const field = await box(composer);
      expect(field.y + field.height, "composer inside the viewport").toBeLessThanOrEqual(vp.height);
      // Compact by default: one line, not the old 147 px block.
      expect(field.height).toBeLessThan(60);

      if (vp.width < 640) {
        const bar = await box(page.getByRole("navigation", { name: "Main" }));
        expect(field.y + field.height, "composer above the floating tab bar").toBeLessThanOrEqual(bar.y);
        // The strip between the composer and the tab bar is the composer's own surface, not the message log.
        const throughLog = await page.evaluate(
          ([x, y]) => document.elementFromPoint(x as number, y as number)?.closest('[role="log"]') !== null,
          [8, field.y + field.height + 6],
        );
        expect(throughLog, "bubbles must not show through below the composer").toBe(false);
      }

      const text = unique("Sent from the chat");
      await composer.fill(text);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByRole("log").getByText(text)).toBeVisible();
      await expect
        .poll(() => atBottom(page), { message: "sending keeps the newest message in view" })
        .toBe(true);
      await expect(composer).toHaveValue("");
    });
  });
}

test.describe("owner chat reading history", () => {
  test.use(touch({ width: 393, height: 852 }));

  test("does not jump while reading older messages and offers a New messages pill", async ({
    page,
    tagged,
    startConversation,
  }) => {
    await page.clock.install();
    const id = await threadWith(page, startConversation, tagged, 14);
    await page.goto(`/conversations/${id}`);
    await expect.poll(() => atBottom(page)).toBe(true);

    await page.getByRole("log").evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect.poll(() => atBottom(page)).toBe(false);
    const fresh = unique("Arrived while reading");
    await post(page, `/conversations/${id}/messages`, { body: fresh });
    // The thread refreshes itself every 30 s.
    await page.clock.runFor(31_000);

    const pill = page.getByRole("button", { name: "New messages" });
    await expect(pill).toBeVisible();
    expect(await page.getByRole("log").evaluate((el) => el.scrollTop), "reading position kept").toBeLessThan(
      40,
    );

    await pill.click();
    await expect(page.getByRole("log").getByText(fresh)).toBeVisible();
    await expect.poll(() => atBottom(page)).toBe(true);
    await expect(pill).toBeHidden();
  });

  test("the title is the finder or subject with a link to the item, and the composer grows then scrolls", async ({
    page,
    tagged,
    startConversation,
  }) => {
    const conv = await startConversation(tagged);
    await page.goto(`/conversations/${conv.id}`);
    await expect(
      page.getByRole("link", { name: new RegExp(tagged.secrets.name.slice(0, 20)) }),
    ).toHaveAttribute("href", `/items/${tagged.item.id}`);
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(page).toHaveTitle(/ · RETURN$/);
    await expect(page).not.toHaveTitle(/^Inbox/);

    const composer = page.getByRole("textbox", { name: "Your reply" });
    await expect(composer).toHaveAttribute("enterkeyhint", "send");
    const one = (await composer.boundingBox())?.height ?? 0;
    await composer.fill("line 1\nline 2\nline 3");
    const three = (await composer.boundingBox())?.height ?? 0;
    expect(three).toBeGreaterThan(one + 20);
    await composer.fill(Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n"));
    const capped = (await composer.boundingBox())?.height ?? 0;
    expect(capped, "five lines at most").toBeLessThanOrEqual(five());
    expect(await composer.evaluate((el) => el.scrollHeight > el.clientHeight), "then it scrolls").toBe(true);

    // Enter sends and Shift+Enter is a new line, on every device.
    await composer.fill("first");
    await composer.press("Shift+Enter");
    await composer.pressSequentially("second");
    await expect(composer).toHaveValue("first\nsecond");
    await composer.fill(unique("enter sends"));
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
  });
});

/** Five lines of 26 px plus padding and border, with a little rounding room. */
function five(): number {
  return 5 * 26 + 20 + 2 + 2;
}

// ----------------------------------------------------------------------------------------------- 4M.5 install
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

async function fireInstallPrompt(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        (window as unknown as { __prompted: number }).__prompted =
          ((window as unknown as { __prompted?: number }).__prompted ?? 0) + 1;
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    // false = something called preventDefault, which is how we keep the event for our own button
    return !window.dispatchEvent(event);
  });
}

test.describe("install: Android / Chromium", () => {
  test.use(touch(PHONE));

  test("beforeinstallprompt is kept and the Install button prompts on click", async ({ page }) => {
    await page.goto("/settings/install");
    await expect(page.getByRole("heading", { level: 1, name: "Install app" })).toBeVisible();
    await expect(page.getByText(/no install button here/)).toBeVisible();

    expect(await fireInstallPrompt(page), "the browser's own infobar is suppressed").toBe(true);
    const button = page.getByRole("button", { name: "Install RETURN" });
    await expect(button).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted),
    ).toBeUndefined();
    await button.click();
    expect(await page.evaluate(() => (window as unknown as { __prompted?: number }).__prompted)).toBe(1);
    // Accepted: the app is installed, so the button is gone for good.
    await expect(page.getByText("RETURN is installed on this device.")).toBeVisible();
    await expect(button).toHaveCount(0);
  });

  test("a one-time dismissible hint shows on phones, and appinstalled hides it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
    await fireInstallPrompt(page);
    const hint = page.getByRole("region", { name: "Install RETURN" });
    await expect(hint).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(hint).toBeHidden();

    // Dismissed once, gone for good (also after a reload and a new prompt event).
    await page.evaluate(() => localStorage.removeItem("return.installHint"));
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
    await fireInstallPrompt(page);
    await expect(hint).toBeVisible();
    await hint.getByRole("button", { name: "Not now" }).click();
    await expect(hint).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
    await fireInstallPrompt(page);
    await expect(hint).toBeHidden();
  });
});

test.describe("install: iOS", () => {
  test.use({ ...touch(PHONE), userAgent: IOS_UA });

  test("the Add to Home Screen guide is in Settings and in a one-time hint", async ({ page }) => {
    await page.goto("/settings/install");
    const steps = page.getByRole("listitem");
    await expect(steps.filter({ hasText: "Add to Home Screen" })).toBeVisible();
    await expect(steps.filter({ hasText: "Open as Web App" })).toBeVisible();
    await expect(steps.filter({ hasText: "Share button" })).toBeVisible();

    await page.goto("/");
    const hint = page.getByRole("region", { name: "Install RETURN" });
    await expect(hint).toBeVisible();
    await hint.getByRole("button", { name: "Show me how" }).click();
    const guide = page.getByRole("dialog", { name: "Add RETURN to your Home Screen" });
    await expect(guide.getByText(/Open as Web App/)).toBeVisible();
    await guide.getByRole("button", { name: "Got it" }).click();
    await expect(hint).toBeHidden();
  });

  test("never inside the installed app", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { value: true }));
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Install RETURN" })).toHaveCount(0);
    await page.goto("/settings/install");
    await expect(page.getByText("RETURN is installed on this device.")).toBeVisible();
    await expect(page.getByRole("list").filter({ hasText: "Share button" })).toHaveCount(0);
  });
});

// ----------------------------------------------------------------------------------------------- theme
const META_LIGHT = "#FAF7F2";
const META_DARK = "#0F1719";

async function themeMetas(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => [
        m.dataset.scheme ?? "",
        m.content,
      ]),
    ),
  );
}

test.describe("theme", () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

  test("meta theme-color follows the explicit choice, and every Appearance control stays in sync", async ({
    page,
  }) => {
    await page.goto("/settings/identity");
    const controls = page.getByRole("group", { name: "Appearance" });
    await expect(controls).toHaveCount(2); // sidebar + Settings
    await controls.first().getByText("Dark", { exact: true }).click();
    await expect(controls.nth(1).getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(await themeMetas(page)).toEqual({ light: META_DARK, dark: META_DARK });

    await controls.nth(1).getByText("Light", { exact: true }).click();
    await expect(controls.first().getByRole("radio", { name: "Light" })).toBeChecked();
    expect(await themeMetas(page)).toEqual({ light: META_LIGHT, dark: META_LIGHT });

    await controls.first().getByText("Auto", { exact: true }).click();
    expect(await themeMetas(page)).toEqual({ light: META_LIGHT, dark: META_DARK });
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  });

  test("the stored theme is applied by a blocking head script, before the app bundle runs", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("return.theme", "dark"));
    // Without the app bundle nothing but index.html's own head script can have set the theme.
    await page.route("**/src/app/main.tsx*", (route) => route.abort());
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await themeMetas(page)).toEqual({ light: META_DARK, dark: META_DARK });
    // A classic (blocking) script from the same origin: the panel CSP allows script-src 'self' only.
    const script = page.locator('head script[src="/theme-init.js"]');
    await expect(script).toHaveCount(1);
    await expect(script).not.toHaveAttribute("type", /.+/);
    await expect(script).not.toHaveAttribute("async", /.*/);
    await expect(script).not.toHaveAttribute("defer", /.*/);
  });
});

// ----------------------------------------------------------------------------------------------- landscape shell
for (const vp of [
  { width: 667, height: 375 },
  { width: 844, height: 390 },
]) {
  test.describe(`landscape shell ${vp.width}x${vp.height}`, () => {
    test.use(touch(vp));

    test("the rail is not clipped and the theme control is reachable", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
      for (const name of ["Inventory", "Inbox", "Tags", "Settings"]) {
        const b = await box(
          page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: new RegExp(`${name}$`) }),
        );
        expect(b.y, `${name} top`).toBeGreaterThanOrEqual(0);
        expect(b.y + b.height, `${name} bottom`).toBeLessThanOrEqual(vp.height);
      }
      const theme = page.getByRole("button", { name: "Appearance" });
      const tb = await box(theme);
      expect(tb.y + tb.height).toBeLessThanOrEqual(vp.height);
      await theme.click();
      await expect(page.getByRole("dialog", { name: "Appearance" })).toBeVisible();
    });
  });
}

// ----------------------------------------------------------------------------------------------- 4M.6 zoom
const TEXT_FIELDS = `input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]):not([type=hidden]), textarea, select`;

async function smallFields(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        name: el.getAttribute("aria-label") ?? el.id ?? el.tagName,
        tag: el.tagName.toLowerCase(),
        size: Number.parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((f) => f.size < 16)
      .map((f) => `${f.tag}#${f.name} ${f.size}px`);
  }, TEXT_FIELDS);
}

test.describe("no focus zoom", () => {
  test.use(touch(PHONE));

  test("every text field, textarea and native select is at least 16px on touch, on every panel route", async ({
    page,
    tagged,
    startConversation,
  }) => {
    const conv = await startConversation(tagged);
    const routes = [
      "/",
      "/?new=item",
      "/conversations",
      `/conversations/${conv.id}`,
      `/items/${tagged.item.id}`,
      "/tags",
      "/tags?new=1",
      "/settings/identity",
      "/settings/messages",
      "/settings/contact",
      "/settings/notifications",
      "/settings/privacy",
      "/settings/tags",
      "/settings/public",
      "/settings/system",
    ];
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main h1, dialog[open] h2").first()).toBeVisible();
      expect(await smallFields(page), route).toEqual([]);
    }

    // Sheets that hold fields: propose a plan, an item's tag, tracker form.
    await page.goto(`/conversations/${conv.id}`);
    await page.getByRole("button", { name: "Add to the conversation" }).click();
    await page.getByRole("menuitem", { name: "Propose a return plan" }).click();
    await expect(page.getByRole("dialog", { name: "Propose a return plan" })).toBeVisible();
    expect(await smallFields(page), "proposal sheet").toEqual([]);

    await page.goto(`/items/${tagged.item.id}`);
    await page.getByRole("button", { name: new RegExp(`^${tagged.tag.label}`) }).click();
    await expect(page.getByRole("dialog", { name: `Tag ${tagged.tag.label}` })).toBeVisible();
    expect(await smallFields(page), "tag sheet").toEqual([]);
  });

  test("the viewport never locks zoom", async ({ page }) => {
    await page.goto("/");
    const content = (await page.locator('meta[name="viewport"]').getAttribute("content")) ?? "";
    expect(content).not.toMatch(/maximum-scale|user-scalable/);
  });
});

// ----------------------------------------------------------------------------------------------- 4M.6 settings
test.describe("settings apply instantly", () => {
  test.use(touch(PHONE));

  test("a toggle saves at once, persists, and leaves no unsaved bar", async ({ page }) => {
    await page.goto("/settings/privacy");
    const toggle = page.getByRole("switch", { name: "Record the country of each scan" });
    const before = await toggle.isChecked();
    try {
      const saved = page.waitForResponse(
        (r) => r.url().endsWith("/api/settings") && r.request().method() === "PATCH",
      );
      await page.getByText("Record the country of each scan").click();
      await expect(toggle).toBeChecked({ checked: !before });
      expect((await saved).ok()).toBe(true);
      await expect(page.getByText("Settings saved")).toBeVisible();
      await expect(page.getByRole("toolbar", { name: "Unsaved changes" })).toHaveCount(0);

      await page.reload();
      await expect(page.getByRole("switch", { name: "Record the country of each scan" })).toBeChecked({
        checked: !before,
      });
    } finally {
      await patchSettings(page, { privacy: { recordScanCountry: before } });
    }
  });

  test("a refused save rolls the toggle back and says why", async ({ page }) => {
    await page.goto("/settings/privacy");
    const toggle = page.getByRole("switch", { name: "Record the country of each scan" });
    const before = await toggle.isChecked();
    await page.route("**/api/settings", (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({ error: { code: "validation", message: "Refused for the test" } }),
          })
        : route.continue(),
    );
    await page.getByText("Record the country of each scan").click();
    await expect(page.getByText("Refused for the test")).toBeVisible();
    await expect(toggle).toBeChecked({ checked: before });
  });

  test("text fields keep the explicit Save, and its bar never covers the tab bar", async ({ page }) => {
    await page.goto("/settings/privacy");
    const days = page.getByLabel("Keep activity history for (days)");
    const original = await days.inputValue();
    await days.fill(String(Number(original) === 90 ? 91 : 90));
    const bar = page.getByRole("toolbar", { name: "Unsaved changes" });
    await expect(bar).toBeVisible();
    const barBox = await box(bar);
    const tabs = await box(page.getByRole("navigation", { name: "Main" }));
    const plus = await box(page.getByRole("button", { name: "Create something new" }));
    expect(barBox.y + barBox.height, "above the tab bar").toBeLessThanOrEqual(tabs.y);
    expect(barBox.y + barBox.height, "above the + button").toBeLessThanOrEqual(plus.y);
    await bar.getByRole("button", { name: "Discard" }).click();
    await expect(bar).toHaveCount(0);
  });
});

// ----------------------------------------------------------------------------------------------- 4M.7 P2 batch
test.describe("P2 batch", () => {
  test.use(touch(PHONE));

  test("place search says the service is unavailable instead of 'no places'", async ({
    page,
    tagged,
    startConversation,
  }) => {
    const conv = await startConversation(tagged);
    await page.route("**/api/geocode/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ results: [], attribution: "", unavailable: true }),
      }),
    );
    await page.goto(`/conversations/${conv.id}`);
    await page.getByRole("button", { name: "Add to the conversation" }).click();
    await page.getByRole("menuitem", { name: "Propose a return plan" }).click();
    const sheet = page.getByRole("dialog", { name: "Propose a return plan" });
    await sheet.getByLabel("Search a place").fill("Atocha");
    await sheet.getByRole("button", { name: "Search", exact: true }).click();
    await expect(sheet.getByText(/Place search is unavailable/)).toBeVisible();
    await expect(sheet.getByText("No places found")).toHaveCount(0);
  });

  test("Add tag on an item asks first", async ({ page, owner }) => {
    const item = await owner.createItem();
    await page.goto(`/items/${item.id}`);
    await page.getByRole("button", { name: "Add tag" }).click();
    const dialog = page.getByRole("dialog", { name: "Add another tag?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect((await owner.item(item.id)).tags).toHaveLength(0);

    await page.getByRole("button", { name: "Add tag" }).click();
    await page
      .getByRole("dialog", { name: "Add another tag?" })
      .getByRole("button", { name: "Add tag" })
      .click();
    await expect(page.getByText("Tag created")).toBeVisible();
    expect((await owner.item(item.id)).tags).toHaveLength(1);
  });

  test("unknown routes and unknown settings sections show the 404 page", async ({ page }) => {
    for (const path of ["/settings/nope", "/no-such-page", "/conversations/a/b"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" }), path).toBeVisible();
    }
    await page.goto("/settings/");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  });

  test("Share Item Location is an external help link, said so", async ({ page, owner }) => {
    const item = await owner.createItem();
    await page.goto(`/items/${item.id}`);
    await page.getByRole("heading", { name: "Trackers" }).click();
    const link = page.getByRole("link", { name: /How Apple shares item location/ });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAccessibleName(/opens in a new tab/);
  });

  test("the panel keeps its language when settings cannot be loaded", async ({ page }) => {
    await patchSettings(page, { identity: { panelLanguage: "es" } });
    try {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1, name: "Inventario" })).toBeVisible();
      // A later start with the API unreachable (offline) still speaks Spanish, not the browser's English.
      await page.route("**/api/settings", (route) => route.abort("failed"));
      await page.reload();
      await expect(page.getByRole("link", { name: "Ajustes", exact: true }).first()).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
    } finally {
      await page.unroute("**/api/settings");
      await patchSettings(page, { identity: { panelLanguage: "en" } });
    }
  });
});

// ----------------------------------------------------------------------------------------------- QR PNG + share
async function stubShare(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __shares: { names: string[]; types: string[]; active: boolean }[] };
    w.__shares = [];
    navigator.canShare = () => true;
    navigator.share = async (data?: ShareData) => {
      w.__shares.push({
        names: (data?.files ?? []).map((f) => f.name),
        types: (data?.files ?? []).map((f) => f.type),
        // Activation at the moment of the call: the thing iOS checks.
        active: navigator.userActivation.isActive,
      });
    };
  });
}

test.describe("tag QR as PNG and native share", () => {
  test.use(touch(PHONE));

  test("PNG download scans back to the tag URL; Share opens the share sheet from the tap", async ({
    page,
    context,
    tagged,
  }) => {
    await stubShare(context);
    await page.goto(`/items/${tagged.item.id}`);
    await page.getByRole("button", { name: new RegExp(`^${tagged.tag.label}`) }).click();
    const sheet = page.getByRole("dialog", { name: `Tag ${tagged.tag.label}` });
    const png = sheet.getByRole("button", { name: "Download PNG" });
    await expect(png).toBeEnabled();

    // Share straight from the tap, with the user activation still alive (the PNG was built when the sheet opened).
    await sheet.getByRole("button", { name: "Share", exact: true }).click();
    const shares = await page.evaluate(() => (window as unknown as { __shares: unknown[] }).__shares);
    expect(shares).toEqual([
      { names: [expect.stringMatching(/\.png$/)], types: ["image/png"], active: true },
    ]);

    const [download] = await Promise.all([page.waitForEvent("download"), png.click()]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    // Scans back to the tag URL, the way a phone camera would (navigates away: keep it last).
    expect(await decodeQr(page, `data:image/png;base64,${bytes.toString("base64")}`)).toBe(tagged.tag.url);
  });

  test("Quick card Share is prepared before the tap, so it still has user activation", async ({
    page,
    context,
    tagged,
  }) => {
    await stubShare(context);
    await page.goto(`/items/${tagged.item.id}?quick-card=1`);
    const sheet = page.getByRole("dialog", { name: "Quick card", exact: true });
    const share = sheet.getByRole("button", { name: "Share…" });
    await expect(share).toBeEnabled({ timeout: 30_000 });
    await share.click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __shares: unknown[] }).__shares.length))
      .toBe(1);
    const [first] = await page.evaluate(
      () => (window as unknown as { __shares: { active: boolean; types: string[] }[] }).__shares,
    );
    expect(first).toMatchObject({ active: true, types: ["image/png"] });
  });
});

// ----------------------------------------------------------------------------------------------- 4M.4 owner location
const FIX = { latitude: 40.4165, longitude: -3.7038, accuracy: 25 };

test.describe("owner location", () => {
  test.use(touch(PHONE));

  test("Share my location: preview, consent, then it appears in the thread as yours", async ({
    page,
    context,
    owner,
    tagged,
    startConversation,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(FIX);
    const conv = await startConversation(tagged);
    await page.goto(`/conversations/${conv.id}`);
    await page.getByRole("button", { name: "Add to the conversation" }).click();
    await page.getByRole("menuitem", { name: "Share my location" }).click();
    const sheet = page.getByRole("dialog", { name: "Share my location" });
    const send = sheet.getByRole("button", { name: "Share location" });
    await expect(send, "nothing is shared before a position exists").toBeDisabled();
    await sheet.getByRole("button", { name: "Use my location" }).click();
    await expect(sheet.getByText("The finder will see")).toBeVisible();
    await expect(sheet.getByText(/Only this finder sees it/)).toBeVisible();
    expect((await owner.conversation(conv.id)).locations).toHaveLength(0);
    await send.click();
    await expect(page.getByText("Location shared")).toBeVisible();
    const card = page.getByRole("log").getByText("Location you shared");
    await expect(card).toBeVisible();
    const shared = (await owner.conversation(conv.id)).locations;
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ sharedBy: "owner", source: "gps", approximate: false });
  });

  test("an imprecise fix is flagged as an approximate area", async ({
    page,
    context,
    owner,
    tagged,
    startConversation,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ ...FIX, accuracy: 4000 });
    const conv = await startConversation(tagged);
    await page.goto(`/conversations/${conv.id}`);
    await page.getByRole("button", { name: "Add to the conversation" }).click();
    await page.getByRole("menuitem", { name: "Share my location" }).click();
    const sheet = page.getByRole("dialog", { name: "Share my location" });
    await sheet.getByRole("button", { name: "Use my location" }).click();
    await expect(sheet.getByText(/approximate area/)).toBeVisible();
    await sheet.getByRole("button", { name: "Share location" }).click();
    await expect(page.getByRole("log").getByText("Approximate area")).toBeVisible();
    expect((await owner.conversation(conv.id)).locations[0]?.approximate).toBe(true);
  });

  test("a denied permission says how to re-enable it", async ({ page, tagged, startConversation }) => {
    const conv = await startConversation(tagged);
    await page.goto(`/conversations/${conv.id}`);
    await page.getByRole("button", { name: "Add to the conversation" }).click();
    await page.getByRole("menuitem", { name: "Share my location" }).click();
    const sheet = page.getByRole("dialog", { name: "Share my location" });
    await sheet.getByRole("button", { name: "Use my location" }).click();
    await expect(sheet.getByRole("alert")).toContainText(/Location is blocked/);
    await expect(sheet.getByRole("button", { name: "Share location" })).toBeDisabled();
  });

  test("Use my location fills a return plan with coordinates and a place name", async ({
    page,
    context,
    owner,
    tagged,
    startConversation,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(FIX);
    const conv = await startConversation(tagged);
    await page.goto(`/conversations/${conv.id}`);
    await page.getByRole("button", { name: "Add to the conversation" }).click();
    await page.getByRole("menuitem", { name: "Propose a return plan" }).click();
    const sheet = page.getByRole("dialog", { name: "Propose a return plan" });
    await sheet.getByRole("button", { name: "Use my location" }).click();
    await expect(sheet.getByRole("textbox", { name: /^Place/ })).not.toHaveValue("");
    await sheet.getByRole("button", { name: "Send return plan" }).click();
    await expect(page.getByText("Return plan sent")).toBeVisible();
    const [plan] = (await owner.conversation(conv.id)).proposals;
    expect(plan?.lat).toBeCloseTo(FIX.latitude, 3);
    expect(plan?.lng).toBeCloseTo(FIX.longitude, 3);
  });

  test("editing the location text by hand drops the position instead of saving it under new text", async ({
    page,
    context,
    owner,
  }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(FIX);
    const item = await owner.createItem();
    await page.goto(`/items/${item.id}`);
    await page
      .getByRole("button", { name: /Last known location|Not set/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: "Last known location" });
    await sheet.getByRole("button", { name: "Use my location" }).click();
    const field = sheet.getByLabel("Last known location", { exact: true });
    await expect(field).not.toHaveValue("");
    await field.fill("Train to Berlin");
    await expect(sheet.getByText(/saved position was removed/)).toBeVisible();
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    const saved = (await owner.item(item.id)).item;
    expect(saved.lastKnownLocation).toBe("Train to Berlin");
    expect(saved.lastKnownLat).toBeNull();
    expect(saved.lastKnownLng).toBeNull();
  });

  test("Set location on an item stores the position with the text", async ({ page, context, owner }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(FIX);
    const item = await owner.createItem();
    await page.goto(`/items/${item.id}`);
    await page
      .getByRole("button", { name: /Last known location|Not set/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: "Last known location" });
    await sheet.getByRole("button", { name: "Use my location" }).click();
    await expect(sheet.getByLabel("Last known location", { exact: true })).not.toHaveValue("");
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    const saved = (await owner.item(item.id)).item;
    expect(saved.lastKnownLat).toBeCloseTo(FIX.latitude, 3);
    expect(saved.lastKnownLng).toBeCloseTo(FIX.longitude, 3);
  });
});
