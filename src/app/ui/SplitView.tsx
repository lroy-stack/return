import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Master–detail layout. Phone: one pane at a time (`showDetail` picks which). From 768 px both panes sit side by
 * side; the list pane scrolls independently and `placeholder` fills an empty detail pane.
 */
const GRID = {
  md: {
    sm: "md:grid md:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] md:gap-6 lg:gap-8",
    md: "md:grid md:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)] md:gap-6 lg:gap-8",
  },
  xl: {
    sm: "xl:grid xl:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] xl:gap-8",
    md: "xl:grid xl:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)] xl:gap-8",
  },
} as const;

const PANES = {
  md: {
    list: "md:sticky md:top-4 md:max-h-[calc(100dvh-2rem)] md:self-start md:overflow-y-auto md:pr-1",
    listShown: "hidden md:flex",
    detailHidden: "hidden md:flex",
    placeholder: "md:flex",
  },
  xl: {
    list: "xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:self-start xl:overflow-y-auto xl:pr-1",
    listShown: "hidden xl:flex",
    detailHidden: "hidden xl:flex",
    placeholder: "xl:flex",
  },
} as const;

/**
 * Master–detail layout. Below the split breakpoint one pane shows at a time (`showDetail` picks which: push
 * navigation). From `splitFrom` (default 768 px; use `xl` when the detail pane needs ≥ 420 px next to the list)
 * both panes sit side by side; the list pane scrolls independently and `placeholder` fills an empty detail pane.
 */
export function SplitView({
  list,
  detail,
  showDetail,
  placeholder,
  listLabel,
  detailLabel,
  listWidth = "md",
  splitFrom = "md",
}: {
  list: ReactNode;
  detail: ReactNode | null;
  showDetail: boolean;
  placeholder?: ReactNode;
  listLabel: string;
  detailLabel: string;
  listWidth?: "sm" | "md";
  splitFrom?: "md" | "xl";
}) {
  const pane = PANES[splitFrom];
  return (
    <div className={GRID[splitFrom][listWidth]}>
      <section
        aria-label={listLabel}
        className={cx(showDetail ? pane.listShown : "flex", "min-h-0 min-w-0 flex-col", pane.list)}
      >
        {list}
      </section>
      <section
        aria-label={detailLabel}
        className={cx(showDetail ? "flex" : pane.detailHidden, "min-h-0 min-w-0 flex-col")}
      >
        {detail ??
          (placeholder ? (
            <div
              className={cx(
                "hidden min-h-80 flex-1 items-center justify-center rounded-card bg-sunken p-8 text-center text-muted",
                pane.placeholder,
              )}
            >
              {placeholder}
            </div>
          ) : null)}
      </section>
    </div>
  );
}
