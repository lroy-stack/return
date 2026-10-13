/** Light file helpers (no card renderer): safe to import from the entry bundle. */

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * A QR code SVG as a square PNG on white paper (scanners need the light quiet zone, and a transparent PNG turns
 * black in dark-mode viewers). `size` is the PNG edge in pixels.
 */
export async function qrToPng(svg: string, size = 1024): Promise<Blob> {
  const img = new Image(size, size);
  img.decoding = "async";
  img.src = svgDataUrl(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot create a canvas for the PNG export.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed."))), "image/png"),
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** File-name-safe label, e.g. "RT-001" → "rt-001". */
export function fileStem(label: string): string {
  return (
    label
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "card"
  );
}
