import { readFile } from "node:fs/promises";
import type { Download, Page } from "@playwright/test";
import { decodeQr, expect, openCreateMenu, svgDataUri, test, unique } from "./fixtures";

/**
 * Scenario 10. From the inventory, an owner with an item that has no tag gets a printable paper card in at
 * most four actions: Create, Quick card, the item, Download PNG. Reprinting reuses the tag.
 */

const MAX_ACTIONS = 4;
const PAPER_PIXELS = {
  a4: { width: 2480, height: 3508 },
  letter: { width: 2550, height: 3300 },
} as const;
/** 300 dpi expressed in pixels per metre, as PNG's pHYs chunk stores it. */
const PIXELS_PER_METRE_300_DPI = 11811;

interface PngFacts {
  width: number;
  height: number;
  phys: { x: number; y: number; unit: number } | null;
}

/** Reads the dimensions and the pHYs chunk straight from the bytes: what a printer driver would see. */
function readPng(bytes: Buffer): PngFacts {
  expect(bytes.subarray(0, 8).toString("hex"), "PNG signature").toBe("89504e470d0a1a0a");
  let phys: PngFacts["phys"] = null;
  let width = 0;
  let height = 0;
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = offset + 8;
    if (type === "IHDR") {
      width = bytes.readUInt32BE(data);
      height = bytes.readUInt32BE(data + 4);
    }
    if (type === "pHYs") {
      phys = {
        x: bytes.readUInt32BE(data),
        y: bytes.readUInt32BE(data + 4),
        unit: bytes.readUInt8(data + 8),
      };
    }
    if (type === "IEND") break;
    offset = data + length + 4;
  }
  return { width, height, phys };
}

async function readDownload(download: Download): Promise<Buffer> {
  const path = await download.path();
  return readFile(path);
}

/** One person-level action: counted, so the "few taps" promise is measured, not assumed. */
function actionCounter() {
  let count = 0;
  return {
    get count() {
      return count;
    },
    async act<T>(step: () => Promise<T>): Promise<T> {
      count += 1;
      return step();
    },
  };
}

async function pickItemInQuickCard(page: Page, name: string, taps: ReturnType<typeof actionCounter>) {
  const menu = await taps.act(() => openCreateMenu(page));
  await taps.act(() => menu.getByRole("button", { name: /^Quick card/ }).click());
  const sheet = page.getByRole("dialog", { name: "Quick card", exact: true });
  await expect(sheet).toBeVisible();
  await taps.act(() =>
    sheet
      .getByRole("list", { name: "Items" })
      .getByRole("button", { name: new RegExp(name) })
      .click(),
  );
  return sheet;
}

test("10. quick card: a new tag and a print-ready PNG in four actions, and a second run reuses the tag", async ({
  page,
  owner,
}) => {
  const itemName = unique("Quick card item");
  const item = await owner.createItem({ name: itemName });
  expect((await owner.item(item.id)).tags, "the item starts without a tag").toHaveLength(0);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
  const taps = actionCounter();

  // First run: no tag yet, so "Create a new tag" is the default and nothing is created until export.
  const sheet = await pickItemInQuickCard(page, itemName, taps);
  await expect(sheet.getByText("Create a new tag", { exact: true })).toBeVisible();
  expect((await owner.item(item.id)).tags, "opening the sheet must not create a tag").toHaveLength(0);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    taps.act(() => sheet.getByRole("button", { name: "Download PNG" }).click()),
  ]);
  expect(taps.count, "user actions from the loaded inventory to the downloaded PNG").toBeLessThanOrEqual(
    MAX_ACTIONS,
  );
  await expect(sheet.getByText(/Card ready/)).toBeVisible();

  // The tag now exists for the item, and the file name carries its label.
  const [tag, ...others] = (await owner.item(item.id)).tags;
  expect(tag, "a tag was created for the item").toBeDefined();
  expect(others, "exactly one tag").toHaveLength(0);
  if (!tag) throw new Error("unreachable: asserted above");
  const labelStem = tag.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const fileName = download.suggestedFilename();
  expect(fileName).toMatch(new RegExp(`^return-card-${labelStem}-(a4|letter)(-proof)?\\.png$`));
  // Over plain http the public address is not live, so the card is a proof (watermarked, "-proof" in the name).
  const isProof = fileName.endsWith("-proof.png");
  expect(isProof, "a card for an http address is a proof").toBe(!page.url().startsWith("https:"));

  // Paper size and resolution: the PNG prints at true size.
  const png = await readDownload(download);
  const facts = readPng(png);
  const paper = fileName.includes("-letter") ? "letter" : "a4";
  expect({ width: facts.width, height: facts.height }, `${paper} at 300 dpi`).toEqual(PAPER_PIXELS[paper]);
  expect(facts.phys, "pHYs chunk").toEqual({
    x: PIXELS_PER_METRE_300_DPI,
    y: PIXELS_PER_METRE_300_DPI,
    unit: 1,
  });

  // The QR on the paper decodes to the tag URL. A proof carries a watermark that may cover the QR, and that
  // is by design (a proof must not be scannable as a live tag): then the QR is checked on the tag's own SVG.
  const fromPng = await decodeQr(page, `data:image/png;base64,${png.toString("base64")}`);
  if (fromPng !== null) {
    expect(fromPng).toBe(tag.url);
  } else {
    expect(isProof, "the QR may be unreadable on the PNG only when the proof watermark covers it").toBe(true);
  }
  const fromSvg = await decodeQr(page, svgDataUri(await owner.qrSvg(tag.id)), 640);
  expect(fromSvg, "QR of the tag's own SVG").toBe(tag.url);

  // Second run on the same item: the existing tag is offered by default, reused, and nothing new is created.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
  const again = await pickItemInQuickCard(page, itemName, actionCounter());
  await expect(again.getByRole("radio", { name: new RegExp(`^Use tag ${tag.label}`) })).toBeChecked();
  const [second] = await Promise.all([
    page.waitForEvent("download"),
    again.getByRole("button", { name: "Download PNG" }).click(),
  ]);
  expect(second.suggestedFilename()).toBe(fileName);
  const after = (await owner.item(item.id)).tags;
  expect(
    after.map((x) => x.id),
    "reprinting must reuse the tag",
  ).toEqual([tag.id]);
});
