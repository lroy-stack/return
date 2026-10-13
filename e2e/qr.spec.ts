import { decodeQr, expect, svgDataUri, test } from "./fixtures";

/**
 * Scenario 7. The QR code a tag is printed with decodes to the tag URL, and that URL works.
 * The SVG is rasterised by the browser itself and decoded with jsQR, as a phone camera would see it.
 */

test("7. the downloaded QR SVG decodes to the tag URL and that URL opens the tag page", async ({
  page,
  owner,
  tagged,
}) => {
  const svg = await owner.qrSvg(tagged.tag.id);
  expect(svg.startsWith("<svg") || svg.startsWith("<?xml")).toBe(true);

  // Scan at a size a camera would see: the SVG scales, so render it large and on white paper.
  const decoded = await decodeQr(page, svgDataUri(svg), 640);

  expect(decoded, "jsQR must find a QR code in the SVG").not.toBeNull();
  expect(decoded).toBe(tagged.tag.url);

  const response = await page.goto(decoded ?? "");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: tagged.publicTitle })).toBeVisible();
});

test("7b. the QR download is served as an attachment and unknown tags return 404", async ({
  request,
  tagged,
}) => {
  const res = await request.get(`/api/tags/${tagged.tag.id}/qr.svg`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");

  const unknown = await request.get(`/api/tags/${crypto.randomUUID()}/qr.svg`);
  expect(unknown.status()).toBe(404);
});
