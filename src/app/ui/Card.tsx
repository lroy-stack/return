import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export type CardVariant = "raised" | "outline" | "inset" | "tinted" | "lost";
export type CardPadding = "none" | "sm" | "md";

const VARIANTS: Record<CardVariant, string> = {
  raised: "bg-raised shadow-card ring-1 ring-line/70",
  outline: "bg-raised ring-1 ring-line-strong/50",
  inset: "bg-sunken",
  tinted: "bg-primary-tint/60",
  lost: "bg-lost-tint ring-1 ring-lost/30",
};
const PADDING: Record<CardPadding, string> = { none: "", sm: "p-3", md: "p-4 sm:p-5" };

/**
 * Content container (content layer: never glass). `raised` is the default surface; `inset` groups secondary
 * information; `lost` is reserved for the lost-item state.
 */
export function Card({
  children,
  className = "",
  as: Tag = "section",
  variant = "raised",
  padding = "md",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
  variant?: CardVariant;
  padding?: CardPadding;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  return (
    <Tag className={cx("rounded-card", VARIANTS[variant], PADDING[padding], className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Heading row inside a Card: title (h2), optional description, actions top-right. */
export function SectionHeading({
  id,
  title,
  description,
  actions,
  icon,
  level = 2,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  level?: 2 | 3;
}) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <H
          id={id}
          className={cx(
            "flex items-center gap-2 font-semibold",
            level === 2 ? "text-title3" : "text-headline",
          )}
        >
          {icon}
          {title}
        </H>
        {description ? <p className="mt-0.5 text-subhead text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Page section without a card frame (iOS grouped style): small heading above, content (often a `List`) below,
 * optional footer note. Use for settings and detail pages instead of stacking cards.
 *
 * `collapsible` turns the section into a native disclosure (a framed row with the title and an optional
 * `summary`; the content, `actions` and `footer` appear when it is open). Use it for secondary or private
 * information on long pages. Keyboard and find-in-page work without JS.
 */
export function Section({
  id,
  title,
  description,
  actions,
  footer,
  children,
  className,
  collapsible,
  defaultOpen,
  summary,
}: {
  id?: string;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Needs `title`. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Short state shown on the closed row, e.g. a count. */
  summary?: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  if (collapsible && title) {
    return (
      <details
        id={id}
        open={defaultOpen}
        className={cx("group rounded-card bg-raised shadow-card ring-1 ring-line/70", className)}
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-card px-4 py-2.5 select-none hover:bg-fill [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-col">
            <h2 id={headingId} className="text-headline font-semibold">
              {title}
            </h2>
            {description ? <span className="text-footnote text-muted">{description}</span> : null}
          </span>
          {summary ? <span className="shrink-0 text-footnote text-muted">{summary}</span> : null}
          <Icon
            name="chevron_down"
            className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
          {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
          {children}
          {footer ? <div className="text-footnote text-muted">{footer}</div> : null}
        </div>
      </details>
    );
  }
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cx("flex flex-col gap-2", className)}
    >
      {title || actions ? (
        <div className="flex min-h-9 items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title ? (
              <h2 id={headingId} className="text-headline font-semibold">
                {title}
              </h2>
            ) : null}
            {description ? <p className="text-footnote text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      {children}
      {footer ? <div className="px-1 text-footnote text-muted">{footer}</div> : null}
    </section>
  );
}
