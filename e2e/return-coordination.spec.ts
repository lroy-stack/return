import type { Locator, Page } from "@playwright/test";
import {
  chooseOption,
  expect,
  finderHeaders,
  newFinderContext,
  ORIGIN,
  requireTurnstileNetwork,
  test,
  unique,
} from "./fixtures";

/**
 * Scenario 4. Finder and owner agree on a return plan; the agreed place gets directions links that carry
 * the destination only, never anybody's starting point.
 */

interface MapHrefs {
  google: string;
  apple: string;
}

async function mapHrefs(scope: Page | Locator): Promise<MapHrefs> {
  const google = scope.getByRole("link", { name: /Open in Google Maps/ });
  const apple = scope.getByRole("link", { name: /Open in Apple Maps/ });
  await expect(google).toHaveCount(1);
  await expect(apple).toHaveCount(1);
  await expect(google).toContainText("Google Maps");
  await expect(apple).toContainText("Apple Maps");
  for (const link of [google, apple]) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
  }
  return {
    google: (await google.getAttribute("href")) ?? "",
    apple: (await apple.getAttribute("href")) ?? "",
  };
}

/** Directions links must point at the agreed place and carry no origin or any other parameter. */
function expectDestinationOnly(hrefs: MapHrefs, destination: string) {
  const google = new URL(hrefs.google);
  expect(google.origin + google.pathname).toBe("https://www.google.com/maps/dir/");
  expect(google.searchParams.get("destination")).toBe(destination);
  expect([...google.searchParams.keys()].sort()).toEqual(["api", "destination"]);

  const apple = new URL(hrefs.apple);
  expect(apple.origin).toBe("https://maps.apple.com");
  expect(apple.searchParams.get("daddr")).toBe(destination);
  expect([...apple.searchParams.keys()].every((k) => k === "daddr" || k === "q")).toBe(true);

  for (const href of [hrefs.google, hrefs.apple]) {
    expect(href).not.toMatch(/origin=|saddr=|source=|start=/i);
  }
}

test("4a. the finder proposes a meeting point, the owner accepts it in the inbox, both see it as agreed", async ({
  page: ownerPage,
  browser,
  tagged,
  startConversation,
}) => {
  const place = `Praça do Comércio, Lisbon ${unique("P")}`;
  const instructions = unique("Ask for the red scarf at the fountain");
  await requireTurnstileNetwork();
  const conversation = await startConversation(tagged);

  // The finder opens their private link and proposes a place and time.
  const finderContext = await newFinderContext(browser);
  const finder = await finderContext.newPage();
  await finder.goto(conversation.path);
  await finder.getByText("Propose a return plan").click();
  await finder.getByLabel("Place", { exact: true }).fill(place);
  await finder.getByLabel(/^Date and time/).fill(`${new Date().getFullYear() + 1}-10-14T18:30`);
  await finder.getByLabel(/^Instructions/).fill(instructions);
  await finder.getByRole("button", { name: "Send return plan" }).click();

  const suggestion = finder.getByRole("listitem").filter({ hasText: place });
  await expect(suggestion).toContainText("Waiting for an answer");
  await expect(suggestion).toContainText("Proposed by you");
  await expect(suggestion).toContainText(/18:30/);
  await expect(suggestion).toContainText(instructions);
  // Directions only appear once both sides agreed; the finder cannot accept their own plan.
  await expect(suggestion.getByRole("link", { name: /Maps/ })).toHaveCount(0);
  await expect(suggestion.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await expect(suggestion.getByRole("button", { name: "Cancel return plan" })).toBeVisible();

  // The owner finds it in the inbox and accepts.
  await ownerPage.goto("/conversations");
  await ownerPage.getByRole("link", { name: new RegExp(tagged.publicTitle) }).click();
  const thread = ownerPage.getByRole("log");
  await expect(thread).toContainText("Return plan: Meeting point");
  await expect(thread).toContainText(place);
  await expect(thread).toContainText("18:30");
  await expect(thread).toContainText("Proposed by the finder");
  await thread.getByRole("button", { name: "Accept" }).click();
  await expect(thread).toContainText("Accepted");
  await expect(thread.getByRole("button", { name: "Accept" })).toHaveCount(0);
  const ownerHrefs = await mapHrefs(thread);
  expectDestinationOnly(ownerHrefs, place);

  // The finder sees the agreement and the same links after reloading their page.
  await finder.reload();
  const agreed = finder.getByRole("listitem").filter({ hasText: place });
  await expect(agreed).toContainText("Agreed");
  await expect(agreed.getByRole("button")).toHaveCount(0);
  const finderHrefs = await mapHrefs(agreed);
  expectDestinationOnly(finderHrefs, place);
  expect(finderHrefs).toEqual(ownerHrefs);
  await finderContext.close();
});

test("4b. the owner proposes exact coordinates, the finder accepts, directions point at the coordinates", async ({
  page: ownerPage,
  browser,
  owner,
  tagged,
  startConversation,
}) => {
  const place = `Hotel Aurora reception ${unique("H")}`;
  await requireTurnstileNetwork();
  const conversation = await startConversation(tagged);

  await ownerPage.goto(`/conversations/${conversation.id}`);
  await ownerPage.getByRole("button", { name: "Propose a return plan" }).click();
  const dialog = ownerPage.getByRole("dialog", { name: "Propose a return plan" });
  await chooseOption(dialog, "Type of place", "Hotel reception");
  await dialog.getByRole("textbox", { name: "Place", exact: true }).fill(place);
  // Coordinates by hand live in a collapsed disclosure.
  await dialog.getByText("Enter coordinates by hand").click();
  await dialog.getByLabel(/^Latitude/).fill("38.7223");
  await dialog.getByLabel(/^Longitude/).fill("-9.1393");
  await dialog.getByLabel(/^Date and time/).fill(`${new Date().getFullYear() + 1}-06-15T09:00`);
  await dialog.getByRole("button", { name: "Send return plan" }).click();
  const thread = ownerPage.getByRole("log");
  await expect(thread).toContainText(place);
  await expect(thread.getByRole("button", { name: "Cancel plan" })).toBeVisible();
  await expect(thread.getByRole("button", { name: "Accept" })).toHaveCount(0);

  const finderContext = await newFinderContext(browser);
  const finder = await finderContext.newPage();
  await finder.goto(conversation.path);
  const suggestion = finder.getByRole("listitem").filter({ hasText: place });
  await expect(suggestion).toContainText("Proposed by the owner");
  await expect(suggestion).toContainText("Hotel reception");
  await suggestion.getByRole("button", { name: "Accept" }).click();

  const agreed = finder.getByRole("listitem").filter({ hasText: place });
  await expect(agreed).toContainText("Agreed");
  expectDestinationOnly(await mapHrefs(agreed), "38.72230,-9.13930");

  // The owner's side of the same agreement.
  await ownerPage.reload();
  await expect(ownerPage.getByRole("log")).toContainText("Accepted");
  const detail = await owner.conversation(conversation.id);
  const [accepted] = detail.proposals;
  expect(accepted).toMatchObject({ status: "accepted", proposedBy: "owner", lat: 38.7223, lng: -9.1393 });
  expectDestinationOnly(accepted?.maps ?? { google: "", apple: "" }, "38.72230,-9.13930");
  await finderContext.close();
});

test("4c. a finder cannot accept their own proposal by posting the form by hand", async ({
  playwright,
  owner,
  tagged,
  startConversation,
}) => {
  await requireTurnstileNetwork();
  const conversation = await startConversation(tagged);
  const finder = await playwright.request.newContext({ baseURL: ORIGIN, extraHTTPHeaders: finderHeaders() });
  const place = unique("Station kiosk");
  const created = await finder.post(`${conversation.path}/proposals`, {
    form: { kind: "meeting_point", place },
    headers: { Origin: ORIGIN },
    maxRedirects: 0,
  });
  expect(created.status()).toBe(303);
  const proposalId = (await owner.conversation(conversation.id)).proposals[0]?.id ?? "";

  const forged = await finder.post(`${conversation.path}/proposals/${proposalId}/respond`, {
    form: { action: "accept" },
    headers: { Origin: ORIGIN },
    maxRedirects: 0,
  });

  expect(forged.status()).toBeGreaterThanOrEqual(400);
  expect(forged.status()).toBeLessThan(500);
  const after = (await owner.conversation(conversation.id)).proposals[0];
  expect(after).toMatchObject({ id: proposalId, status: "proposed", proposedBy: "finder" });
  await finder.dispose();
});
