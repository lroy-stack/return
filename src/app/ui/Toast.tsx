import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { Icon } from "./Icon";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const t = useT();

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const id = nextId.current++;
      setItems((xs) => [...xs.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
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
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className="animate-in pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-line bg-fg px-4 py-3 text-sm text-surface shadow-float"
          >
            <Icon name={item.tone === "error" ? "alert" : "check"} className="mt-0.5 size-4" />
            <span className="min-w-0">{item.message}</span>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="-my-1 -mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-surface/15"
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
