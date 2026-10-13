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
  tone?: "default" | "danger" | "primary" | "lost";
}

const TONE = { default: "text-fg", danger: "text-danger", primary: "text-primary-text", lost: "text-lost" };

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
/** Inside a padded container (collapsible section, card): the row's hover/selection bleeds 8 px past the text. */
const ROW_FLUSH =
  "-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 py-2.5 text-left";
const INTERACTIVE = "transition-colors duration-150 hover:bg-fill active:bg-fill-pressed";

/** Multi-select support: a 48 px checkbox cell before the row, or a spacer to keep unselectable rows aligned. */
export interface RowSelect {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Select RT-001". */
  label: string;
}

/**
 * One row. Pass `to` (in-app link, with chevron), `href` (external), `onClick` (button) or nothing (static).
 * `current` marks the selected row in master–detail layouts. `select` adds a checkbox cell for bulk actions.
 */
export function ListRow({
  to,
  href,
  onClick,
  current,
  chevron,
  flush,
  select,
  className,
  ...content
}: RowContent & {
  to?: string;
  href?: string;
  onClick?: () => void;
  current?: boolean;
  /** Defaults to true for `to` links. */
  chevron?: boolean;
  /** Use inside a padded container instead of an inset `List`. */
  flush?: boolean;
  /** Checkbox before the row (`"spacer"` keeps alignment for rows that cannot be selected). */
  select?: RowSelect | "spacer";
  className?: string;
}) {
  const row = flush ? ROW_FLUSH : ROW;
  const showChevron = chevron ?? Boolean(to);
  const tail = showChevron ? <Icon name="chevron" className="size-4 shrink-0 text-muted" /> : null;
  const selected = current ? "bg-primary-tint/70 hover:bg-primary-tint" : "";
  const grow = select ? "min-w-0 flex-1 pl-1" : "";
  const wrap = (main: ReactNode) =>
    select ? (
      <li className={cx("flex items-center", className)}>
        {select === "spacer" ? (
          <span aria-hidden="true" className="size-12 shrink-0 pl-1" />
        ) : (
          <label className="flex size-12 shrink-0 cursor-pointer items-center justify-center pl-1">
            <input
              type="checkbox"
              className="size-5 cursor-pointer accent-primary"
              checked={select.checked}
              onChange={(e) => select.onChange(e.target.checked)}
            />
            <span className="sr-only">{select.label}</span>
          </label>
        )}
        {main}
      </li>
    ) : (
      <li className={className}>{main}</li>
    );
  if (to) {
    return wrap(
      <Link
        to={to}
        aria-current={current ? "page" : undefined}
        className={cx(row, INTERACTIVE, selected, grow)}
      >
        <RowBody {...content} />
        {tail}
      </Link>,
    );
  }
  if (href) {
    return wrap(
      <a href={href} target="_blank" rel="noopener noreferrer" className={cx(row, INTERACTIVE, grow)}>
        <RowBody {...content} />
        <Icon name="external" className="size-4 shrink-0 text-muted" />
      </a>,
    );
  }
  if (onClick) {
    return wrap(
      <button type="button" onClick={onClick} className={cx(row, INTERACTIVE, selected, grow)}>
        <RowBody {...content} />
        {tail}
      </button>,
    );
  }
  return (
    <li className={cx(row, className)}>
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
