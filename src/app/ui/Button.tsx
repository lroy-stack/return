import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "../lib/router";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/**
 * Buttons are capsules. One `primary` per view; `secondary` (neutral fill) for everything else; `tinted` for a
 * second emphasised action; `ghost` for low-emphasis/inline; `danger`/`danger-soft` for destructive actions;
 * `glass` only on top of media or floating chrome.
 */
export type ButtonVariant = "primary" | "secondary" | "tinted" | "ghost" | "danger" | "danger-soft" | "glass";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover specular",
  secondary: "bg-fill text-fg hover:bg-fill-hover active:bg-fill-pressed",
  tinted: "bg-primary-tint text-primary-text hover:bg-fill-hover",
  ghost: "bg-transparent text-primary-text hover:bg-fill",
  danger: "bg-danger text-danger-fg hover:opacity-90",
  "danger-soft": "bg-danger-tint text-danger hover:bg-fill-hover",
  glass: "glass text-fg hover:bg-raised",
};

/** Heights: sm 36 (44 on touch), md 44, lg 52. Touch targets never drop below 44 px on coarse pointers. */
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 pointer-coarse:min-h-11 px-3.5 text-subhead gap-1.5",
  md: "min-h-11 px-5 text-body gap-2",
  lg: "min-h-13 px-6 text-headline gap-2.5",
};

const ICON_SIZES: Record<ButtonSize, string> = { sm: "size-4", md: "size-[1.15rem]", lg: "size-5" };

const BASE =
  "pressable inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap select-none disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:pointer-events-none";

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra = "",
  block = false,
): string {
  return cx(BASE, VARIANTS[variant], SIZES[size], block && "w-full", extra);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Trailing icon, e.g. a chevron for "continue". */
  iconEnd?: IconName;
  /** Shows a spinner, sets aria-busy and blocks clicks; the label stays (no layout shift). */
  loading?: boolean;
  /** Full width. */
  block?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  loading,
  block,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const iconCls = ICON_SIZES[size];
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className, block)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className={iconCls} /> : icon ? <Icon name={icon} className={iconCls} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} className={iconCls} /> : null}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  block,
  className = "",
  children,
  external,
  download,
  "aria-label": ariaLabel,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconEnd?: IconName;
  block?: boolean;
  className?: string;
  children: ReactNode;
  /** Opens in a new tab with rel=noopener noreferrer. */
  external?: boolean;
  download?: boolean | string;
  "aria-label"?: string;
}) {
  const cls = buttonClass(variant, size, className, block);
  const iconCls = ICON_SIZES[size];
  const inner = (
    <>
      {icon ? <Icon name={icon} className={iconCls} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} className={iconCls} /> : null}
    </>
  );
  if (external || download) {
    return (
      <a
        href={to}
        className={cls}
        aria-label={ariaLabel}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...(download ? { download: typeof download === "string" ? download : "" } : {})}
      >
        {inner}
      </a>
    );
  }
  return (
    <Link to={to} className={cls} aria-label={ariaLabel}>
      {inner}
    </Link>
  );
}

export type IconButtonSize = "sm" | "md" | "lg";
const ICON_BUTTON_SIZES: Record<IconButtonSize, string> = {
  sm: "size-9 pointer-coarse:size-11",
  md: "size-11",
  lg: "size-14",
};

/** Classes of an icon-only capsule (for custom triggers such as `Menu`). */
export function iconButtonClass(
  variant: ButtonVariant = "ghost",
  size: IconButtonSize = "md",
  extra = "",
): string {
  const tone =
    variant === "ghost" ? "bg-transparent text-fg hover:bg-fill active:bg-fill-pressed" : VARIANTS[variant];
  return cx(
    "pressable inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-50",
    tone,
    ICON_BUTTON_SIZES[size],
    extra,
  );
}

/** Icon-only button. `label` becomes the accessible name and tooltip. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  className = "",
  ...rest
}: {
  icon: IconName;
  label: string;
  variant?: ButtonVariant;
  size?: IconButtonSize;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={iconButtonClass(variant, size, className)}
      {...rest}
    >
      <Icon name={icon} className={size === "lg" ? "size-6" : "size-5"} />
    </button>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("animate-spin", className)} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
