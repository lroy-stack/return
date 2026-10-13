import type { SVGProps } from "react";
import {
  EMPTY_ART,
  EMPTY_TONE_OPACITY,
  type EmptyArtName,
  type FilledIconName,
  ICON_FILLS,
  ICONS,
  type IconName,
  type IconPaths,
} from "./icons.generated";

export type { EmptyArtName, FilledIconName, IconName };

/**
 * Stroke width (grid units) for a rendered size: the line stays 1.3–2.3 px, so 16 px icons don't fade and
 * 32 px icons don't shout (optical sizing, docs/design/system.md §10). The finder sprite uses the same table.
 */
export function opticalStroke(px: number): number {
  if (px <= 14) return 2.1;
  if (px <= 16) return 2;
  if (px <= 20) return 1.85;
  if (px <= 24) return 1.75;
  if (px <= 32) return 1.6;
  return 1.5;
}

/** Rendered size from the Tailwind `size-*` class callers already pass (default `size-5` = 20 px). */
function sizeFromClass(className: string): number | null {
  const m = /(?:^|\s)size-(\d+(?:\.\d+)?)(?=\s|$)/.exec(className);
  return m ? Number(m[1]) * 4 : null;
}

function Paths({ paths: [stroke, fill, fillStroke] }: { paths: IconPaths }) {
  return (
    <>
      {stroke ? <path d={stroke} /> : null}
      {fill ? <path d={fill} fill="currentColor" stroke="none" /> : null}
      {fillStroke ? <path d={fillStroke} fill="currentColor" fillRule="evenodd" /> : null}
    </>
  );
}

const hasFill = (name: IconName): name is FilledIconName => Object.hasOwn(ICON_FILLS, name);

/**
 * RETURN line icon (24-unit grid, currentColor only). Decorative by default (aria-hidden); pair it with visible
 * text or an aria-label on the parent. `variant="fill"` = solid version for selected tabs (falls back to the
 * outline for icons without one). Stroke width follows the rendered size unless `strokeWidth` is given.
 */
export function Icon({
  name,
  variant = "outline",
  className = "",
  strokeWidth,
  ...rest
}: { name: IconName; variant?: "outline" | "fill" } & SVGProps<SVGSVGElement>) {
  const size = sizeFromClass(className);
  const paths = variant === "fill" && hasFill(name) ? ICON_FILLS[name] : ICONS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? opticalStroke(size ?? 20)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${size === null && !/(^|\s)size-/.test(className) ? "size-5" : ""} ${className}`}
      {...rest}
    >
      <Paths paths={paths} />
    </svg>
  );
}

/** Empty-state line art (64-unit grid): currentColor lines plus a low-opacity tonal fill. Size it with `size-*`. */
export function EmptyArt({
  name,
  className = "",
  ...rest
}: { name: EmptyArtName } & SVGProps<SVGSVGElement>) {
  const px = sizeFromClass(className) ?? 96;
  const { paths, tone } = EMPTY_ART[name];
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={Math.min(2, Math.max(1, 128 / px))}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${/(^|\s)size-/.test(className) ? "" : "size-24"} ${className}`}
      {...rest}
    >
      {tone ? <path d={tone} fill="currentColor" fillOpacity={EMPTY_TONE_OPACITY} stroke="none" /> : null}
      <Paths paths={paths} />
    </svg>
  );
}
