import type { ItemCategory } from "../../shared/schemas";
import { categoryIcon } from "../lib/categories";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type ThumbSize = "xs" | "sm" | "md" | "lg" | "xl" | "fill";

const SIZES: Record<ThumbSize, string> = {
  xs: "size-8 rounded-lg",
  sm: "size-10 rounded-[0.625rem]",
  md: "size-12 rounded-control",
  lg: "size-16 rounded-[1.125rem]",
  xl: "size-24 rounded-card",
  fill: "size-full",
};
const ICONS: Record<ThumbSize, string> = {
  xs: "size-4",
  sm: "size-5",
  md: "size-6",
  lg: "size-7",
  xl: "size-10",
  fill: "size-1/4 min-h-8 min-w-8",
};

/**
 * Item photo or its category fallback (soft tinted gradient + line icon). Decorative by default (alt="");
 * pass `alt` when the image carries information not in adjacent text.
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
        "flex items-center justify-center bg-[radial-gradient(120%_120%_at_20%_10%,var(--raised),var(--primary-tint))] text-primary-text",
      )}
    >
      <Icon
        name={categoryIcon(category)}
        className={ICONS[size]}
        strokeWidth={size === "fill" ? 1.25 : 1.6}
      />
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
