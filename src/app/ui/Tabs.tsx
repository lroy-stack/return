import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";
import { cx } from "./cx";

export interface TabDef<K extends string> {
  key: K;
  label: string;
  /** Optional count shown after the label (e.g. unread). */
  count?: number;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern, automatic activation, arrow keys, Home/End). Use to switch between
 * views of the same object. `variant="pill"` is the iOS-style capsule bar; `underline` suits dense desktop panels.
 */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  variant = "pill",
  children,
}: {
  tabs: ReadonlyArray<TabDef<K>>;
  value: K;
  onChange: (key: K) => void;
  label: string;
  variant?: "pill" | "underline";
  children: ReactNode;
}) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.key === value);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.key);
    refs.current[target.key]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cx(
          "flex max-w-full overflow-x-auto",
          variant === "pill" ? "w-fit gap-0.5 rounded-full bg-fill p-0.5" : "gap-1 border-b border-line",
        )}
      >
        {tabs.map((tab) => {
          const selected = tab.key === value;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                refs.current[tab.key] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.key)}
              className={cx(
                "inline-flex shrink-0 items-center gap-1.5 font-semibold whitespace-nowrap transition-colors duration-150",
                variant === "pill"
                  ? cx(
                      "min-h-10 rounded-full px-4 text-subhead pointer-coarse:min-h-11",
                      selected ? "bg-raised text-fg shadow-card" : "text-muted hover:text-fg",
                    )
                  : cx(
                      "-mb-px min-h-11 border-b-2 px-4 text-subhead",
                      selected
                        ? "border-primary text-primary-text"
                        : "border-transparent text-muted hover:text-fg",
                    ),
              )}
            >
              {tab.label}
              {tab.count ? (
                <span className="rounded-full bg-fill px-1.5 text-caption tabular-nums">{tab.count}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`} className="pt-4">
        {children}
      </div>
    </div>
  );
}

/** Filter chip (toggle button with aria-pressed). Use in a wrapping row for filters that combine. */
export function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "pressable inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-subhead font-semibold pointer-coarse:min-h-11",
        pressed ? "bg-primary text-primary-fg" : "bg-fill text-fg hover:bg-fill-hover",
      )}
    >
      {children}
    </button>
  );
}
