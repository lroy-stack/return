import type { Page } from "@playwright/test";
import type { GeocodeResult } from "../src/shared/schemas";
import { expect, newFinderContext, requireTurnstileNetwork, test, unique } from "./fixtures";

/**
 * Scenarios 11 and 12. Place search is an explicit owner action (never autocomplete, so the geocoder is not
 * hit while typing), and a shared position is always shown, with coordinates when no name is known.
 * The geocoder endpoint is stubbed in 11: no test depends on OpenStreetMap being reachable.
 */

const SEARCH_PATH = "/api/geocode/search";
/** The longest debounce the panel uses is 250 ms; waiting longer proves nothing fires on its own. */
const QUIET_WINDOW_MS = 600;

const RESULTS: GeocodeResult[] = [
  {
    name: "Estação do Rossio",
    detail: "Santa Maria Maior, Lisboa, Portugal",
    address: "Estação do Rossio, Praça Dom João da Câmara, Lisboa, Portugal",
    lat: 38.71435,
    lng: -9.14088,
  },
  {
    name: "Rossio Square",
    detail: "Lisboa, Portugal",
    address: "Praça Dom Pedro IV, Lisboa, Portugal",
    lat: 38.71398,
    lng: -9.13929,
  },
];

function countGeocodeRequests(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === SEARCH_PATH) count += 1;
  });
  return () => count;
}

async function openProposalSheet(page: Page, conversationId: string) {
  await page.goto(`/conversations/${conversationId}`);
  // The composer's "+" menu holds the secondary actions (return plan, share my location).
  await page.getByRole("button", { name: "Add to the conversation" }).click();
  await page.getByRole("menuitem", { name: "Propose a return plan" }).click();
  const dialog = page.getByRole("dialog", { name: "Propose a return plan" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("11a. typing a place never calls the geocoder; Search does, and picking a result fills the form", async ({
  page,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  const conversation = await startConversation(tagged);
  const searchRequests = countGeocodeRequests(page);
  const queries: string[] = [];
  await page.route(`**${SEARCH_PATH}*`, (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    return route.fulfill({
      json: { results: RESULTS, attribution: "© OpenStreetMap contributors" },
    });
  });
  const dialog = await openProposalSheet(page, conversation.id);

  // Typing alone: the Search button becomes available, but no request leaves the page.
  const query = "Rossio station";
  await dialog.getByRole("searchbox", { name: "Search a place" }).pressSequentially(query);
  const search = dialog.getByRole("button", { name: "Search", exact: true });
  await expect(search).toBeEnabled();
  await page.waitForTimeout(QUIET_WINDOW_MS);
  expect(searchRequests(), "no geocoder request while typing").toBe(0);

  // Pressing Search sends exactly one request with the typed query.
  await search.click();
  const results = dialog.getByRole("list", { name: "Places found" });
  await expect(results.getByRole("button")).toHaveCount(2);
  expect(searchRequests()).toBe(1);
  expect(queries).toEqual([query]);
  await expect(dialog.getByRole("link", { name: /OpenStreetMap contributors/ }).first()).toBeVisible();

  // Picking a result fills the Place field and the coordinates; still no further request.
  await results.getByRole("button", { name: /Estação do Rossio/ }).click();
  await expect(dialog.getByRole("textbox", { name: "Place", exact: true })).toHaveValue("Estação do Rossio");
  await dialog.getByText("Enter coordinates by hand").click();
  await expect(dialog.getByLabel(/^Latitude/)).toHaveValue("38.71435");
  await expect(dialog.getByLabel(/^Longitude/)).toHaveValue("-9.14088");
  await expect(dialog.getByRole("link", { name: /OpenStreetMap contributors/ }).first()).toBeVisible();
  expect(searchRequests(), "picking a result is not a new search").toBe(1);
});

test("11b. a rate-limited search tells the owner to type the place by hand", async ({
  page,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  const conversation = await startConversation(tagged);
  await page.route(`**${SEARCH_PATH}*`, (route) =>
    route.fulfill({
      status: 429,
      json: {
        error: { code: "rate_limited", message: "Too many place searches this hour, try again later" },
      },
    }),
  );
  const dialog = await openProposalSheet(page, conversation.id);

  await dialog.getByRole("searchbox", { name: "Search a place" }).fill("Atocha");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();

  await expect(
    dialog.getByText("Too many searches this hour. Type the place by hand, or try again later."),
  ).toBeVisible();
  // The manual way still works: the Place field is editable and nothing was filled in for the owner.
  const place = dialog.getByRole("textbox", { name: "Place", exact: true });
  await expect(place).toHaveValue("");
  await place.fill(unique("Atocha station, platform 1"));
  await expect(dialog.getByRole("button", { name: "Send return plan" })).toBeEnabled();
});

test("12. a shared position without a place name is shown with its coordinates to owner and finder", async ({
  page,
  browser,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  // Open Atlantic: the geocoder has no name for it (or is unreachable), so the coordinates are all there is.
  // Resolved names are covered by the unit tests, which control the geocoder.
  const gps = { lat: -30.12345, lng: -30.54321, accuracyM: 40 };
  const conversation = await startConversation(tagged, unique("Found it at sea"), gps);

  await page.goto(`/conversations/${conversation.id}`);
  const thread = page.getByRole("log");
  await expect(thread.getByText("Location shared by the finder")).toBeVisible();
  await expect(thread.getByText(/-30\.12345, -30\.54321/)).toBeVisible();
  await expect(thread.getByRole("link", { name: /OpenStreetMap contributors/ })).toHaveCount(0);
  await expect(thread.getByRole("link", { name: /Open in Google Maps/ })).toBeVisible();
  await expect(thread.getByRole("link", { name: /Open in Apple Maps/ })).toBeVisible();

  const finderContext = await newFinderContext(browser);
  const finder = await finderContext.newPage();
  await finder.goto(conversation.path);
  await expect(finder.locator(".place-coords")).toContainText("-30.12345, -30.54321");
  await expect(finder.getByRole("link", { name: /OpenStreetMap contributors/ })).toHaveCount(0);
  await finderContext.close();
});
