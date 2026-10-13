import { type ReactNode, useEffect, useRef } from "react";
import { didNavigate, Link } from "../lib/router";
import { Icon } from "./Icon";

/** Page heading (the single h1). Receives focus after in-app navigation so keyboard and screen-reader users land on the new page. */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  badges,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  badges?: ReactNode;
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
    <header className="mb-5 flex flex-col gap-3">
      {back ? (
        <Link
          to={back.to}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary-text hover:underline"
        >
          <Icon name="back" className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 ref={ref} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none sm:text-3xl">
            {title}
          </h1>
          {badges ? <div className="mt-2 flex flex-wrap items-center gap-2">{badges}</div> : null}
          {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
