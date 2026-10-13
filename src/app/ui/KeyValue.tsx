import type { ReactNode } from "react";
import { cx } from "./cx";

export interface KeyValueEntry {
  key: string;
  label: string;
  value: ReactNode;
  /** Placeholder when value is empty (rendered muted), e.g. t("common.none"). */
  empty?: string;
  mono?: boolean;
  tone?: "default" | "warning" | "lost";
}

const TONE = { default: "", warning: "text-warning", lost: "text-lost" };

/**
 * Read-only facts as a description list. `stacked` (label above value) for narrow cards; `inline` (label left,
 * value right) for settings-like rows; `grid` for 2-column facts on wide screens.
 */
export function KeyValue({
  entries,
  layout = "stacked",
  className,
}: {
  entries: ReadonlyArray<KeyValueEntry>;
  layout?: "stacked" | "inline" | "grid";
  className?: string;
}) {
  return (
    <dl
      className={cx(
        layout === "grid" && "grid gap-x-6 gap-y-3 sm:grid-cols-2",
        layout === "stacked" && "flex flex-col gap-3",
        layout === "inline" && "flex flex-col [&>div+div]:border-t [&>div+div]:border-line",
        className,
      )}
    >
      {entries.map((e) => {
        const isEmpty = e.value === null || e.value === undefined || e.value === "";
        return (
          <div
            key={e.key}
            className={cx(
              "min-w-0",
              layout === "inline" && "flex min-h-11 items-baseline justify-between gap-4 py-2.5",
            )}
          >
            <dt className="text-footnote text-muted">{e.label}</dt>
            <dd
              className={cx(
                "min-w-0 text-body",
                layout === "inline" && "text-right",
                e.mono && "font-mono text-subhead tabular-nums",
                isEmpty ? "text-muted" : TONE[e.tone ?? "default"],
              )}
            >
              {isEmpty ? (e.empty ?? "—") : e.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
