/**
 * Removes embedded metadata (GPS position, camera serial, author comments) from uploaded photos.
 * Pure byte-level work, no decoding: pixel data and colour profiles are copied untouched.
 *
 * - JPEG: APP1 (EXIF, XMP), APP13 (IPTC/Photoshop) and COM segments are dropped.
 * - PNG: tEXt, iTXt, zTXt and eXIf chunks are dropped; bytes after IEND are discarded.
 *
 * The EXIF orientation tag goes with the rest, so a rotated photo from a custom client shows
 * unrotated; the panel's own uploader already bakes the rotation into the pixels.
 * WebP is not handled here (the panel always re-encodes to JPEG).
 */

export class InvalidImageError extends Error {}

const JPEG_APP1 = 0xe1;
const JPEG_APP13 = 0xed;
const JPEG_COM = 0xfe;
const JPEG_SOS = 0xda;

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new InvalidImageError("Not a JPEG");
  const out: Uint8Array[] = [bytes.subarray(0, 2)];
  let pos = 2;
  for (;;) {
    if (pos + 1 >= bytes.length) throw new InvalidImageError("JPEG ends before its image data");
    if (bytes[pos] !== 0xff) throw new InvalidImageError("Malformed JPEG segment");
    const marker = bytes[pos + 1] ?? 0;
    if (marker === 0xff) {
      pos += 1; // fill byte
      continue;
    }
    if (marker === JPEG_SOS) {
      out.push(bytes.subarray(pos)); // entropy-coded data to the end is copied as is
      break;
    }
    // Markers without a length: SOI, TEM, RSTn, EOI.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (marker === 0xd9) {
      out.push(bytes.subarray(pos, pos + 2));
      break;
    }
    if (pos + 3 >= bytes.length) throw new InvalidImageError("Truncated JPEG segment");
    const length = ((bytes[pos + 2] ?? 0) << 8) | (bytes[pos + 3] ?? 0);
    const end = pos + 2 + length;
    if (length < 2 || end > bytes.length) throw new InvalidImageError("Malformed JPEG segment length");
    if (marker !== JPEG_APP1 && marker !== JPEG_APP13 && marker !== JPEG_COM) {
      out.push(bytes.subarray(pos, end));
    }
    pos = end;
  }
  return concat(out);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROPPED = new Set(["tEXt", "iTXt", "zTXt", "eXIf"]);

export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) throw new InvalidImageError("Not a PNG");
  const out: Uint8Array[] = [bytes.subarray(0, 8)];
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const length =
      (bytes[pos] ?? 0) * 0x1000000 +
      (((bytes[pos + 1] ?? 0) << 16) | ((bytes[pos + 2] ?? 0) << 8) | (bytes[pos + 3] ?? 0));
    const type = String.fromCharCode(
      bytes[pos + 4] ?? 0,
      bytes[pos + 5] ?? 0,
      bytes[pos + 6] ?? 0,
      bytes[pos + 7] ?? 0,
    );
    const end = pos + 12 + length; // length + type + data + CRC
    if (end > bytes.length) throw new InvalidImageError("Malformed PNG chunk length");
    if (!PNG_DROPPED.has(type)) out.push(bytes.subarray(pos, end));
    pos = end;
    if (type === "IEND") return concat(out);
  }
  throw new InvalidImageError("PNG ends before IEND");
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
