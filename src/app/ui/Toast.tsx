import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type ToastTone = "success" | "error" | "info";
export interface ToastOptions {
  /** One short action, e.g. Undo. Runs once and dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Stays until dismissed (e.g. "Update ready"); the user can still close it. */
  sticky?: boolean;
}
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastOptions["action"];
}

type Push = (message: string, tone?: ToastTone, options?: ToastOptions) => void;
const ToastContext = createContext<Push>(() => undefined);
export const useToast = () => useContext(ToastContext);

const ICON: Record<ToastTone, { name: IconName; cls: string }> = {
  success: { name: "check", cls: "bg-success text-surface" },
  error: { name: "alert", cls: "bg-danger text-danger-fg" },
  info: { name: "info", cls: "bg-primary text-primary-fg" },
};

/**
 * Glass capsule toasts above the bottom chrome. Success/info are polite status messages (4.5 s; 8 s with an
 * action); errors are alerts and stay 8 s. Max three on screen.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const t = useT();

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback<Push>(
    (message, tone = "success", options = {}) => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { id, message, tone, action: options.action }]);
      if (!options.sticky)
        window.setTimeout(() => dismiss(id), tone === "error" || options.action ? 8000 : 4500);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--shell-bottom)+0.75rem)] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className="glass animate-in pointer-events-auto flex max-w-md items-center gap-3 rounded-full py-2 pr-2 pl-2.5 text-subhead text-fg"
          >
            <span
              className={cx(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-full",
                ICON[item.tone].cls,
              )}
            >
              <Icon name={ICON[item.tone].name} className="size-4" />
            </span>
            <span className="min-w-0 py-1 font-medium">{item.message}</span>
            {item.action ? (
              <button
                type="button"
                onClick={() => {
                  item.action?.onClick();
                  dismiss(item.id);
                }}
                className="min-h-9 shrink-0 rounded-full px-3 font-semibold text-on-glass-primary hover:bg-fill pointer-coarse:min-h-11"
              >
                {item.action.label}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-on-glass-muted hover:bg-fill pointer-coarse:size-11"
              aria-label={t("common.close")}
            >
              <Icon name="close" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
