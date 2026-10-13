import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "../lib/router";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover border-transparent",
  secondary: "bg-raised text-fg border-line-strong hover:bg-sunken",
  ghost: "bg-transparent text-fg border-transparent hover:bg-sunken",
  danger: "bg-danger text-danger-fg border-transparent hover:opacity-90",
};
const SIZES: Record<Size, string> = {
  md: "min-h-11 px-4 text-[0.95rem]",
  sm: "min-h-11 px-3 text-sm sm:min-h-9",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: Size = "md", extra = ""): string {
  return `inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition-colors duration-150 disabled:opacity-55 aria-disabled:opacity-55 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  loading,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} className="size-[1.1rem]" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  children,
  external,
  download,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: Size;
  icon?: IconName;
  className?: string;
  children: ReactNode;
  external?: boolean;
  download?: boolean | string;
}) {
  const cls = buttonClass(variant, size, className);
  const inner = (
    <>
      {icon ? <Icon name={icon} className="size-[1.1rem]" /> : null}
      {children}
    </>
  );
  if (external || download) {
    return (
      <a
        href={to}
        className={cls}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        {...(download ? { download: typeof download === "string" ? download : "" } : {})}
      >
        {inner}
      </a>
    );
  }
  return (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  variant = "ghost",
  className = "",
  ...rest
}: {
  icon: IconName;
  label: string;
  variant?: ButtonVariant;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-11 items-center justify-center rounded-xl border transition-colors duration-150 disabled:opacity-55 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
