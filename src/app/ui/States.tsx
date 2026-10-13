import type { ReactNode } from "react";
import { ApiRequestError } from "../lib/api";
import { useT } from "../lib/i18n";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/**
 * Nothing to show yet. Always say why and offer the next step. `compact` for empty sections inside a page.
 */
export function EmptyState({
  icon = "box_open",
  title,
  children,
  action,
  compact,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  const H = compact ? "h3" : "h2";
  return (
    <div
      className={cx(
        "flex flex-col items-center text-center",
        compact ? "gap-2 rounded-card bg-sunken px-5 py-6" : "gap-3 px-6 py-12",
      )}
    >
      <span
        className={cx(
          "flex items-center justify-center rounded-full bg-primary-tint text-primary-text",
          compact ? "size-11" : "size-16",
        )}
      >
        <Icon name={icon} className={compact ? "size-5" : "size-8"} strokeWidth={1.5} />
      </span>
      <H className={compact ? "text-headline font-semibold" : "text-title3 font-semibold"}>{title}</H>
      {children ? <p className="max-w-sm text-subhead text-muted">{children}</p> : null}
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function errorMessage(error: unknown, t: ReturnType<typeof useT>): string {
  if (error instanceof ApiRequestError) {
    if (error.isNetwork) return t("error.network");
    if (error.status === 401) return t("error.unauthorized");
    if (error.status === 404 && error.code === "http_error") return t("error.notAvailable");
    if (error.status >= 500) return t("error.server");
    return error.message;
  }
  return t("error.generic");
}

/** Failed to load. Says what happened in plain words and offers a retry when one can help. */
export function ErrorState({
  error,
  onRetry,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div
      role="alert"
      className={cx(
        "flex rounded-card bg-danger-tint",
        compact ? "items-center gap-3 px-4 py-3" : "flex-col items-center gap-3 px-6 py-10 text-center",
      )}
    >
      <Icon name="alert" className={cx("shrink-0 text-danger", compact ? "size-5" : "size-8")} />
      <p className={cx("font-medium text-danger", compact ? "min-w-0 flex-1 text-subhead" : "max-w-md")}>
        {errorMessage(error, t)}
      </p>
      {onRetry ? (
        <Button icon="refresh" size={compact ? "sm" : "md"} onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}

/** Placeholder block with the final size of the content it stands for (no layout shift). */
export function Skeleton({ className = "h-20" }: { className?: string }) {
  return <div aria-hidden="true" className={cx("skeleton", className)} />;
}

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** Skeleton list rows (thumb + two lines) inside an inset list frame. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="overflow-hidden rounded-card bg-raised ring-1 ring-line/70">
      {SKELETON_KEYS.slice(0, rows).map((k) => (
        <div key={k} className="flex items-center gap-3 border-line px-4 py-3 not-first:border-t">
          <Skeleton className="size-10 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingBlock({
  label,
  rows = 3,
  variant = "blocks",
}: {
  label?: string;
  rows?: number;
  variant?: "blocks" | "rows";
}) {
  const t = useT();
  return (
    <div role="status" aria-label={label ?? t("common.loading")} className="flex flex-col gap-3">
      {variant === "rows" ? (
        <SkeletonRows rows={rows} />
      ) : (
        SKELETON_KEYS.slice(0, rows).map((k) => <Skeleton key={k} className="h-20 rounded-card" />)
      )}
      <span className="sr-only">{label ?? t("common.loading")}</span>
    </div>
  );
}
