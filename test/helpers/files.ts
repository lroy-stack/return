import { env } from "cloudflare:workers";
import { APP, accessJwt, worker } from "./auth";

const ascii = (text: string) => new TextEncoder().encode(text);
const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const u32 = (n: number) => new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

/** JPEG segment: marker + big-endian length (which counts itself) + payload. */
export const jpegSegment = (marker: number, payload: Uint8Array) =>
  join(new Uint8Array([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload);
const JPEG_SOI = new Uint8Array([0xff, 0xd8]);
const JPEG_SCAN = new Uint8Array([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]);

/** PNG chunk; the CRC is not checked by the Worker, so zeros are fine for fixtures. */
export const pngChunk = (type: string, data: Uint8Array) =>
  join(u32(data.length), ascii(type), data, new Uint8Array(4));
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IHDR = pngChunk("IHDR", join(u32(1), u32(1), new Uint8Array([8, 2, 0, 0, 0])));
const PNG_IDAT = pngChunk("IDAT", new Uint8Array([0x78, 0x9c, 0x63, 0, 0, 0, 2, 0, 1]));
const PNG_IEND = pngChunk("IEND", new Uint8Array());

/** Smallest well-formed files of each type, with no metadata at all. */
export const PNG_BYTES = join(PNG_SIGNATURE, PNG_IHDR, PNG_IDAT, PNG_IEND);
export const JPEG_BYTES = join(
  JPEG_SOI,
  jpegSegment(0xe0, ascii("JFIF\0\x01\x01\0\0\x01\0\x01\0\0")),
  JPEG_SCAN,
);

/**
 * A camera-style JPEG: EXIF with GPS (APP1), XMP (APP1), an MPF index (APP2), vendor APP3/APP15 segments,
 * IPTC (APP13) and a comment, around a kept ICC profile and Adobe segment; a two-scan (progressive) image
 * with byte stuffing and restart markers; then a second, GPS-tagged image appended after EOI, as MPF does.
 */
export const GPS_MARKER = "GPS-LAT-48.8584N-LON-2.2945E";
const JPEG_JFIF = jpegSegment(0xe0, ascii("JFIF\0\x01\x01\0\0\x01\0\x01\0\0"));
const JPEG_ICC = jpegSegment(0xe2, ascii("ICC_PROFILE\0\x01\x01keep-me"));
const JPEG_ADOBE = jpegSegment(0xee, ascii("Adobe\0\x64\0\0\0\0\x01"));
const JPEG_PROGRESSIVE_SCANS = join(
  new Uint8Array([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0]),
  new Uint8Array([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]), // stuffed 0xFF and a restart marker
  jpegSegment(0xc4, new Uint8Array([0x10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x07])),
  new Uint8Array([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x78, 0x9a]),
  new Uint8Array([0xff, 0xd9]),
);
/** What `jpegWithMetadata()` must become: only the image-defining segments survive. */
export const JPEG_STRIPPED = join(JPEG_SOI, JPEG_JFIF, JPEG_ICC, JPEG_ADOBE, JPEG_PROGRESSIVE_SCANS);
export function jpegWithMetadata(): Uint8Array {
  return join(
    JPEG_SOI,
    JPEG_JFIF,
    jpegSegment(0xe1, ascii(`Exif\0\0MM\0*${GPS_MARKER}`)),
    jpegSegment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>owner@example.test</x:xmpmeta>")),
    JPEG_ICC,
    jpegSegment(0xe2, ascii("MPF\0MM\0*MPF-INDEX-SECRET")),
    jpegSegment(0xe3, ascii("APP3-VENDOR-SECRET")),
    JPEG_ADOBE,
    jpegSegment(0xed, ascii("Photoshop 3.0\0IPTC-CITY-PARIS")),
    jpegSegment(0xef, ascii("APP15-VENDOR-SECRET")),
    jpegSegment(0xfe, ascii("shot by Alice")),
    JPEG_PROGRESSIVE_SCANS,
    JPEG_SOI,
    jpegSegment(0xe1, ascii(`Exif\0\0MM\0*APPENDED-${GPS_MARKER}`)),
    JPEG_SCAN,
  );
}

/** A PNG with text, eXIf (GPS), tIME and unknown private chunks, around kept gAMA and pHYs chunks. */
export function pngWithMetadata(): Uint8Array {
  return join(
    PNG_SIGNATURE,
    PNG_IHDR,
    pngChunk("tEXt", ascii("Author\0Alice")),
    pngChunk("eXIf", ascii(`MM\0*${GPS_MARKER}`)),
    pngChunk("gAMA", u32(45455)),
    pngChunk("iTXt", ascii("XML:com.adobe.xmp\0\0\0\0\0owner@example.test")),
    pngChunk("zTXt", ascii("Comment\0\0x")),
    pngChunk("tIME", new Uint8Array([0x07, 0xea, 10, 13, 9, 30, 0])),
    pngChunk("pHYs", join(u32(2835), u32(2835), new Uint8Array([1]))),
    pngChunk("prVt", ascii("PRIVATE-CHUNK-SECRET")),
    PNG_IDAT,
    PNG_IEND,
    ascii("TRAILING-SECRET"),
  );
}

export const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n%test\n");
export const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

const u32le = (n: number) =>
  new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
/** RIFF chunk: FourCC + little-endian size + payload + a pad byte when the size is odd. */
export const webpChunk = (fourcc: string, data: Uint8Array) =>
  join(ascii(fourcc), u32le(data.length), data, new Uint8Array(data.length % 2));
export const webpFile = (...chunks: Uint8Array[]) => {
  const body = join(ascii("WEBP"), ...chunks);
  return join(ascii("RIFF"), u32le(body.length), body);
};
/** VP8X flags: ICC 0x20, alpha 0x10, EXIF 0x08, XMP 0x04, animation 0x02. Canvas 1x1. */
export const webpVp8x = (flags: number) =>
  webpChunk("VP8X", new Uint8Array([flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
const WEBP_ICCP = webpChunk("ICCP", ascii("keep-icc"));
const WEBP_VP8L = webpChunk(
  "VP8L",
  new Uint8Array([0x2f, 0, 0, 0, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88]),
);

/** An extended WebP with EXIF (GPS), XMP and an unknown chunk, an ICC profile to keep, and bytes after the RIFF. */
export function webpWithMetadata(): Uint8Array {
  return join(
    webpFile(
      webpVp8x(0x2c),
      WEBP_ICCP,
      WEBP_VP8L,
      webpChunk("EXIF", ascii(`MM\0*${GPS_MARKER}!`)),
      webpChunk("XMP ", ascii("<x:xmpmeta>owner@example.test</x:xmpmeta>")),
      webpChunk("ZZZZ", ascii("UNKNOWN-CHUNK-SECRET")),
    ),
    ascii("TRAILING-SECRET"),
  );
}
/** What `webpWithMetadata()` must become: the EXIF/XMP flags cleared and only image chunks kept. */
export const WEBP_STRIPPED = webpFile(webpVp8x(0x20), WEBP_ICCP, WEBP_VP8L);

/** Multipart upload as the browser would send it (Origin + Access JWT). */
export async function upload(fields: {
  itemId?: string;
  kind?: string;
  bytes?: Uint8Array;
  filename?: string;
  type?: string;
  email?: string;
  /** Declared Content-Length: omitted = real size, null = header not sent. */
  contentLength?: number | null;
}): Promise<Response> {
  const form = new FormData();
  if (fields.itemId !== undefined) form.set("itemId", fields.itemId);
  if (fields.kind !== undefined) form.set("kind", fields.kind);
  if (fields.bytes) {
    form.set(
      "file",
      new File([fields.bytes], fields.filename ?? "upload.bin", {
        type: fields.type ?? "application/octet-stream",
      }),
    );
  }
  // Encode the body ourselves so Content-Length is known, as it is for real browser uploads.
  const encoded = new Response(form);
  const body = await encoded.arrayBuffer();
  const headers = new Headers({
    Origin: APP,
    "Cf-Access-Jwt-Assertion": await accessJwt(fields.email),
    "Content-Type": encoded.headers.get("Content-Type") ?? "multipart/form-data",
  });
  if (fields.contentLength !== null)
    headers.set("Content-Length", String(fields.contentLength ?? body.byteLength));
  // A stream has no known length, so no Content-Length is derived for it.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(body));
      controller.close();
    },
  });
  const init: RequestInit & { duplex?: "half" } = {
    method: "POST",
    headers,
    body: fields.contentLength === null ? stream : body,
    duplex: "half",
  };
  return worker.fetch(new Request(`${APP}/api/files`, init));
}

/** Another owner with one row of every owned kind, inserted directly (bypassing the API). */
export async function seedForeignOwner(): Promise<void> {
  const t = "2026-01-01T00:00:00.000Z";
  await env.FILES.put("owners/foreign/items/foreign-item/foreign-file", PNG_BYTES);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO owners (id, email, created_at) VALUES ('foreign', 'foreign@example.test', ?)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO items (id, owner_id, name, created_at, updated_at) VALUES ('foreign-item', 'foreign', 'Not yours', ?1, ?1)",
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO item_files (id, owner_id, item_id, kind, r2_key, filename, content_type, size_bytes, created_at)
       VALUES ('foreign-file', 'foreign', 'foreign-item', 'photo', 'owners/foreign/items/foreign-item/foreign-file', 'x.png', 'image/png', 12, ?)`,
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO tags (id, owner_id, item_id, token, seq, label, created_at)
       VALUES ('foreign-tag', 'foreign', 'foreign-item', 'zzzzzzzzzzzzzzzzzzzzzzzzzz', 1, '001', ?)`,
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO trackers (id, owner_id, item_id, name, created_at, updated_at) VALUES ('foreign-tracker', 'foreign', 'foreign-item', 'AirTag', ?1, ?1)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO recoveries (id, owner_id, item_id, created_at, updated_at) VALUES ('foreign-recovery', 'foreign', 'foreign-item', ?1, ?1)",
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO trusted_contacts (id, owner_id, name, created_at, updated_at) VALUES ('foreign-contact', 'foreign', 'Sis', ?1, ?1)",
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO conversations (id, owner_id, item_id, finder_token_hash, subject, last_message_at, created_at)
       VALUES ('foreign-conv', 'foreign', 'foreign-item', 'foreign-hash', 'Private thread', ?1, ?1)`,
    ).bind(t),
    env.DB.prepare(
      "INSERT INTO messages (id, conversation_id, sender, body, created_at) VALUES ('foreign-msg', 'foreign-conv', 'finder', 'secret', ?)",
    ).bind(t),
    env.DB.prepare(
      `INSERT INTO activity_events (id, owner_id, type, created_at) VALUES ('foreign-event', 'foreign', 'item.created', ?)`,
    ).bind(t),
  ]);
}
