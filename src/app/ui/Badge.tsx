import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type BadgeTone = "neutral" | "lost" | "success" | "info" | "danger" | "warning";

const TINTED: Record<BadgeTone, string> = {
  neutral: "bg-fill text-muted",
  lost: "bg-lost-tint text-lost",
  success: "bg-success-tint text-success",
  info: "bg-primary-tint text-primary-text",
  danger: "bg-danger-tint text-danger",
  warning: "bg-warning-tint text-warning",
};

const SOLID: Record<BadgeTone, string> = {
  neutral: "bg-fg text-surface",
  lost: "bg-lost text-lost-fg",
  success: "bg-success text-surface",
  info: "bg-primary text-primary-fg",
  danger: "bg-danger text-danger-fg",
  warning: "bg-warning text-surface",
};

/**
 * Compact label for a property ("NFC: none", "Archived"). Always text (plus optional icon): never colour alone.
 * `solid` only on photos/media where a tint would not read.
 */
export function Badge({
  tone = "neutral",
  icon,
  solid,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  solid?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap",
        solid ? SOLID[tone] : TINTED[tone],
      )}
    >
      {icon ? <Icon name={icon} className="size-3.5" /> : null}
      {children}
    </span>
  );
}

const DOT: Record<BadgeTone, string> = {
  neutral: "bg-muted",
  lost: "bg-lost",
  success: "bg-success",
  info: "bg-primary",
  danger: "bg-danger",
  warning: "bg-warning",
};

/**
 * State of a thing (item lost/with you, conversation open/closed, proposal accepted…): dot + label.
 * `pulse` marks a live state that needs the owner (e.g. lost), motion-safe only.
 */
export function StatusPill({
  tone = "neutral",
  pulse,
  solid,
  children,
}: {
  tone?: BadgeTone;
  pulse?: boolean;
  solid?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-caption font-semibold whitespace-nowrap",
        solid ? SOLID[tone] : TINTED[tone],
      )}
    >
      <span className="relative inline-flex size-2" aria-hidden="true">
        {pulse ? (
          <span
            className={cx(
              "absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping",
              solid ? "bg-current" : DOT[tone],
            )}
          />
        ) : null}
        <span className={cx("relative inline-flex size-2 rounded-full", solid ? "bg-current" : DOT[tone])} />
      </span>
      {children}
    </span>
  );
}

/** Numeric badge for nav items and tabs. `label` is the spoken form, e.g. "3 unread". */
export function CountBadge({
  count,
  label,
  className,
}: {
  count: number;
  label: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cx(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-lost px-1.5 text-caption font-bold text-lost-fg tabular-nums",
        className,
      )}
    >
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
