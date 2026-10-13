import type { ReactNode } from "react";
import { ApiRequestError } from "../lib/api";
import { useT } from "../lib/i18n";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon = "box_open",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong px-6 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-tint text-primary-text">
        <Icon name={icon} className="size-7" />
      </span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <p className="max-w-md text-muted">{children}</p> : null}
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

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-danger/40 bg-danger-tint px-6 py-8 text-center"
    >
      <Icon name="alert" className="size-7 text-danger" />
      <p className="max-w-md font-medium text-danger">{errorMessage(error, t)}</p>
      {onRetry ? (
        <Button icon="refresh" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = "h-20" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

export function LoadingBlock({ label, rows = 3 }: { label?: string; rows?: number }) {
  const t = useT();
  return (
    <div role="status" aria-label={label ?? t("common.loading")} className="flex flex-col gap-3">
      {SKELETON_KEYS.slice(0, rows).map((k) => (
        <Skeleton key={k} className="h-20" />
      ))}
      <span className="sr-only">{label ?? t("common.loading")}</span>
    </div>
  );
}
