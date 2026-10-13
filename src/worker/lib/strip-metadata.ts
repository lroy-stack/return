/**
 * Removes embedded metadata (GPS position, camera serial, author comments, timestamps) from uploaded photos.
 * Pure byte-level work, no decoding: pixel data and colour profiles are copied untouched.
 *
 * Every format uses an allowlist of the structures needed to draw the image, so metadata hidden in vendor
 * or unknown segments is dropped too:
 * - JPEG: keeps APP0 (JFIF), APP2 only when it is an ICC profile, APP14 (Adobe colour transform) and the
 *   non-APP segments (tables, frame, scans). Drops EXIF/XMP (APP1), MPF (APP2), IPTC (APP13), every other
 *   APPn and COM. Stops at the first EOI, which also drops images appended after it (MPF, vendor trailers).
 * - PNG: keeps the critical chunks and the ancillary ones that only affect rendering; drops text, eXIf,
 *   tIME and unknown chunks. Bytes after IEND are discarded.
 * - WebP: keeps the image, alpha, animation and ICC chunks; drops EXIF, XMP and unknown chunks, clears the
 *   VP8X EXIF/XMP flags and rewrites the RIFF size. Bytes after the RIFF payload are discarded.
 *
 * The EXIF orientation tag goes with the rest, so a rotated photo from a custom client shows
 * unrotated; the panel's own uploader already bakes the rotation into the pixels.
 */

export class InvalidImageError extends Error {}

const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;
const JPEG_APP0 = 0xe0;
const JPEG_APP2 = 0xe2;
const JPEG_APP14 = 0xee;
const JPEG_COM = 0xfe;
const ICC_PROFILE_ID = [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0x00]; // "ICC_PROFILE\0"

const isAppSegment = (marker: number) => marker >= JPEG_APP0 && marker <= 0xef;
const isRestart = (marker: number) => marker >= 0xd0 && marker <= 0xd7;

function keepJpegSegment(bytes: Uint8Array, marker: number, payloadStart: number): boolean {
  if (marker === JPEG_COM) return false;
  if (!isAppSegment(marker)) return true;
  if (marker === JPEG_APP0 || marker === JPEG_APP14) return true;
  return marker === JPEG_APP2 && ICC_PROFILE_ID.every((b, i) => bytes[payloadStart + i] === b);
}

/** Index of the next marker after entropy-coded data starting at `pos` (skips stuffed 0xFF00 and RSTn). */
function endOfEntropyData(bytes: Uint8Array, pos: number): number {
  let p = pos;
  for (;;) {
    p = bytes.indexOf(0xff, p);
    if (p === -1 || p + 1 >= bytes.length) throw new InvalidImageError("JPEG ends inside its image data");
    const next = bytes[p + 1] ?? 0;
    if (next === 0x00 || isRestart(next)) p += 2;
    else if (next === 0xff)
      p += 1; // fill byte before a marker
    else return p;
  }
}

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new InvalidImageError("Not a JPEG");
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let pos = 2;
  for (;;) {
    if (pos + 1 >= bytes.length) throw new InvalidImageError("JPEG ends before EOI");
    if (bytes[pos] !== 0xff) throw new InvalidImageError("Malformed JPEG segment");
    const marker = bytes[pos + 1] ?? 0;
    if (marker === 0xff) {
      pos += 1; // fill byte
      continue;
    }
    if (marker === JPEG_EOI) {
      out.push(bytes.subarray(pos, pos + 2));
      return concat(out); // anything after the first EOI (appended images, trailers) is dropped
    }
    // Markers without a length: SOI, TEM, RSTn.
    if (marker === 0xd8 || marker === 0x01 || isRestart(marker)) {
      out.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (pos + 3 >= bytes.length) throw new InvalidImageError("Truncated JPEG segment");
    const length = ((bytes[pos + 2] ?? 0) << 8) | (bytes[pos + 3] ?? 0);
    const end = pos + 2 + length;
    if (length < 2 || end > bytes.length) throw new InvalidImageError("Malformed JPEG segment length");
    if (keepJpegSegment(bytes, marker, pos + 4)) out.push(bytes.subarray(pos, end));
    pos = end;
    if (marker === JPEG_SOS) {
      // A scan header is followed by entropy-coded data up to the next marker (progressive files have several).
      const next = endOfEntropyData(bytes, pos);
      out.push(bytes.subarray(pos, next));
      pos = next;
    }
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_KEPT = new Set([
  // Critical
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  // Rendering only: transparency, colour space, physical size, animation (APNG)
  "tRNS",
  "cHRM",
  "gAMA",
  "iCCP",
  "sBIT",
  "sRGB",
  "cICP",
  "mDCV",
  "cLLI",
  "bKGD",
  "hIST",
  "pHYs",
  "sPLT",
  "acTL",
  "fcTL",
  "fdAT",
]);

export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) throw new InvalidImageError("Not a PNG");
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length =
      (bytes[pos] ?? 0) * 0x1000000 +
      (((bytes[pos + 1] ?? 0) << 16) | ((bytes[pos + 2] ?? 0) << 8) | (bytes[pos + 3] ?? 0));
    const type = fourcc(bytes, pos + 4);
    const end = pos + 12 + length; // length + type + data + CRC
    if (end > bytes.length) throw new InvalidImageError("Malformed PNG chunk length");
    if (PNG_KEPT.has(type)) out.push(bytes.subarray(pos, end));
    pos = end;
    if (type === "IEND") return concat(out);
  }
  throw new InvalidImageError("PNG ends before IEND");
}

const WEBP_KEPT = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"]);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

const readU32le = (bytes: Uint8Array, pos: number) =>
  ((bytes[pos] ?? 0) | ((bytes[pos + 1] ?? 0) << 8) | ((bytes[pos + 2] ?? 0) << 16)) +
  (bytes[pos + 3] ?? 0) * 0x1000000;

export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  if (fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "WEBP") throw new InvalidImageError("Not a WebP");
  const riffEnd = 8 + readU32le(bytes, 4);
  if (riffEnd > bytes.length || riffEnd < 12) throw new InvalidImageError("Malformed WebP size");
  const chunks: Uint8Array[] = [];
  let pos = 12;
  while (pos < riffEnd) {
    if (pos + 8 > riffEnd) throw new InvalidImageError("Truncated WebP chunk");
    const type = fourcc(bytes, pos);
    const size = readU32le(bytes, pos + 4);
    const end = pos + 8 + size + (size % 2); // chunks are padded to an even length
    if (end > riffEnd) throw new InvalidImageError("Malformed WebP chunk size");
    if (WEBP_KEPT.has(type)) {
      const chunk = bytes.slice(pos, end);
      if (type === "VP8X" && size >= 1) chunk[8] = (chunk[8] ?? 0) & ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
      chunks.push(chunk);
    }
    pos = end;
  }
  const body = concat([bytes.subarray(8, 12), ...chunks]);
  const size = body.length;
  const header = Uint8Array.of(
    0x52,
    0x49,
    0x46,
    0x46,
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
    size >>> 24,
  );
  return concat([header, body]);
}

function fourcc(bytes: Uint8Array, pos: number): string {
  return String.fromCharCode(bytes[pos] ?? 0, bytes[pos + 1] ?? 0, bytes[pos + 2] ?? 0, bytes[pos + 3] ?? 0);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
