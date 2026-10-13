/**
 * README screenshots. Opt-in: `pnpm screenshots` (see playwright.config.ts, SCREENSHOTS=1).
 *
 * Runs against its own dev server and a wiped state dir, seeds a fictional traveller ("Alex") through the same
 * paths real people use (owner API and the finder's public forms), then writes page-only WebP files to
 * docs/screenshots/. Every name, place and address below is invented; addresses use example.org / example.test.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import type { Item, ItemInput, Recovery, Tag } from "../src/shared/schemas";
import { finderHeaders } from "./fixtures";

const ORIGIN = "http://localhost:5196";
const OUT_DIR = path.resolve(import.meta.dirname, "../docs/screenshots");
const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const WEBP_QUALITY = 0.9;
const SCALE = 2;

const PHONE = { width: 375, height: 812 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1440, height: 900 };

type Scheme = "light" | "dark";

/** Local wall-clock `YYYY-MM-DDTHH:mm` for tomorrow at the given hour, as the proposal form sends it. */
function tomorrowAt(hour: number, minute = 0): string {
  const d = new Date(Date.now() + 24 * 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:${pad(minute)}`;
}

interface Seeded {
  travelPack: { item: Item; tag: Tag; token: string };
  conversation: { id: string; path: string };
}

async function api<T>(request: APIRequestContext, method: string, url: string, data?: unknown): Promise<T> {
  const res = await request.fetch(`/api${url}`, { method, data, headers: { Origin: ORIGIN } });
  if (!res.ok()) throw new Error(`${method} /api${url} failed with ${res.status()}: ${await res.text()}`);
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/** One simulated finder: own cookie jar and client address, so the per-source abuse caps never interfere. */
async function finderSession(browser: Browser) {
  const context = await browser.newContext({ baseURL: ORIGIN, extraHTTPHeaders: finderHeaders() });
  const request = context.request;
  const post = async (url: string, form: Record<string, string>) => {
    const res = await request.post(url, { form, headers: { Origin: ORIGIN }, maxRedirects: 0 });
    expect(res.status(), `${url}: ${await res.text()}`).toBe(303);
    return res.headers().location as string;
  };
  return {
    async contact(token: string, message: string, name: string): Promise<string> {
      return post(`/t/${token}/contact`, {
        message,
        name,
        lang: "en",
        "cf-turnstile-response": TURNSTILE_DUMMY_TOKEN,
      });
    },
    post,
    close: () => context.close(),
  };
}

async function seed(browser: Browser, request: APIRequestContext): Promise<Seeded> {
  const call = <T>(method: string, url: string, data?: unknown) => api<T>(request, method, url, data);

  await call("PATCH", "/settings", {
    identity: { publicName: "Alex", timezone: "Europe/Lisbon", locale: "en-GB" },
    contact: { email: "alex@example.org" },
    notifications: { emailAddress: "alex@example.org" },
    messages: {
      returnMessage: { en: "Thank you for helping. Let's agree on a safe, public place to meet." },
      lostMessage: { en: "I'm travelling and this is lost. Please write to me here, any time." },
    },
    publicPage: { defaultRewardText: { en: "A coffee and lunch on me." } },
  });

  const newItem = (input: ItemInput) => call<Item>("POST", "/items", input);
  const travelPack = await newItem({
    name: "Black wheeled travel pack (80 L)",
    brand: "Northline",
    model: "Trek 80",
    category: "suitcase",
    description: "Black, detachable day pack, orange zip pulls.",
    estimatedValueCents: 24_900,
    currency: "EUR",
    acquiredOn: "2024-03-12",
    publicTitle: "Black wheeled travel pack",
    publicMessage:
      "It holds everything I need for a month on the road. Please write to me through this page.",
    rewardText: "A coffee and lunch on me.",
  });
  const dayPack = await newItem({
    name: "Day backpack",
    brand: "Fjellbeck",
    model: "Daypack 22",
    category: "backpack",
    estimatedValueCents: 8_900,
    currency: "EUR",
    publicTitle: "Green day backpack",
  });
  const laptop = await newItem({
    name: "Laptop",
    brand: "Lumen",
    model: "Air 14",
    category: "laptop",
    estimatedValueCents: 129_900,
    currency: "EUR",
    publicTitle: "Silver 14-inch laptop",
  });
  const camera = await newItem({
    name: "Camera",
    brand: "Kestrel",
    model: "M5",
    category: "camera",
    estimatedValueCents: 94_000,
    currency: "EUR",
    publicTitle: "Compact mirrorless camera",
  });
  await newItem({ name: "Noise-cancelling headphones", category: "headphones", brand: "Sonora" });
  await newItem({ name: "Document pouch", category: "documents", brand: "Northline" });
  await newItem({ name: "Rain jacket", category: "clothing", brand: "Fjellbeck" });

  const tag = async (item: Item) =>
    (await call<{ tags: Tag[] }>("POST", "/tags", { itemId: item.id, count: 1 })).tags[0] as Tag;
  const packTag = await tag(travelPack);
  const dayPackTag = await tag(dayPack);
  await tag(laptop);
  await tag(camera);
  const tokenOf = (t: Tag) => new URL(t.url).pathname.split("/")[2] as string;

  // The lost pack: a recovery with a short timeline (lost, found by someone, being returned).
  const recovery = await call<Recovery>("POST", `/items/${travelPack.id}/lost`, {
    lostPlace: "Oriente station, Lisbon",
    notes: "Left behind at the lockers hall after the airport train.",
  });

  // Sam finds it, scans the tag, writes a short polite message and shares where it is.
  const sam = await finderSession(browser);
  const samPath = await sam.contact(
    tokenOf(packTag),
    "Hi Alex! I found your black travel pack in the lockers hall at Oriente station. It's safe with me at the information desk.",
    "Sam",
  );
  const summary = (
    await call<{ conversations: { id: string; lastMessagePreview: string | null }[] }>(
      "GET",
      "/conversations",
    )
  ).conversations[0];
  if (!summary) throw new Error("the first conversation is missing");
  await sam.post(`${samPath}/location`, {
    location_label: "Information desk, Oriente station (lockers hall)",
    location_source: "manual",
    location_confirmed: "yes",
  });
  await call("PATCH", `/recoveries/${recovery.id}`, {
    status: "found",
    notes: "A traveller named Sam found it and wrote to me.",
  });
  await call("POST", `/conversations/${summary.id}/messages`, {
    body: "Thank you so much, Sam! I'm 20 minutes away. Could we meet at the desk?",
  });
  await sam.post(`${samPath}/messages`, { message: "Of course. I'm here until 7 pm, so no rush." });
  await sam.post(`${samPath}/proposals`, {
    kind: "public_place",
    place: "Information desk, Oriente station",
    meet_at: tomorrowAt(10, 30),
    meet_tz: "Europe/Lisbon",
    instructions: "Ask for Sam at the desk, I'll wear a blue jacket.",
  });
  const detail = await call<{ proposals: { id: string; status: string }[] }>(
    "GET",
    `/conversations/${summary.id}`,
  );
  const proposal = detail.proposals.find((p) => p.status === "proposed");
  if (!proposal) throw new Error("the finder's proposal is missing");
  await call("POST", `/conversations/${summary.id}/proposals/${proposal.id}/respond`, { action: "accept" });
  await call("PATCH", `/recoveries/${recovery.id}`, {
    status: "returning",
    notes: "Meeting at the information desk tomorrow morning.",
  });
  await call("POST", `/conversations/${summary.id}/messages`, {
    body: "Perfect, see you there. Thanks again!",
  });
  await sam.close();

  // A second, unread conversation on the day backpack, and one finder blocked for spam.
  const kim = await finderSession(browser);
  await kim.contact(
    tokenOf(dayPackTag),
    "Hello, I think I saw a green backpack like this on a bench near Jardim da Estrela. Is it yours?",
    "Kim",
  );
  await kim.close();
  const spammer = await finderSession(browser);
  await spammer.contact(
    tokenOf(dayPackTag),
    "Cheap watches, 70% off today only. Visit example.org/deals now!",
    "",
  );
  await spammer.close();
  const all = (
    await call<{ conversations: { id: string; lastMessagePreview: string | null }[] }>(
      "GET",
      "/conversations",
    )
  ).conversations;
  const spam = all.find((c) => c.lastMessagePreview?.startsWith("Cheap watches"));
  if (!spam) throw new Error("the spam conversation is missing");
  await call("POST", `/conversations/${spam.id}/block`, { reason: "Advertising", duration: "permanent" });

  return {
    travelPack: { item: travelPack, tag: packTag, token: tokenOf(packTag) },
    conversation: { id: summary.id, path: samPath },
  };
}

/** A context for one screenshot: fixed viewport, colour scheme and theme, reduced motion for stable frames. */
async function shotContext(
  browser: Browser,
  viewport: { width: number; height: number },
  scheme: Scheme,
  opts: { touch?: boolean; panel?: boolean } = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    viewport,
    deviceScaleFactor: SCALE,
    colorScheme: scheme,
    reducedMotion: "reduce",
    hasTouch: opts.touch ?? false,
    isMobile: opts.touch ?? false,
    locale: "en-GB",
    timezoneId: "Europe/Lisbon",
    extraHTTPHeaders: opts.panel ? {} : finderHeaders(),
  });
  if (opts.panel) {
    await context.addInitScript((theme) => window.localStorage.setItem("return.theme", theme), scheme);
  }
  return context;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((img) => (img.complete ? undefined : img.decode().catch(() => undefined))),
    ),
  );
  // Blur the focused element so no focus ring is in frame, and let layout and glass settle.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(600);
}

/** Page-only screenshot as lossy-but-sharp WebP, encoded by the browser itself (no extra tooling needed). */
async function capture(browser: Browser, page: Page, name: string): Promise<void> {
  await settle(page);
  const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
  const encoder = await browser.newPage();
  try {
    const base64 = await encoder.evaluate(
      async ({ data, quality }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")?.drawImage(image, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/webp", quality),
        );
        if (!blob) throw new Error("WebP encoding is not available in this browser");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const b of bytes) binary += String.fromCharCode(b);
        return btoa(binary);
      },
      { data: png.toString("base64"), quality: WEBP_QUALITY },
    );
    await writeFile(path.join(OUT_DIR, `${name}.webp`), Buffer.from(base64, "base64"));
  } finally {
    await encoder.close();
  }
}

test("README screenshots", async ({ browser, playwright }) => {
  test.setTimeout(240_000);
  await mkdir(OUT_DIR, { recursive: true });
  for (const file of await readdir(OUT_DIR)) {
    if (file.endsWith(".webp")) await rm(path.join(OUT_DIR, file));
  }
  const owner = await playwright.request.newContext({ baseURL: ORIGIN });
  const seeded = await seed(browser, owner);
  const itemUrl = `/items/${seeded.travelPack.item.id}`;

  // 1. Finder tag page, phone, light.
  {
    const context = await shotContext(browser, PHONE, "light", { touch: true });
    const page = await context.newPage();
    await page.goto(`/t/${seeded.travelPack.token}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Show the form itself, with a draft message, instead of the sticky call-to-action over the intro.
    await page
      .getByLabel(/^Your message/)
      .fill("Hi! I found your travel pack at Oriente station and I'm keeping it safe for you.");
    await page.evaluate(() => document.querySelector("#write")?.scrollIntoView({ block: "start" }));
    await capture(browser, page, "finder-tag-page-light");
    await context.close();
  }

  // 2. Finder conversation, phone, dark.
  {
    const context = await shotContext(browser, PHONE, "dark", { touch: true });
    const page = await context.newPage();
    await page.goto(seeded.conversation.path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page
      .getByRole("heading", { name: "Messages" })
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await capture(browser, page, "finder-conversation-dark");
    await context.close();
  }

  // 3. Owner inventory, desktop, light.
  {
    const context = await shotContext(browser, DESKTOP, "light", { panel: true });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
    await expect(page.getByText("Day backpack").first()).toBeVisible();
    await capture(browser, page, "owner-inventory-light");

    // 5. Inbox thread with location and return plan, desktop, light.
    await page.goto(`/conversations/${seeded.conversation.id}`);
    await expect(page.getByText("Information desk, Oriente station").first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(browser, page, "owner-inbox-thread-light");

    // 6. Quick paper card preview, desktop, light.
    await page.goto("/");
    await page.getByRole("button", { name: /^(Create something new|New)$/ }).click();
    await page
      .getByRole("dialog", { name: "Create", exact: true })
      .getByRole("button", { name: /^Quick card/ })
      .click();
    const sheet = page.getByRole("dialog", { name: "Quick card", exact: true });
    await sheet
      .getByRole("list", { name: "Items" })
      .getByRole("button", { name: /Laptop/ })
      .click();
    await expect(sheet.getByRole("button", { name: "Download PNG" })).toBeVisible();
    // Scroll the sheet so the preview card is in view but the proof notice (it names the local address) is not.
    await sheet.evaluate((el) => {
      for (const node of el.querySelectorAll("*"))
        if (node.scrollHeight > node.clientHeight + 40)
          node.scrollTop = node.scrollHeight - node.clientHeight - 140;
    });
    await capture(browser, page, "owner-quick-card-light");
    await context.close();
  }

  // 4. Item detail with the recovery timeline, desktop, dark.
  {
    const context = await shotContext(browser, DESKTOP, "dark", { panel: true });
    const page = await context.newPage();
    await page.goto(itemUrl);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await capture(browser, page, "owner-item-recovery-dark");
    await context.close();
  }

  // 7. Owner panel on a phone, dark (Liquid Glass tab bar and header).
  {
    const context = await shotContext(browser, PHONE, "dark", { panel: true, touch: true });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 300));
    await capture(browser, page, "owner-inventory-phone-dark");
    await context.close();
  }

  // 8. Settings, tablet, light.
  {
    const context = await shotContext(browser, TABLET, "light", { panel: true });
    const page = await context.newPage();
    await page.goto("/settings/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await capture(browser, page, "owner-settings-privacy-light");
    await context.close();
  }

  await owner.dispose();
});
