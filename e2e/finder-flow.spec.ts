import {
  expect,
  newFinderContext,
  ORIGIN,
  openTagPage,
  requireTurnstileNetwork,
  submitContactForm,
  test,
  unique,
  waitForTurnstile,
} from "./fixtures";

/** Scenario 2. A finder with only a phone and a tag URL reaches the owner, in their own language. */

test("2a. the tag page switches between English, German and Spanish", async ({ page, tagged }) => {
  await openTagPage(page, tagged.tag.url);
  await expect(page.getByRole("heading", { name: "Write to the owner" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  const languages = page.getByRole("navigation", { name: "Language" });
  await languages.getByRole("link", { name: "Deutsch" }).click();
  await expect(page).toHaveURL(/\?lang=de$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("heading", { name: "Dem Eigentümer schreiben" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nachricht senden" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Write to the owner" })).toHaveCount(0);

  await page.getByRole("navigation", { name: "Sprache" }).getByRole("link", { name: "Español" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { name: "Escribe al propietario" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar mensaje" })).toBeVisible();
  await expect(page.getByLabel("Tu mensaje")).toBeVisible();

  // The public title is data, not copy: it is identical in every language.
  await expect(page.getByRole("heading", { level: 1, name: tagged.publicTitle })).toBeVisible();
});

test("2b. a described place needs no extra consent step and is stored as typed", async ({
  page,
  owner,
  tagged,
}) => {
  await requireTurnstileNetwork();
  const message = unique("Left at the cafe");
  const place = unique("Cafe Central, Vienna");
  await openTagPage(page, tagged.tag.url);
  await page.getByLabel("Your message").fill(message);
  await page.getByLabel(/^Place or description/).fill(place);
  // One privacy statement, no redundant checkbox.
  await expect(page.getByText("shared only with the owner of this item")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await waitForTurnstile(page);
  expect(await submitContactForm(page, "Send message")).toBe(303);

  const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
  const detail = await owner.conversation(summary?.id ?? "");
  expect(detail.locations[0]).toMatchObject({ source: "manual", label: place, lat: null, lng: null });
});

test("2c. a finder writes in German with a described place and lands on a private page", async ({
  page,
  context,
  owner,
  tagged,
}) => {
  await requireTurnstileNetwork();
  const message = unique("Rucksack am Bahnhof gefunden");
  const place = unique("Bahnhof Hauptausgang");
  await openTagPage(page, `${tagged.tag.url}?lang=de`);
  await page.getByLabel("Ihre Nachricht").fill(message);
  await page.getByLabel(/^Ort oder Beschreibung/).fill(place);
  await waitForTurnstile(page);
  expect(await submitContactForm(page, "Nachricht senden")).toBe(303);

  // Redirected to the capability URL (256-bit secret), in the language the finder chose.
  await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}$/);
  const conversationUrl = page.url();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("heading", { level: 1, name: tagged.publicTitle })).toBeVisible();
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByText(place)).toBeVisible();

  // Reloading keeps working and does not resend anything.
  await page.reload();
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByText(message)).toHaveCount(1);

  // The owner received exactly this: message, manual location, finder language.
  const summary = (await owner.listConversations()).find((c) => c.lastMessagePreview === message);
  expect(summary, "conversation is visible to the owner").toBeDefined();
  const detail = await owner.conversation(summary?.id ?? "");
  expect(detail.conversation.finderLang).toBe("de");
  expect(detail.locations).toHaveLength(1);
  expect(detail.locations[0]).toMatchObject({ source: "manual", label: place, lat: null, lng: null });

  // The `rc` cookie is what lets the tag page offer "continue": HttpOnly, so page scripts cannot read it.
  const cookie = (await context.cookies()).find((c) => c.name === "__Host-rc");
  expect(cookie, "rc cookie").toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");
  expect(conversationUrl.endsWith(cookie?.value ?? "missing")).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("rc=");

  await page.goto(`${tagged.tag.url}?lang=en`);
  const resume = page.getByRole("link", { name: "Continue your conversation" });
  await expect(resume).toBeVisible();
  await expect(resume).toHaveAttribute("href", new URL(conversationUrl).pathname);
  await resume.click();
  await expect(page).toHaveURL(conversationUrl);
  await expect(page.getByText(message)).toBeVisible();
});

test("2d. someone without the cookie is not offered the conversation", async ({
  browser,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  await startConversation(tagged);
  const stranger = await newFinderContext(browser);
  const page = await stranger.newPage();
  await openTagPage(page, tagged.tag.url);
  await expect(page.getByRole("link", { name: "Continue your conversation" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Write to the owner" })).toBeVisible();
  await stranger.close();
});

test("2e. a submission without a Turnstile token is rejected and stores nothing", async ({
  request,
  owner,
  tagged,
}) => {
  const message = unique("Bot message");
  const res = await request.post(`/t/${tagged.token}/contact`, {
    form: { message, lang: "en" },
    headers: { Origin: ORIGIN },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(403);
  expect(await res.text()).toContain("The check could not be completed");
  expect(res.headers()["set-cookie"] ?? "").not.toContain("rc=");
  expect((await owner.listConversations()).filter((c) => c.lastMessagePreview === message)).toHaveLength(0);
});

test("2f. a cross-site form post is rejected", async ({ request, tagged }) => {
  const res = await request.post(`/t/${tagged.token}/contact`, {
    form: { message: unique("CSRF"), lang: "en", "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" },
    headers: { Origin: "https://evil.example" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(403);
});
