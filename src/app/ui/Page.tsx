import { type ReactNode, useEffect, useRef } from "react";
import { didNavigate, Link } from "../lib/router";
import { cx } from "./cx";
import { Icon } from "./Icon";

/**
 * Page heading: iOS large title (the single h1). The Shell's glass header shows a compact copy once this
 * scrolls away. Receives focus after in-app navigation so keyboard and screen-reader users land on the new page.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  badges,
  eyebrow,
  hideActionsOnPhone,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Right-aligned actions; max one primary. */
  actions?: ReactNode;
  back?: { to: string; label: string };
  badges?: ReactNode;
  /** Small line above the title (context, e.g. item category). */
  eyebrow?: ReactNode;
  /** Hide actions below 640 px when the Shell's floating action already covers them. */
  hideActionsOnPhone?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount of a new page
  useEffect(() => {
    document.title = `${title} · RETURN`;
    if (didNavigate()) ref.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    document.title = `${title} · RETURN`;
  }, [title]);

  return (
    <header className="mb-6 flex flex-col gap-2">
      {back ? (
        <Link
          to={back.to}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-0.5 rounded-full pr-3 pl-1.5 text-body font-medium text-primary-text hover:bg-fill"
        >
          <Icon name="back" className="size-5" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-0.5 text-subhead font-medium text-muted">{eyebrow}</p> : null}
          <h1
            ref={ref}
            tabIndex={-1}
            data-page-title=""
            className="text-large-title font-bold tracking-[-0.02em] outline-none"
          >
            {title}
          </h1>
          {badges ? <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div> : null}
          {subtitle ? <p className="mt-1 max-w-prose text-body text-muted">{subtitle}</p> : null}
        </div>
        {actions ? (
          <div
            className={cx(
              "flex flex-wrap items-center gap-2 max-sm:w-full",
              hideActionsOnPhone && "max-sm:hidden",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Action bar. `floating`: glass capsule pinned above the bottom chrome (bulk selection, unsaved changes).
 * Inline: a row of controls aligned with the content (filters).
 */
export function Toolbar({
  children,
  label,
  floating,
  className,
}: {
  children: ReactNode;
  /** Accessible name of the toolbar. */
  label: string;
  floating?: boolean;
  className?: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cx(
        "flex flex-wrap items-center gap-2",
        floating &&
          "glass no-print fixed inset-x-3 bottom-[calc(var(--shell-bottom)+0.75rem)] z-30 mx-auto max-w-xl justify-between rounded-full py-2 pr-2 pl-4 sm:bottom-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
