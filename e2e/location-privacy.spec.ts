import type { BrowserContext } from "@playwright/test";
import {
  countGeolocationCalls,
  expect,
  geolocationCalls,
  ORIGIN,
  openTagPage,
  requireTurnstileNetwork,
  submitContactForm,
  test,
  unique,
  waitForTurnstile,
} from "./fixtures";

/**
 * Scenario 3. Finder location: the browser is asked only after an explicit tap, the tap applies the fix to the
 * form at once (it is the consent), the finder can remove or update it, and a fix they saw is never dropped.
 */

const POSITION = { latitude: 38.7223, longitude: -9.1393, accuracy: 35 };
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const INSTAGRAM_UA = `${IOS_UA} Instagram 340.0.0.0`;

type Step = { after: number; ok: { accuracy: number } | { code: number } };
/** Replaces the Geolocation API with a script: each call consumes the next step (coarse, then refine, ...). */
async function scriptGeolocation(context: BrowserContext, steps: Step[]): Promise<void> {
  await context.addInitScript(
    ({ steps, position }) => {
      const w = window as unknown as { __geoOptions: object[]; __geoCalls: number };
      w.__geoOptions = [];
      w.__geoCalls = 0;
      let index = 0;
      const getCurrentPosition = (
        ok: (p: object) => void,
        fail: (e: object) => void,
        options: object = {},
      ) => {
        w.__geoCalls += 1;
        w.__geoOptions.push(options);
        const step = steps[Math.min(index, steps.length - 1)];
        index += 1;
        setTimeout(() => {
          const result = step?.ok ?? { accuracy: 50 };
          if ("code" in result) fail({ code: result.code, message: "stub" });
          else
            ok({
              coords: {
                latitude: position.latitude,
                longitude: position.longitude,
                accuracy: result.accuracy,
              },
              timestamp: Date.now(),
            });
        }, step?.after ?? 0);
      };
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition, watchPosition: () => 0, clearWatch: () => {} },
        configurable: true,
      });
    },
    { steps, position: POSITION },
  );
}

test.describe("with a granted permission", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["geolocation"], { origin: ORIGIN });
    await context.setGeolocation(POSITION);
    await countGeolocationCalls(context);
  });

  test("3a. the position is requested only after the tap and applied at once, with no confirm step", async ({
    page,
    tagged,
  }) => {
    const contactPosts: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST") contactPosts.push(r.url());
    });

    await openTagPage(page, tagged.tag.url);
    await page.getByLabel("Your message").fill(unique("Typing a message first"));
    expect(await geolocationCalls(page), "no geolocation call before the tap").toBe(0);
    await expect(page.locator("[data-gps-card]")).toBeHidden();

    await page.getByRole("button", { name: "Use my current position" }).click();

    const card = page.locator("[data-gps-card]");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Your position");
    await expect(card).toContainText("±35 m");
    await expect(card).toContainText("38.72230, -9.13930");
    await expect(page.locator('input[name="location_lat"]')).toHaveValue("38.7223");
    await expect(page.locator('input[name="location_accuracy"]')).toHaveValue("35");
    await expect(page.locator('input[name="location_source"]')).toHaveValue("gps");
    // One consent statement: the explicit tap. No checkbox, no confirm button.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0);
    await expect(page.getByText("shares your point and its accuracy")).toBeVisible();
    expect(contactPosts).toEqual([]);
  });

  test("3b. Remove clears every trace of the position and does not ask again", async ({ page, tagged }) => {
    await openTagPage(page, tagged.tag.url);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await expect(page.locator("[data-gps-card]")).toBeVisible();
    const calls = await geolocationCalls(page);

    await page.locator("[data-gps-card]").getByRole("button", { name: "Remove" }).click();

    await expect(page.locator("[data-gps-card]")).toBeHidden();
    for (const field of ["location_lat", "location_lng", "location_accuracy"]) {
      await expect(page.locator(`input[name="${field}"]`), field).toHaveValue("");
    }
    await expect(page.locator('input[name="location_source"]')).toHaveValue("manual");
    await expect(page.getByRole("button", { name: "Use my current position" })).toBeVisible();
    expect(await geolocationCalls(page), "removing must not ask again").toBe(calls);
  });

  test("3c. after removing the position, the message reaches the owner with no location at all", async ({
    page,
    owner,
    tagged,
  }) => {
    await requireTurnstileNetwork();
    const message = unique("Removed the location");
    await openTagPage(page, tagged.tag.url);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await page.locator("[data-gps-card]").getByRole("button", { name: "Remove" }).click();
    await page.getByLabel("Your message").fill(message);
    await waitForTurnstile(page);

    expect(await submitContactForm(page, "Send message")).toBe(303);

    await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}$/);
    const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
    const detail = await owner.conversation(summary?.id ?? "");
    expect(detail.locations).toEqual([]);
  });

  test("3d. a granted fix is sent without pressing anything else and arrives at the owner", async ({
    page,
    owner,
    tagged,
  }) => {
    await requireTurnstileNetwork();
    const message = unique("Applied the location");
    await openTagPage(page, tagged.tag.url);
    await page.getByLabel("Your message").fill(message);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await expect(page.locator("[data-gps-status]")).toContainText("Position added (±35 m)");
    await waitForTurnstile(page);
    expect(await submitContactForm(page, "Send message")).toBe(303);

    await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}$/);
    await expect(page.getByText("38.72230, -9.13930")).toBeVisible();
    const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
    const detail = await owner.conversation(summary?.id ?? "");
    expect(detail.locations).toHaveLength(1);
    expect(detail.locations[0]).toMatchObject({ source: "gps", lat: 38.7223, lng: -9.1393, accuracyM: 35 });
  });

  test("3e. the position card is never hidden under the header", async ({ page, tagged }) => {
    await openTagPage(page, tagged.tag.url);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await expect(page.locator("[data-gps-card]")).toBeVisible();
    // Let the scroll triggered by the card settle.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const header = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
          const card = document.querySelector("[data-gps-card]")?.getBoundingClientRect().top ?? 0;
          return card >= header;
        }),
      )
      .toBe(true);
  });
});

test.describe("coarse first, then refine", () => {
  test("3f. a quick coarse fix is applied at once and replaced by a more accurate one", async ({
    page,
    context,
    tagged,
  }) => {
    await scriptGeolocation(context, [
      { after: 20, ok: { accuracy: 800 } },
      { after: 600, ok: { accuracy: 20 } },
    ]);
    await openTagPage(page, tagged.tag.url);
    await page.getByRole("button", { name: "Use my current position" }).click();

    const card = page.locator("[data-gps-card]");
    await expect(card).toContainText("±800 m");
    await expect(page.locator('input[name="location_accuracy"]')).toHaveValue("800");
    await expect(card).toContainText("±20 m");
    await expect(page.locator('input[name="location_accuracy"]')).toHaveValue("20");

    const options = await page.evaluate(() => (window as unknown as { __geoOptions: object[] }).__geoOptions);
    expect(options).toEqual([
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    ]);
  });

  test("3g. a worse refinement never replaces the fix the finder already saw", async ({
    page,
    context,
    tagged,
  }) => {
    await scriptGeolocation(context, [
      { after: 20, ok: { accuracy: 30 } },
      { after: 200, ok: { accuracy: 500 } },
    ]);
    await openTagPage(page, tagged.tag.url);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await expect(page.locator("[data-gps-card]")).toContainText("±30 m");
    await expect.poll(() => geolocationCalls(page)).toBe(2);
    await page.waitForTimeout(500);
    await expect(page.locator('input[name="location_accuracy"]')).toHaveValue("30");
  });

  test("3h. submitting while the position is still being found waits for it", async ({
    page,
    context,
    owner,
    tagged,
  }) => {
    await requireTurnstileNetwork();
    const message = unique("Sent while locating");
    await scriptGeolocation(context, [
      { after: 2500, ok: { accuracy: 40 } },
      { after: 100, ok: { accuracy: 40 } },
    ]);
    await openTagPage(page, tagged.tag.url);
    await page.getByLabel("Your message").fill(message);
    await waitForTurnstile(page);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("[data-gps-status]")).toContainText("Waiting for your position");

    await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}$/, { timeout: 15_000 });
    const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
    const detail = await owner.conversation(summary?.id ?? "");
    expect(detail.locations[0]).toMatchObject({ source: "gps", lat: 38.7223, accuracyM: 40 });
  });
});

test.describe("a position that never arrives", () => {
  const NEVER = 1_000_000;

  test("3p. a held submit can be sent without the position, which is dropped", async ({
    page,
    context,
    owner,
    tagged,
  }) => {
    await requireTurnstileNetwork();
    const message = unique("Gave up waiting");
    await scriptGeolocation(context, [{ after: NEVER, ok: { accuracy: 40 } }]);
    await openTagPage(page, tagged.tag.url);
    await page.getByLabel("Your message").fill(message);
    await waitForTurnstile(page);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("[data-gps-status]")).toContainText("Waiting for your position");

    await page.getByRole("button", { name: "Send without location" }).click();

    await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}/, { timeout: 15_000 });
    const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
    expect((await owner.conversation(summary?.id ?? "")).locations).toEqual([]);
  });

  test("3q. after about 20 seconds the held submit is released without a position and says so", async ({
    page,
    context,
    owner,
    tagged,
  }) => {
    test.setTimeout(75_000);
    await requireTurnstileNetwork();
    const message = unique("Timed out waiting");
    await scriptGeolocation(context, [{ after: NEVER, ok: { accuracy: 40 } }]);
    await openTagPage(page, tagged.tag.url);
    await page.getByLabel("Your message").fill(message);
    await waitForTurnstile(page);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("[data-gps-status]")).toContainText("Waiting for your position");

    await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}/, { timeout: 30_000 });
    const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
    expect((await owner.conversation(summary?.id ?? "")).locations).toEqual([]);
  });
});

test.describe("when it fails", () => {
  test("3i. a refused permission says so as an error, explains how to re-enable it and offers a way out", async ({
    page,
    context,
    tagged,
  }) => {
    await context.clearPermissions();
    await openTagPage(page, tagged.tag.url);

    await page.getByRole("button", { name: "Use my current position" }).click();

    const error = page.locator("[data-gps-error]");
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toContainText("Location access is turned off for this page.");
    await expect(error).toContainText(/Allow/);
    await expect(page.locator("[data-gps-card]")).toBeHidden();
    await expect(page.locator('input[name="location_lat"]')).toHaveValue("");
    // Styled as an error, not as the green success status.
    const color = await error.evaluate((el) => getComputedStyle(el).color);
    const success = await page.locator("[data-gps-status]").evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe(success);

    await error.getByRole("button", { name: "Describe the place instead" }).click();
    await expect(page.getByLabel(/^Place or description/)).toBeFocused();
  });

  test.describe("on an iPhone", () => {
    test.use({ userAgent: IOS_UA });
    test("3j. the guidance names the iOS settings path", async ({ page, context, tagged }) => {
      await context.clearPermissions();
      await openTagPage(page, tagged.tag.url);
      await page.getByRole("button", { name: "Use my current position" }).click();
      await expect(page.locator("[data-gps-error]")).toContainText(
        "Settings › Privacy & Security › Location Services › Safari Websites",
      );
    });
  });

  test.describe("on Android", () => {
    test.use({ userAgent: ANDROID_UA });
    test("3k. the guidance names the Chrome site settings", async ({ page, context, tagged }) => {
      await context.clearPermissions();
      await openTagPage(page, tagged.tag.url);
      await page.getByRole("button", { name: "Use my current position" }).click();
      await expect(page.locator("[data-gps-error]")).toContainText(
        "Permissions (or Site settings) › Location",
      );
    });
  });

  test("3l. in German the denied guidance is translated", async ({ page, context, tagged }) => {
    await context.clearPermissions();
    await openTagPage(page, `${tagged.tag.url}?lang=de`);
    await page.getByRole("button", { name: "Meinen aktuellen Standort verwenden" }).click();
    await expect(page.locator("[data-gps-error]")).toContainText(
      "Der Standortzugriff ist für diese Seite blockiert.",
    );
    await expect(page.getByRole("button", { name: "Ort stattdessen beschreiben" })).toBeVisible();
  });

  test("3m. a timeout offers a retry, and the retry can succeed", async ({ page, context, tagged }) => {
    await scriptGeolocation(context, [
      { after: 10, ok: { code: 3 } },
      { after: 10, ok: { code: 3 } },
      { after: 10, ok: { accuracy: 25 } },
    ]);
    await openTagPage(page, tagged.tag.url);
    await page.getByRole("button", { name: "Use my current position" }).click();

    const error = page.locator("[data-gps-error]");
    await expect(error).toContainText("Finding your position took too long.");
    await expect(error).not.toContainText("Settings");
    await error.getByRole("button", { name: "Try again" }).click();

    await expect(page.locator("[data-gps-card]")).toContainText("±25 m");
    await expect(error).toBeHidden();
  });

  test("3n. an unavailable position is reported as such", async ({ page, context, tagged }) => {
    await scriptGeolocation(context, [{ after: 10, ok: { code: 2 } }]);
    await openTagPage(page, tagged.tag.url);
    await page.getByRole("button", { name: "Use my current position" }).click();
    await expect(page.locator("[data-gps-error]")).toContainText("Your position is not available right now.");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test.describe("inside an in-app browser", () => {
    test.use({ userAgent: INSTAGRAM_UA });
    test("3o. the finder is told to open the page in Safari for location", async ({ page, tagged }) => {
      await openTagPage(page, tagged.tag.url);
      await expect(page.locator("[data-gps-webview]")).toContainText("Open this page in Safari");
    });
  });
});
