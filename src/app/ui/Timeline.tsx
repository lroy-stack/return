import type { ReactNode } from "react";
import { cx } from "./cx";

export type TimelineTone = "neutral" | "lost" | "success" | "info";

export interface TimelineEntry {
  key: string;
  /** Status pill or short title. */
  title: ReactNode;
  /** Formatted time; pass the ISO value as `datetime` for machines. */
  time: string;
  datetime?: string;
  body?: ReactNode;
  actions?: ReactNode;
  tone?: TimelineTone;
}

const DOT: Record<TimelineTone, string> = {
  neutral: "bg-line-strong",
  lost: "bg-lost",
  success: "bg-success",
  info: "bg-primary",
};

/** Chronological history (recoveries, activity). Newest first; the rail is decorative. */
export function Timeline({ entries, label }: { entries: ReadonlyArray<TimelineEntry>; label?: string }) {
  return (
    <ol aria-label={label} className="relative flex flex-col gap-5">
      {entries.map((e, i) => (
        <li key={e.key} className="relative grid grid-cols-[1.25rem_1fr] gap-x-3">
          <span aria-hidden="true" className="relative flex justify-center">
            <span className={cx("mt-1.5 size-3 rounded-full ring-4 ring-raised", DOT[e.tone ?? "neutral"])} />
            {i < entries.length - 1 ? (
              <span className="absolute top-5 -bottom-5 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-line" />
            ) : null}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-body font-medium">{e.title}</span>
              <time dateTime={e.datetime} className="text-footnote text-muted">
                {e.time}
              </time>
            </div>
            {e.body ? <div className="mt-1 text-subhead text-muted">{e.body}</div> : null}
            {e.actions ? <div className="mt-2 flex flex-wrap gap-2">{e.actions}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
