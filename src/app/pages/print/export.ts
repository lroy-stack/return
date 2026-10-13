/** Browser-side exports for the print studio: SVG/PNG/PDF downloads. */

import { type PaperPage, paperPixelSize } from "../../../shared/card";
import { setPngDpi } from "../../../shared/card/png";
import type { CardSide } from "../../../shared/card/types";
import { svgDataUrl } from "../../lib/files";

export const PRINT_DPI = 300;

/** Pixel size of a face including bleed at `dpi`. */
export function pixelSize(side: CardSide, dpi = PRINT_DPI): { width: number; height: number } {
  const toPx = (mm: number) => Math.round((mm / 25.4) * dpi);
  return { width: toPx(side.widthMm + 2 * side.bleedMm), height: toPx(side.heightMm + 2 * side.bleedMm) };
}

/** Rasterise an SVG through an <img> + canvas; the PNG declares its dpi. */
async function rasterise(svg: string, width: number, height: number, dpi: number): Promise<Blob> {
  const img = new Image(width, height);
  img.decoding = "async";
  img.src = svgDataUrl(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot create a canvas for the PNG export.");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"),
  );
  const bytes = setPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" });
}

/** A card face as PNG, including bleed. */
export function svgToPng(svg: string, side: CardSide, dpi = PRINT_DPI): Promise<Blob> {
  const { width, height } = pixelSize(side, dpi);
  return rasterise(svg, width, height, dpi);
}

/** A whole paper page (A4 / Letter) as a 300 dpi PNG that prints at true size. */
export function paperToPng(svg: string, page: PaperPage, dpi = PRINT_DPI): Promise<Blob> {
  const { width, height } = paperPixelSize(page, dpi);
  return rasterise(svg, width, height, dpi);
}
