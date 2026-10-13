import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Master–detail layout. Phone: one pane at a time (`showDetail` picks which). From 768 px both panes sit side by
 * side; the list pane scrolls independently and `placeholder` fills an empty detail pane.
 */
export function SplitView({
  list,
  detail,
  showDetail,
  placeholder,
  listLabel,
  detailLabel,
  listWidth = "md",
}: {
  list: ReactNode;
  detail: ReactNode | null;
  showDetail: boolean;
  placeholder?: ReactNode;
  listLabel: string;
  detailLabel: string;
  listWidth?: "sm" | "md";
}) {
  return (
    <div
      className={cx(
        "md:grid md:gap-6 lg:gap-8",
        listWidth === "sm"
          ? "md:grid-cols-[minmax(13rem,16rem)_1fr]"
          : "md:grid-cols-[minmax(17rem,22rem)_1fr]",
      )}
    >
      <section
        aria-label={listLabel}
        className={cx(
          showDetail ? "hidden md:flex" : "flex",
          "min-h-0 min-w-0 flex-col md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:self-start md:overflow-y-auto md:pr-1",
        )}
      >
        {list}
      </section>
      <section
        aria-label={detailLabel}
        className={cx(showDetail ? "flex" : "hidden md:flex", "min-h-0 min-w-0 flex-col")}
      >
        {detail ??
          (placeholder ? (
            <div className="hidden min-h-80 flex-1 items-center justify-center rounded-card bg-sunken p-8 text-center text-muted md:flex">
              {placeholder}
            </div>
          ) : null)}
      </section>
    </div>
  );
}
