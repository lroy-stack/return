import type { ReactNode } from "react";
import { Link } from "../lib/router";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * iOS inset grouped list: rounded container, hairline separators inset after the leading media.
 * Children are `ListRow`s (each renders its own <li>).
 */
export function List({
  children,
  label,
  className,
  variant = "inset",
}: {
  children: ReactNode;
  /** Accessible name when the list has no visible heading. */
  label?: string;
  className?: string;
  /** inset: own rounded surface; plain: no container (inside a Card). */
  variant?: "inset" | "plain";
}) {
  return (
    <ul
      aria-label={label}
      className={cx(
        "flex flex-col [&>li+li]:border-t [&>li+li]:border-line",
        variant === "inset" && "overflow-hidden rounded-card bg-raised shadow-card ring-1 ring-line/70",
        className,
      )}
    >
      {children}
    </ul>
  );
}

interface RowContent {
  /** Leading media: Thumb, Avatar or an icon tile. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Third line, e.g. a message preview. */
  description?: ReactNode;
  /** Right side: time, badge, value, toggle. */
  trailing?: ReactNode;
  /** Emphasise (unread). */
  strong?: boolean;
  tone?: "default" | "danger" | "primary";
}

const TONE = { default: "text-fg", danger: "text-danger", primary: "text-primary-text" };

function RowBody({ leading, title, subtitle, description, trailing, strong, tone = "default" }: RowContent) {
  return (
    <>
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cx("truncate text-body", strong ? "font-semibold" : "font-medium", TONE[tone])}>
          {title}
        </span>
        {subtitle ? <span className="truncate text-subhead text-muted">{subtitle}</span> : null}
        {description ? <span className="line-clamp-2 text-subhead">{description}</span> : null}
      </span>
      {trailing ? (
        <span className="flex shrink-0 flex-col items-end gap-1 text-footnote text-muted">{trailing}</span>
      ) : null}
    </>
  );
}

const ROW = "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left";
const INTERACTIVE = "transition-colors duration-150 hover:bg-fill active:bg-fill-pressed";

/**
 * One row. Pass `to` (in-app link, with chevron), `href` (external), `onClick` (button) or nothing (static).
 * `current` marks the selected row in master–detail layouts.
 */
export function ListRow({
  to,
  href,
  onClick,
  current,
  chevron,
  className,
  ...content
}: RowContent & {
  to?: string;
  href?: string;
  onClick?: () => void;
  current?: boolean;
  /** Defaults to true for `to` links. */
  chevron?: boolean;
  className?: string;
}) {
  const showChevron = chevron ?? Boolean(to);
  const tail = showChevron ? <Icon name="chevron" className="size-4 shrink-0 text-muted" /> : null;
  const selected = current ? "bg-primary-tint/70 hover:bg-primary-tint" : "";
  if (to) {
    return (
      <li className={className}>
        <Link to={to} aria-current={current ? "page" : undefined} className={cx(ROW, INTERACTIVE, selected)}>
          <RowBody {...content} />
          {tail}
        </Link>
      </li>
    );
  }
  if (href) {
    return (
      <li className={className}>
        <a href={href} target="_blank" rel="noopener noreferrer" className={cx(ROW, INTERACTIVE)}>
          <RowBody {...content} />
          <Icon name="external" className="size-4 shrink-0 text-muted" />
        </a>
      </li>
    );
  }
  if (onClick) {
    return (
      <li className={className}>
        <button type="button" onClick={onClick} className={cx(ROW, INTERACTIVE, selected)}>
          <RowBody {...content} />
          {tail}
        </button>
      </li>
    );
  }
  return (
    <li className={cx(ROW, className)}>
      <RowBody {...content} />
    </li>
  );
}

/** Rounded square icon tile for list rows (settings-style). */
export function IconTile({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "accent" | "lost" | "neutral";
}) {
  const tones = {
    primary: "bg-primary-tint text-primary-text",
    accent: "bg-accent-tint text-accent-text",
    lost: "bg-lost-tint text-lost",
    neutral: "bg-fill text-fg",
  };
  return (
    <span className={cx("inline-flex size-8 items-center justify-center rounded-[0.5rem]", tones[tone])}>
      {children}
    </span>
  );
}
