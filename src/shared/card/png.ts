/**
 * Canvas PNGs carry no resolution, so layout tools open them at 72 dpi (a 37 cm wide card). This
 * writes a pHYs chunk so a 300 dpi export opens at its physical size. Pure and DOM-free.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = (crcTable[(crc ^ b) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readU32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at);
}

export function pngPixelsPerMetre(dpi: number): number {
  return Math.round(dpi / 0.0254);
}

/** Return a copy of `png` with exactly one pHYs chunk (after IHDR) declaring `dpi`. */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  if (png.length < 33 || !SIGNATURE.every((b, i) => png[i] === b)) {
    throw new Error("Not a PNG file.");
  }
  // Drop any existing pHYs chunk, keep everything else byte-for-byte.
  const parts: Uint8Array[] = [png.subarray(0, 8)];
  let offset = 8;
  let ihdrEnd = -1;
  while (offset + 8 <= png.length) {
    const length = readU32(png, offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > png.length) throw new Error("Corrupt PNG chunk.");
    if (type !== "pHYs") parts.push(png.subarray(offset, end));
    if (type === "IHDR") ihdrEnd = parts.length;
    offset = end;
    if (type === "IEND") break;
  }
  if (ihdrEnd < 0) throw new Error("PNG without IHDR.");

  const ppm = pngPixelsPerMetre(dpi);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  parts.splice(ihdrEnd, 0, chunk);

  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Read the declared resolution back (dots per inch), or null when the PNG has no pHYs chunk. */
export function readPngDpi(png: Uint8Array): number | null {
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = readU32(png, offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    if (type === "pHYs" && png[offset + 16] === 1) return Math.round(readU32(png, offset + 8) * 0.0254);
    if (type === "IEND") break;
    offset += 12 + length;
  }
  return null;
}
