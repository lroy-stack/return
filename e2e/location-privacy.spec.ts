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
 * Scenario 3. Location privacy: the browser is asked for the position only after an explicit tap,
 * the finder sees exactly what would be shared, and nothing leaves the device until they confirm.
 */

const POSITION = { latitude: 38.7223, longitude: -9.1393, accuracy: 35 };

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation(POSITION);
  await countGeolocationCalls(context);
});

test("3a. the position is requested only after the tap, then previewed with its accuracy", async ({
  page,
  tagged,
}) => {
  const contactPosts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") contactPosts.push(r.url());
  });

  await openTagPage(page, tagged.tag.url);
  const share = page.getByRole("button", { name: "Use my current position" });
  await expect(share).toBeVisible();
  await page.getByLabel("Your message").fill(unique("Typing a message first"));
  expect(await geolocationCalls(page), "no geolocation call before the tap").toBe(0);
  await expect(page.getByRole("heading", { name: "Your position" })).toBeHidden();

  await share.click();
  const preview = page.locator("[data-gps-preview]");
  await expect(preview).toBeVisible();
  expect(await geolocationCalls(page)).toBe(1);
  await expect(preview.getByText("38.72230, -9.13930")).toBeVisible();
  await expect(preview).toContainText("±35");
  await expect(preview).toContainText("metres");
  await expect(preview).toContainText("only with the owner of this item");

  // Previewing is not sharing: the form fields stay empty and nothing was posted.
  await expect(page.locator('input[name="location_lat"]')).toHaveValue("");
  await expect(page.locator('input[name="location_lng"]')).toHaveValue("");
  await expect(page.getByRole("checkbox", { name: /I agree to share/ })).not.toBeChecked();
  expect(contactPosts).toEqual([]);
});

test("3b. cancelling the preview clears every trace of the position", async ({ page, tagged }) => {
  await openTagPage(page, tagged.tag.url);
  await page.getByRole("button", { name: "Use my current position" }).click();
  const preview = page.locator("[data-gps-preview]");
  await expect(preview).toBeVisible();

  await preview.getByRole("button", { name: "Cancel" }).click();

  await expect(preview).toBeHidden();
  await expect(page.locator("[data-gps-status]")).toHaveText("");
  for (const field of ["location_lat", "location_lng", "location_accuracy"]) {
    await expect(page.locator(`input[name="${field}"]`), field).toHaveValue("");
  }
  await expect(page.locator('input[name="location_source"]')).toHaveValue("manual");
  await expect(page.getByRole("checkbox", { name: /I agree to share/ })).not.toBeChecked();
  expect(await geolocationCalls(page), "cancelling must not ask again").toBe(1);
});

test("3c. after cancelling, the message reaches the owner with no location at all", async ({
  page,
  owner,
  tagged,
}) => {
  await requireTurnstileNetwork();
  const message = unique("Cancelled the location");
  await openTagPage(page, tagged.tag.url);
  await page.getByRole("button", { name: "Use my current position" }).click();
  await page.locator("[data-gps-preview]").getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel("Your message").fill(message);
  await waitForTurnstile(page);

  expect(await submitContactForm(page, "Send message")).toBe(303);

  await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared places" })).toHaveCount(0);
  const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
  const detail = await owner.conversation(summary?.id ?? "");
  expect(detail.locations).toEqual([]);
});

test("3d. confirming shares exactly the previewed point and accuracy", async ({ page, owner, tagged }) => {
  await requireTurnstileNetwork();
  const message = unique("Confirmed the location");
  await openTagPage(page, tagged.tag.url);
  await page.getByLabel("Your message").fill(message);
  await page.getByRole("button", { name: "Use my current position" }).click();
  await page.locator("[data-gps-preview]").getByRole("button", { name: "Confirm" }).click();

  await expect(page.locator("[data-gps-status]")).toContainText("Position added (±35 metres)");
  await expect(page.getByRole("checkbox", { name: /I agree to share/ })).toBeChecked();
  await waitForTurnstile(page);
  expect(await submitContactForm(page, "Send message")).toBe(303);

  await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText("38.72230, -9.13930")).toBeVisible();
  const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
  const detail = await owner.conversation(summary?.id ?? "");
  expect(detail.locations).toHaveLength(1);
  expect(detail.locations[0]).toMatchObject({ source: "gps", lat: 38.7223, lng: -9.1393, accuracyM: 35 });
});

test("3e. a refused permission explains itself and shares nothing", async ({ page, context, tagged }) => {
  await context.clearPermissions();
  await openTagPage(page, tagged.tag.url);

  await page.getByRole("button", { name: "Use my current position" }).click();

  await expect(page.locator("[data-gps-status]")).toContainText("Location access was not allowed");
  await expect(page.locator("[data-gps-preview]")).toBeHidden();
  await expect(page.locator('input[name="location_lat"]')).toHaveValue("");
  await expect(page.getByRole("button", { name: "Use my current position" })).toBeEnabled();
  // The manual alternative is still there.
  await expect(page.getByLabel(/^Place or description/)).toBeVisible();
});
