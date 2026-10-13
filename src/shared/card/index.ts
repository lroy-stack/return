/**
 * Printable luggage-tag cards: `buildCard` lays out both faces as a pure model, `renderSvg` turns a
 * face into a standalone SVG. The PDF renderer (./pdf, pulls in pdf-lib) and PNG metadata helper
 * (./png) are imported directly by the print studio and intentionally not re-exported here.
 */
export { BRAND_MARK, CARD_COPY, PROOF_WATERMARK, REWARD_LINE } from "./copy";
export {
  boxesOverlap,
  boxInside,
  boxIntersectsCircle,
  elementBounds,
  flipToBack,
  keepOutZones,
  safeBox,
} from "./geometry";
export { type CardOverrides, cardInputFromSettings } from "./input";
export { buildCard, CardLayoutError, DEFAULT_TEMPLATE, MM_PER_PT, resolveTemplate } from "./layout";
export { fitText, measureText } from "./metrics";
export { renderSvg, roundedRectPath, type SvgOptions, watermarkGeometry } from "./svg";
export { CARD_PALETTES } from "./themes";
export type * from "./types";
export { displayUrl, isProofUrl, urlByteLength } from "./url";
