import { type KeyboardEvent, type ReactNode, useId, useRef } from "react";

export interface TabDef<K extends string> {
  key: K;
  label: string;
}

/** Accessible tabs (WAI-ARIA tabs pattern, automatic activation, arrow keys). */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: ReadonlyArray<TabDef<K>>;
  value: K;
  onChange: (key: K) => void;
  label: string;
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
        className="flex gap-1 border-b border-line"
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
              className={`-mb-px min-h-11 border-b-2 px-4 text-[0.95rem] font-medium ${
                selected ? "border-primary text-primary-text" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              {tab.label}
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

/** Filter chip (toggle button). */
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
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
        pressed
          ? "border-primary bg-primary-tint text-primary-text"
          : "border-line-strong bg-raised text-fg hover:bg-sunken"
      }`}
    >
      {children}
    </button>
  );
}
