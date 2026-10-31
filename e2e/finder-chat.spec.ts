import type { APIRequestContext, Page } from "@playwright/test";
import {
  expect,
  horizontalOverflow,
  ORIGIN,
  openTagPage,
  requireTurnstileNetwork,
  test,
  unique,
  waitForTurnstile,
} from "./fixtures";

/**
 * Scenario 14. The finder's conversation behaves like a chat: one timeline, the composer anchored at the bottom,
 * sends and refreshes in place, and keeps the reader's position. Without JavaScript the forms still work.
 */

async function ownerSays(request: APIRequestContext, id: string, body: string): Promise<void> {
  const res = await request.post(`/api/conversations/${id}/messages`, {
    data: { body },
    headers: { Origin: ORIGIN },
  });
  expect(res.ok(), `owner message: ${res.status()}`).toBe(true);
}

/** Pads the thread so it overflows the viewport. */
async function fillThread(request: APIRequestContext, id: string, count = 25): Promise<void> {
  for (let i = 1; i <= count; i++) await ownerSays(request, id, `Filler ${i} ${unique("f")}`);
}

const thread = (page: Page) => page.locator("[data-thread]");
const composer = (page: Page) => page.getByLabel("Your reply", { exact: true });
const distanceFromBottom = (page: Page) =>
  thread(page).evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

test.describe("chat layout", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("14a. the page is one screen: the thread scrolls, the composer stays at the bottom", async ({
    page,
    request,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await fillThread(request, conversation.id);
    await page.goto(conversation.path);

    await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
    const facts = await page.evaluate(() => ({
      pageHeight: document.scrollingElement?.scrollHeight ?? 0,
      viewport: innerHeight,
      composerBottom: document.querySelector(".composer")?.getBoundingClientRect().bottom ?? 0,
    }));
    expect(facts.pageHeight, "the page itself does not scroll").toBeLessThanOrEqual(facts.viewport);
    expect(facts.composerBottom, "composer is inside the viewport").toBeLessThanOrEqual(facts.viewport);
    expect(await distanceFromBottom(page), "opens at the newest message").toBeLessThanOrEqual(2);
    expect(await thread(page).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    const send = page.getByRole("button", { name: "Send reply" });
    const box = await send.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(composer(page)).toHaveAttribute("enterkeyhint", "send");
  });

  test("14b. sending appends the message in place and keeps the viewport at the bottom", async ({
    page,
    request,
    owner,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await fillThread(request, conversation.id);
    await page.goto(conversation.path);
    await page.evaluate(() => {
      (window as unknown as { __stay: boolean }).__stay = true;
    });
    const message = unique("Sent from the chat");

    await composer(page).fill(message);
    await page.getByRole("button", { name: "Send reply" }).click();

    await expect(page.locator("[data-timeline]").getByText(message)).toBeVisible();
    await expect(composer(page)).toHaveValue("");
    await expect(composer(page)).toBeFocused();
    expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => (window as unknown as { __stay?: boolean }).__stay), "no reload").toBe(
      true,
    );
    expect(page.url()).not.toContain("#");
    const stored = (await owner.conversation(conversation.id)).messages.filter((m) => m.body === message);
    expect(stored).toHaveLength(1);
  });

  test("14c. Enter sends, Shift+Enter makes a new line, and the field grows up to five lines", async ({
    page,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await page.goto(conversation.path);
    const field = composer(page);
    const height = async () => (await field.boundingBox())?.height ?? 0;

    await field.fill("one");
    const single = await height();
    await field.press("Shift+Enter");
    await field.pressSequentially("two");
    await field.press("Shift+Enter");
    await field.pressSequentially("three");
    expect(await height()).toBeGreaterThan(single);
    for (let i = 0; i < 10; i++) {
      await field.press("Shift+Enter");
      await field.pressSequentially("more");
    }
    const grown = await height();
    expect(grown, "capped at about five lines").toBeLessThan(single * 5);
    expect(grown).toBeGreaterThan(single * 2.5);

    const text = unique("Enter sends");
    await field.fill(text);
    await field.press("Enter");
    await expect(page.locator("[data-timeline]").getByText(text)).toBeVisible();
  });

  test("14d. a message from the owner appears in place without a reload", async ({
    page,
    request,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await page.goto(conversation.path);
    await page.evaluate(() => {
      (window as unknown as { __stay: boolean }).__stay = true;
    });
    const reply = unique("Owner reply");

    await ownerSays(request, conversation.id, reply);

    await expect(page.locator("[data-timeline]").getByText(reply)).toBeVisible({ timeout: 25_000 });
    expect(await page.evaluate(() => (window as unknown as { __stay?: boolean }).__stay)).toBe(true);
    await expect(page.locator("[data-new-pill]")).toBeHidden();
  });

  test("14e. while reading history a new message does not move the thread: a pill offers to jump", async ({
    page,
    request,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await fillThread(request, conversation.id);
    await page.goto(conversation.path);
    await thread(page).evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect.poll(() => thread(page).evaluate((el) => el.scrollTop)).toBe(0);
    const reply = unique("Arrived while reading");

    await ownerSays(request, conversation.id, reply);

    const pill = page.getByRole("button", { name: "New message" });
    await expect(pill).toBeVisible({ timeout: 25_000 });
    expect(await thread(page).evaluate((el) => el.scrollTop), "the reader's position is kept").toBe(0);
    await pill.click();
    await expect(page.locator("[data-timeline]").getByText(reply)).toBeInViewport();
    expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);
    await expect(pill).toBeHidden();
  });

  test("14f. places and plans live in the same timeline; a plan is answered in place", async ({
    page,
    request,
    owner,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged, unique("Hello"), {
      lat: 38.7,
      lng: -9.1,
      accuracyM: 30,
    });
    const place = unique("Hotel Sol reception");
    await owner.propose(conversation.id, { kind: "hotel_reception", place });
    await ownerSays(request, conversation.id, unique("After the plan"));
    await page.goto(conversation.path);
    await page.evaluate(() => {
      (window as unknown as { __stay: boolean }).__stay = true;
    });

    const items = page.locator("[data-timeline] > li[data-id]");
    await expect(items).toHaveCount(4);
    await expect(page.locator("[data-timeline] > li.day").first()).toHaveText(/Today/);
    await expect(items.nth(1)).toContainText("Shared by you");
    const plan = items.filter({ hasText: place });
    await expect(plan).toContainText("Proposed by the owner");
    await plan.getByRole("button", { name: "Accept" }).click();

    await expect(plan).toContainText("Agreed");
    await expect(plan.getByRole("button")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __stay?: boolean }).__stay)).toBe(true);
    expect((await owner.conversation(conversation.id)).proposals[0]?.status).toBe("accepted");
  });

  test("14g. the privacy link and the share/copy actions are reachable", async ({
    page,
    context,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    await context.addInitScript(() => {
      (window as unknown as { __shared: unknown[] }).__shared = [];
      navigator.share = (data?: ShareData) => {
        (window as unknown as { __shared: unknown[] }).__shared.push(data);
        return Promise.resolve();
      };
    });
    const conversation = await startConversation(tagged);
    await page.goto(conversation.path);
    await page.getByText("Private link and privacy").click();

    await page.getByRole("button", { name: "Share link" }).click();
    const shared = await page.evaluate(() => (window as unknown as { __shared: { url: string }[] }).__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0]?.url).toContain(conversation.path);

    const privacy = page.getByRole("link", { name: "Read how your data is handled" });
    const box = await privacy.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
});

test.describe("chat when a send does not go through", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("14o. a rate-limited send keeps the text and the chat, and is not repeated", async ({
    page,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    let posts = 0;
    await page.route("**/messages", (route) => {
      posts += 1;
      return route.fulfill({
        status: 429,
        contentType: "text/html",
        body: "<!doctype html><title>We cannot take your request right now.</title>",
      });
    });
    await page.goto(conversation.path);
    const text = unique("Do not lose me");

    await composer(page).fill(text);
    await page.getByRole("button", { name: "Send reply" }).click();

    await expect(page.locator("[data-compose-error]")).toContainText("Could not send");
    await expect(composer(page)).toHaveValue(text);
    expect(page.url()).toContain(conversation.path);
    expect(posts, "the write is not repeated by a native submit").toBe(1);
  });

  test("14p. a failure after the write succeeded does not duplicate the message", async ({
    page,
    owner,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    let posts = 0;
    await page.route("**/messages", async (route) => {
      posts += 1;
      await route.fetch();
      await route.fulfill({ status: 503, contentType: "text/plain", body: "down" });
    });
    await page.goto(conversation.path);
    const text = unique("Written once");

    await composer(page).fill(text);
    await page.getByRole("button", { name: "Send reply" }).click();

    await expect(page.locator("[data-compose-error]")).toContainText("Could not send");
    await expect(page.locator("[data-timeline]").getByText(text)).toHaveCount(1, { timeout: 15_000 });
    expect(posts).toBe(1);
    const stored = (await owner.conversation(conversation.id)).messages.filter((m) => m.body === text);
    expect(stored).toHaveLength(1);
  });

  test("14q. the composer is read-only while sending, so text typed meanwhile is never wiped", async ({
    page,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await page.route("**/messages", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.continue();
    });
    await page.goto(conversation.path);

    await composer(page).fill(unique("Slow send"));
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(composer(page)).toHaveJSProperty("readOnly", true);
    await expect(composer(page)).toHaveJSProperty("readOnly", false);
    await expect(composer(page)).toHaveValue("");
  });

  test("14r. a conversation that is closed and then reopened gets its composer back", async ({
    page,
    request,
    tagged,
    startConversation,
  }) => {
    test.setTimeout(90_000);
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await page.goto(conversation.path);
    const call = (action: string) =>
      request.post(`/api/conversations/${conversation.id}/${action}`, {
        data: {},
        headers: { Origin: ORIGIN },
      });

    expect((await call("close")).ok()).toBe(true);
    await expect(page.getByText("This conversation is closed.")).toBeVisible({ timeout: 25_000 });
    await expect(composer(page)).toHaveCount(0);

    expect((await call("reopen")).ok()).toBe(true);
    await expect(composer(page)).toBeVisible({ timeout: 25_000 });
  });
});

test.describe("chat on small and short screens", () => {
  test("14h. 320x568: neither finder page scrolls sideways", async ({ page, tagged, startConversation }) => {
    await requireTurnstileNetwork();
    await page.setViewportSize({ width: 320, height: 568 });
    await openTagPage(page, tagged.tag.url);
    await waitForTurnstile(page);
    for (const label of ["tag page"]) {
      const { scrollWidth, viewportWidth, offenders } = await horizontalOverflow(page);
      expect(scrollWidth, `${label}, sticking out: ${offenders}`).toBeLessThanOrEqual(viewportWidth);
    }
    const conversation = await startConversation(tagged);
    await page.goto(conversation.path);
    await page.getByLabel("Share a place or propose a return plan").click();
    const { scrollWidth, viewportWidth, offenders } = await horizontalOverflow(page);
    expect(scrollWidth, `conversation page, sticking out: ${offenders}`).toBeLessThanOrEqual(viewportWidth);
    const row = await page.locator(".composer").boundingBox();
    expect(row?.x ?? 0).toBeGreaterThanOrEqual(0);
    expect((row?.x ?? 0) + (row?.width ?? 0)).toBeLessThanOrEqual(320);
  });

  test("14i. landscape phone: the composer is fully visible and the thread keeps room", async ({
    page,
    request,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    await page.setViewportSize({ width: 667, height: 375 });
    const conversation = await startConversation(tagged);
    await fillThread(request, conversation.id, 10);
    await page.goto(conversation.path);

    await expect(composer(page)).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Send reply" })).toBeInViewport({ ratio: 1 });
    const room = await thread(page).evaluate((el) => el.clientHeight);
    expect(room, "the thread keeps at least 120 px").toBeGreaterThanOrEqual(120);
  });

  test("14j. every field on both finder pages computes to at least 16 px (no iOS zoom on focus)", async ({
    page,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const small = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
          .map((el) => ({
            name: el.getAttribute("name") ?? el.id,
            size: Number.parseFloat(getComputedStyle(el).fontSize),
          }))
          .filter((f) => f.size < 16),
      );
    await openTagPage(page, tagged.tag.url);
    expect(await small(), "tag page").toEqual([]);
    const conversation = await startConversation(tagged);
    await page.goto(conversation.path);
    expect(await small(), "conversation page").toEqual([]);
  });
});

test.describe("tag page", () => {
  test("14k. no floating bar covers the form, and the privacy link is a 44 px target", async ({
    page,
    tagged,
  }) => {
    await openTagPage(page, tagged.tag.url);
    await expect(page.locator(".action-bar")).toHaveCount(0);
    const fixed = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => getComputedStyle(el).position === "fixed" && !el.matches("body::before"))
        .map((el) => el.className),
    );
    expect(fixed, "nothing is fixed over the content").toEqual([]);
    const box = await page.getByRole("link", { name: "Privacy" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("14l. landscape: the header leaves room for the form", async ({ page, tagged }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await openTagPage(page, tagged.tag.url);
    const header = await page.locator(".topbar").boundingBox();
    expect(header?.height ?? 99).toBeLessThanOrEqual(80);
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 375, height: 667 } });

  test("14m. a reply posts, redirects to the newest message and lands on it", async ({
    page,
    request,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await fillThread(request, conversation.id);
    await page.goto(conversation.path);
    const message = unique("No script reply");

    await composer(page).fill(message);
    await page.getByRole("button", { name: "Send reply" }).click();

    await expect(page).toHaveURL(/\/c\/[A-Za-z0-9_-]{43}#i-[0-9a-f-]{36}$/);
    await expect(page.getByText(message)).toBeInViewport();
  });

  test("14n. the plus menu opens natively and a place can be shared", async ({
    page,
    owner,
    tagged,
    startConversation,
  }) => {
    await requireTurnstileNetwork();
    const conversation = await startConversation(tagged);
    await page.goto(conversation.path);
    const place = unique("By the fountain");

    await page.getByLabel("Share a place or propose a return plan").click();
    await page.getByText("Share where you are").click();
    await page.getByLabel(/^Place or description/).fill(place);
    await page.getByRole("button", { name: "Share location" }).click();

    await expect(page.getByText(place)).toBeVisible();
    expect((await owner.conversation(conversation.id)).locations[0]).toMatchObject({ label: place });
  });
});
