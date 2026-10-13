import type { ItemCategory } from "../../shared/schemas";
import { cx } from "./cx";
import { ItemArt } from "./ItemArt";

export type ThumbSize = "xs" | "sm" | "md" | "lg" | "xl" | "fill";

const SIZES: Record<ThumbSize, string> = {
  xs: "size-8 rounded-lg",
  sm: "size-10 rounded-[0.625rem]",
  md: "size-12 rounded-control",
  lg: "size-16 rounded-[1.125rem]",
  xl: "size-24 rounded-card",
  fill: "size-full",
};
/** Illustration size inside the tile: the art carries its own margin, so small tiles use all of it. */
const ART: Record<ThumbSize, string> = {
  xs: "size-full",
  sm: "size-full",
  md: "size-full",
  lg: "size-full",
  xl: "size-full",
  fill: "aspect-square h-[88%] max-h-64",
};

/**
 * Item photo or its category illustration (ItemArt on a soft studio backdrop). Decorative by default (alt="");
 * pass `alt` when the image carries information not in adjacent text (it also names the illustration).
 */
export function Thumb({
  src,
  category,
  size = "md",
  alt = "",
  className,
  loading = "lazy",
}: {
  src?: string | null;
  category: ItemCategory;
  size?: ThumbSize;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const base = cx("relative shrink-0 overflow-hidden", SIZES[size], className);
  if (src) {
    return (
      <span className={cx(base, "bg-sunken")}>
        <img src={src} alt={alt} loading={loading} decoding="async" className="size-full object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cx(
        base,
        "flex items-center justify-center bg-[radial-gradient(120%_120%_at_30%_15%,var(--raised),var(--sunken))]",
      )}
    >
      <ItemArt category={category} label={alt || undefined} className={ART[size]} />
    </span>
  );
}

/** Person initial avatar (finders, trusted contacts). Initial only, never a photo of a stranger. */
export function Avatar({ name, size = "sm" }: { name: string | null | undefined; size?: "sm" | "md" }) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent-tint font-semibold text-accent-text",
        size === "sm" ? "size-9 text-subhead" : "size-12 text-headline",
      )}
    >
      {initial}
    </span>
  );
}
