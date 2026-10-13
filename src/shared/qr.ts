import { encode } from "uqr";

export type QrEcc = "L" | "M" | "Q" | "H";

export interface QrMatrix {
  /** Modules per side, including the quiet zone. */
  size: number;
  version: number;
  /** `true` = dark module. Row-major: modules[y][x]. */
  modules: boolean[][];
}

/** The ISO 18004 quiet zone is 4 modules; scanners struggle with less on busy backgrounds. */
export const QUIET_ZONE = 4;

export function encodeQr(text: string, ecc: QrEcc = "M"): QrMatrix {
  const result = encode(text, { ecc, border: QUIET_ZONE });
  return { size: result.size, version: result.version, modules: result.data };
}

/**
 * One SVG path for all dark modules (horizontal runs merged), in module units.
 * Compact and crisp at any print size.
 */
export function qrPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  matrix.modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  });
  return parts.join("");
}

export interface QrSvgOptions {
  ecc?: QrEcc;
  dark?: string;
  light?: string;
  /** Rendered width/height attribute, e.g. "256" or "25mm". Defaults to the module count. */
  size?: string;
  title?: string;
}

/** Standalone SVG document for downloads and previews. */
export function qrSvg(text: string, opts: QrSvgOptions = {}): string {
  const matrix = encodeQr(text, opts.ecc);
  const size = opts.size ?? String(matrix.size);
  const title = opts.title ? `<title>${escapeXml(opts.title)}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${matrix.size} ${matrix.size}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `${title}<rect width="100%" height="100%" fill="${opts.light ?? "#ffffff"}"/>` +
    `<path fill="${opts.dark ?? "#000000"}" d="${qrPath(matrix)}"/></svg>`
  );
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
