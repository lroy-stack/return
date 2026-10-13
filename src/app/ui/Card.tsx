import type { ReactNode } from "react";
import { cx } from "./cx";

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
 */
export function Section({
  id,
  title,
  description,
  actions,
  footer,
  children,
  className,
}: {
  id?: string;
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
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
