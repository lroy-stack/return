import { type ReactNode, useEffect, useId, useRef } from "react";
import { useT } from "../lib/i18n";
import { IconButton } from "./Button";

/**
 * Native <dialog> shown modally: bottom sheet on phones, centred modal from md.
 * The browser traps focus, closes on Escape and restores focus to the opener.
 * Children mount only while open, so forms reset every time.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const t = useT();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      data-size={size}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <>
          <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3">
            <div className="min-w-0 pt-1.5">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
            </div>
            <IconButton icon="close" label={t("common.close")} onClick={onClose} />
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </>
      ) : null}
    </dialog>
  );
}

export function SheetBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 px-5 py-4">{children}</div>;
}

export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-auto flex flex-wrap justify-end gap-2 border-t border-line bg-raised px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}
