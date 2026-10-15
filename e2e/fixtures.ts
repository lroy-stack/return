/**
 * Shared fixtures and helpers for the end-to-end suite.
 *
 * Local D1 is shared between runs and with other agents, so every test creates its own data through
 * the owner API (dev auth bypass on loopback) and uses unique names. Nothing here relies on test order.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  test as base,
  expect,
  type Locator,
  type Page,
  type PlaywrightWorkerArgs,
} from "@playwright/test";
import type {
  ConversationDetail,
  ConversationSummary,
  Item,
  ItemDetail,
  ItemInput,
  Proposal,
  ProposalInput,
  Tag,
} from "../src/shared/schemas";

export const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? 5199}`;
const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";
/** Any non-empty value passes against Cloudflare's always-pass test secret used in `.dev.vars`. */
const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz";

export { expect };

/** Unique, readable marker so assertions can never match another test's data. */
export function unique(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

/** A well-formed tag token (26 Crockford chars) that no tag owns. */
export function randomTagToken(): string {
  return Array.from(randomBytes(26), (b) => CROCKFORD[b % 32]).join("");
}

/** A well-formed finder secret (43 base64url chars) that no conversation owns. */
export function randomSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface OwnerApi {
  createItem(overrides?: Partial<ItemInput>): Promise<Item>;
  item(itemId: string): Promise<ItemDetail>;
  createTag(itemId: string | null): Promise<Tag>;
  markLost(itemId: string): Promise<void>;
  markRecovered(itemId: string): Promise<void>;
  revokeTag(tagId: string): Promise<void>;
  listConversations(): Promise<ConversationSummary[]>;
  conversation(id: string): Promise<ConversationDetail>;
  propose(conversationId: string, input: ProposalInput): Promise<Proposal>;
  qrSvg(tagId: string): Promise<string>;
}

function ownerApi(request: APIRequestContext): OwnerApi {
  async function call<T>(method: string, path: string, data?: unknown): Promise<T> {
    const res = await request.fetch(`/api${path}`, { method, data, headers: { Origin: ORIGIN } });
    if (!res.ok()) throw new Error(`${method} /api${path} failed with ${res.status()}: ${await res.text()}`);
    return (res.status() === 204 ? undefined : await res.json()) as T;
  }
  return {
    createItem: (overrides = {}) =>
      call<Item>("POST", "/items", { name: unique("Item"), category: "backpack", ...overrides }),
    item: (itemId) => call<ItemDetail>("GET", `/items/${itemId}`),
    createTag: async (itemId) =>
      (await call<{ tags: Tag[] }>("POST", "/tags", { itemId, count: 1 })).tags[0] as Tag,
    markLost: async (itemId) => void (await call("POST", `/items/${itemId}/lost`, {})),
    markRecovered: async (itemId) => void (await call("POST", `/items/${itemId}/recovered`, {})),
    revokeTag: async (tagId) => void (await call("POST", `/tags/${tagId}/revoke`)),
    listConversations: async () =>
      (await call<{ conversations: ConversationSummary[] }>("GET", "/conversations")).conversations,
    conversation: (id) => call<ConversationDetail>("GET", `/conversations/${id}`),
    propose: (conversationId, input) =>
      call<Proposal>("POST", `/conversations/${conversationId}/proposals`, input),
    qrSvg: async (tagId) => {
      const res = await request.get(`/api/tags/${tagId}/qr.svg`);
      expect(res.status(), "QR download status").toBe(200);
      expect(res.headers()["content-type"]).toContain("image/svg+xml");
      return res.text();
    },
  };
}

/** Everything a finder test needs: an item with distinctive private fields, one active tag. */
export interface Tagged {
  item: Item;
  tag: Tag;
  /** Last path segment of the tag URL. */
  token: string;
  /** Distinctive private values that must never reach the finder pages. */
  secrets: { name: string; brand: string; model: string; serial: string; notes: string };
  publicTitle: string;
}

export interface FinderConversation {
  /** Absolute path of the finder's private page, e.g. `/c/<secret>`. */
  path: string;
  secret: string;
  /** Conversation id as the owner API knows it. */
  id: string;
}

/** A position the finder confirmed to share. */
export interface GpsFix {
  lat: number;
  lng: number;
  accuracyM: number;
}

interface Fixtures {
  owner: OwnerApi;
  /** An item (private fields filled in, public title set) with one active tag. */
  tagged: Tagged;
  /** Starts a conversation for a tag the way a finder's browser would, without driving the UI. */
  startConversation: (tagged: Tagged, message?: string, gps?: GpsFix) => Promise<FinderConversation>;
}

/**
 * A fresh simulated client address per finder (IPv6 documentation range, random /64), so the
 * production abuse caps (3 conversations per source per day) apply per simulated person even
 * though every request really comes from localhost. Cloudflare sets this header in production.
 */
export function finderHeaders(): Record<string, string> {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16);
  return { "CF-Connecting-IP": `2001:db8:${hex()}:${hex()}::1` };
}

/**
 * Adds the simulated client address to requests for this app only. Third-party requests
 * (the Turnstile widget on challenges.cloudflare.com) must not carry CF-Connecting-IP:
 * Cloudflare rejects that header from clients.
 */
export async function asFinder(context: BrowserContext): Promise<BrowserContext> {
  const headers = finderHeaders();
  await context.route(`${ORIGIN}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), ...headers } }),
  );
  return context;
}

export async function newFinderContext(browser: Browser): Promise<BrowserContext> {
  return asFinder(await browser.newContext());
}

export const test = base.extend<Fixtures>({
  context: async ({ context }, use) => {
    await use(await asFinder(context));
  },

  owner: async ({ request }, use) => {
    await use(ownerApi(request));
  },

  tagged: async ({ owner }, use) => {
    const mark = unique("T");
    const secrets = {
      name: `Private name ${mark}`,
      brand: `Brandx${mark}`,
      model: `Modelx${mark}`,
      serial: `SERIAL-${mark}`,
      notes: `Private note ${mark}: passport is in the lining`,
    };
    const publicTitle = `Blue backpack ${mark}`;
    const item = await owner.createItem({
      name: secrets.name,
      brand: secrets.brand,
      model: secrets.model,
      serialNumber: secrets.serial,
      privateNotes: secrets.notes,
      publicTitle,
    });
    const tag = await owner.createTag(item.id);
    await use({ item, tag, token: new URL(tag.url).pathname.split("/")[2] as string, secrets, publicTitle });
  },

  startConversation: async ({ playwright, owner }, use) => {
    await use((tagged, message, gps) => startConversation(playwright, owner, tagged, message, gps));
  },
});

async function startConversation(
  playwright: PlaywrightWorkerArgs["playwright"],
  owner: OwnerApi,
  tagged: Tagged,
  message = unique("Found it near the station"),
  gps?: GpsFix,
): Promise<FinderConversation> {
  // Fresh cookie jar per finder: the `rc` cookie must not leak between simulated people.
  const finder = await playwright.request.newContext({ baseURL: ORIGIN, extraHTTPHeaders: finderHeaders() });
  try {
    const res = await finder.post(`/t/${tagged.token}/contact`, {
      form: {
        message,
        lang: "en",
        "cf-turnstile-response": TURNSTILE_DUMMY_TOKEN,
        ...(gps && {
          location_source: "gps",
          location_lat: String(gps.lat),
          location_lng: String(gps.lng),
          location_accuracy: String(gps.accuracyM),
          location_confirmed: "yes",
        }),
      },
      headers: { Origin: ORIGIN },
      maxRedirects: 0,
    });
    if (res.status() === 403) throw new Error(SITEVERIFY_HINT);
    expect(res.status(), `contact form: ${await res.text()}`).toBe(303);
    const path = res.headers().location as string;
    const secret = path.split("/")[2] as string;
    const cookies = (await finder.storageState()).cookies;
    expect(cookies.find((c) => c.name === "__Host-rc")?.value, "rc cookie is set on the redirect").toBe(
      secret,
    );
    const summary = (await owner.listConversations()).find(
      (c) => c.lastMessagePreview === message.slice(0, 160),
    );
    if (!summary) throw new Error("The new conversation is not visible to the owner");
    return { path, secret, id: summary.id };
  } finally {
    await finder.dispose();
  }
}

const SITEVERIFY_HINT =
  "The Worker rejected the Turnstile token (HTTP 403). With the always-pass test keys that only happens when the " +
  "local Worker (workerd) cannot reach https://challenges.cloudflare.com/turnstile/v0/siteverify within 5 s " +
  "(offline, firewalled or sandboxed network). Server logs show `turnstile failed ... TimeoutError`. " +
  "Run the e2e suite on a machine where the dev Worker has outbound internet access.";

let turnstileReachable: Promise<void> | undefined;

/**
 * The Turnstile widget script and siteverify are real network calls (always-pass test keys).
 * Fail fast with an explanation instead of hanging when the machine is offline.
 */
export function requireTurnstileNetwork(): Promise<void> {
  turnstileReachable ??= probeTurnstile();
  return turnstileReachable;
}

async function probeTurnstile(): Promise<void> {
  let lastError: unknown;
  // A few quick attempts: a single dropped connection is not "offline".
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(TURNSTILE_SCRIPT, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Cannot reach ${TURNSTILE_SCRIPT} (${String(lastError)}). The finder contact form needs Cloudflare's Turnstile ` +
      "test widget and siteverify endpoint; run these e2e tests with internet access.",
  );
}

/** Waits until the (always-pass) Turnstile widget has put a token into the form. */
export async function waitForTurnstile(page: Page): Promise<void> {
  const token = page.locator('input[name="cf-turnstile-response"]');
  try {
    await expect(token).toHaveValue(/.+/, { timeout: 30_000 });
  } catch (err) {
    throw new Error(
      `The Turnstile widget never produced a token. Its script loads from ${TURNSTILE_SCRIPT}; ` +
        `check the network connection. Original error: ${String(err)}`,
    );
  }
}

/**
 * Clicks the submit button of the first-contact form and returns the HTTP status of the POST
 * (303 on success). A 403 is reported with an explanation of the usual cause (no outbound network).
 */
export async function submitContactForm(page: Page, button: string | RegExp): Promise<number> {
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/contact")),
    page.getByRole("button", { name: button }).click(),
  ]);
  if (response.status() === 403) throw new Error(SITEVERIFY_HINT);
  return response.status();
}

/** Opens a tag page in the given page and waits for the form to be ready to submit. */
export async function openTagPage(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

/** Counts every call the page makes to the Geolocation API, from the very first script. */
export async function countGeolocationCalls(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    for (const name of ["getCurrentPosition", "watchPosition"] as const) {
      const original = Geolocation.prototype[name];
      Geolocation.prototype[name] = function (this: Geolocation, ...args: never[]) {
        w.__geoCalls += 1;
        return (original as (...a: never[]) => unknown).apply(this, args) as never;
      };
    }
  });
}

export function geolocationCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);
}

/**
 * Horizontal overflow of the current page. Mobile browsers widen `window.innerWidth` to fit overflowing
 * content, so the configured viewport width is the reliable reference; `innerWidth` is returned as well.
 * `offenders` names the innermost elements and the frames that end past it, so a failure says what sticks out.
 * Frames are found through Playwright: a widget's iframe may sit in a closed shadow root page scripts cannot see.
 */
export async function horizontalOverflow(
  page: Page,
): Promise<{ scrollWidth: number; innerWidth: number; viewportWidth: number; offenders: string }> {
  const limit = page.viewportSize()?.width;
  const metrics = await page.evaluate((limit) => {
    const edge = (limit ?? window.innerWidth) + 0.5;
    const name = (el: Element) =>
      el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + [...el.classList].map((c) => `.${c}`).join("");
    const wide = [...document.body.querySelectorAll("*")].filter(
      (el) => el.getBoundingClientRect().right > edge,
    );
    const innermost = wide.filter((el) => !wide.some((other) => other !== el && el.contains(other)));
    return {
      scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
      innerWidth: window.innerWidth,
      offenders: innermost.slice(0, 5).map((el) => {
        const r = el.getBoundingClientRect();
        return `${name(el)} ${r.left.toFixed(1)}..${r.right.toFixed(1)}`;
      }),
    };
  }, limit);
  const viewportWidth = limit ?? metrics.innerWidth;
  for (const frame of page.frames().filter((f) => f !== page.mainFrame())) {
    const element = await frame.frameElement().catch(() => null);
    const box = await element?.boundingBox();
    if (!element || !box || box.x + box.width <= viewportWidth + 0.5) continue;
    const css = await element.evaluate((el: Element) => {
      const s = getComputedStyle(el);
      return `width ${s.width}, min-width ${s.minWidth}, zoom ${s.zoom}, style="${el.getAttribute("style") ?? ""}"`;
    });
    metrics.offenders.push(
      `iframe ${frame.url().slice(0, 60)} ${box.x.toFixed(1)}..${(box.x + box.width).toFixed(1)} (${css})`,
    );
  }
  return { ...metrics, viewportWidth, offenders: metrics.offenders.join("; ") || "none found" };
}

/**
 * Opens the Create sheet the way a person would: the floating "+" on phones, the rail button on tablets
 * ("Create something new") or "New" in the desktop sidebar. Only the visible one is in the accessibility tree.
 */
export async function openCreateMenu(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /^(Create something new|New)$/ }).click();
  const menu = page.getByRole("dialog", { name: "Create", exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

const JSQR_PATH = createRequire(import.meta.url).resolve("jsqr/dist/jsQR.js");

/**
 * Decodes the QR code in an image the way a phone camera would: the browser rasterises it onto white paper and
 * jsQR scans the pixels. `size` draws the image scaled to a square (right for SVGs, which scale); without it
 * the image is scanned at its natural size (right for a PNG). Runs in an `about:blank` page of its own.
 */
export async function decodeQr(page: Page, src: string, size?: number): Promise<string | null> {
  await page.goto("about:blank");
  await page.addScriptTag({ path: JSQR_PATH });
  return page.evaluate(
    async ({ src, size }) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const width = size ?? image.naturalWidth;
      const height = size ?? image.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d canvas unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      const jsQR = (
        window as unknown as {
          jsQR: (d: Uint8ClampedArray, w: number, h: number, o: object) => { data: string } | null;
        }
      ).jsQR;
      // An empty payload is a misread, not a read: with a finder pattern hidden (the proof watermark), jsQR can
      // pair the two left with a false one elsewhere on the sheet and decode a phantom version-1 symbol to "".
      // Every QR this app prints carries a URL.
      return jsQR(pixels.data, width, height, { inversionAttempts: "dontInvert" })?.data || null;
    },
    { src, size },
  );
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Choose an option in a panel `Select`: the glass listbox on fine pointers, the native `<select>` on touch
 * (the mobile project). `scope` is the page or dialog that holds the field.
 */
export async function chooseOption(
  scope: Page | Locator,
  label: string | RegExp,
  option: string,
): Promise<void> {
  const field = scope.getByLabel(label);
  if ((await field.evaluate((el) => el.tagName)) === "SELECT") {
    await field.selectOption({ label: option });
    return;
  }
  await field.click();
  const page = "page" in scope && typeof scope.page === "function" ? scope.page() : (scope as Page);
  await page.getByRole("option", { name: option, exact: true }).click();
}
