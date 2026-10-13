import { type PointerEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { useT } from "../lib/i18n";
import { IconButton } from "./Button";
import { cx } from "./cx";

const PHONE = "(max-width: 39.999rem)";
const DISMISS_PX = 96;

/**
 * Native <dialog> shown modally. Phone: glass bottom sheet with a grabber (drag down or tap the scrim to close).
 * Tablet/desktop: floating side panel. `placement="compact"`: bottom sheet on phones, small centred panel from
 * 640 px (short menus). `placement="center"`: compact alert (confirmations) on every size.
 * The browser traps focus, closes on Escape and restores focus to the opener. Children mount only while open,
 * so forms reset every time.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  size = "md",
  placement = "auto",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: "md" | "lg";
  placement?: "auto" | "compact" | "center";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; dy: number; id: number } | null>(null);
  const titleId = useId();
  const descId = useId();
  const t = useT();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const canDrag = () => placement !== "center" && window.matchMedia(PHONE).matches;

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (!canDrag() || (e.target as HTMLElement).closest("button")) return;
    drag.current = { y: e.clientY, dy: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    ref.current?.setAttribute("data-dragging", "");
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || d.id !== e.pointerId) return;
    d.dy = Math.max(0, e.clientY - d.y);
    el.style.transform = `translateY(${d.dy}px)`;
  };
  const endDrag = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || d.id !== e.pointerId) return;
    drag.current = null;
    el.removeAttribute("data-dragging");
    if (d.dy > DISMISS_PX) {
      el.style.transform = "";
      onClose();
      return;
    }
    el.style.transition = "transform var(--dur-slow) var(--ease-spring)";
    el.style.transform = "";
    window.setTimeout(() => {
      el.style.transition = "";
    }, 320);
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      data-size={size}
      data-placement={placement === "auto" ? undefined : placement}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
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
          <header
            className={cx("shrink-0 touch-none select-none", placement !== "center" && "max-sm:cursor-grab")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {placement !== "center" ? (
              <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
                <span className="h-1.5 w-9 rounded-full bg-fg/25" />
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3 sm:pt-4">
              <div className="min-w-0 pt-1.5">
                <h2 id={titleId} className="text-title3 font-semibold">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-0.5 text-subhead text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton
                icon="close"
                label={t("common.close")}
                variant="secondary"
                size="sm"
                onClick={onClose}
              />
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
        </>
      ) : null}
    </dialog>
  );
}

export function SheetBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex flex-col gap-5 px-5 pt-1 pb-5", className)}>{children}</div>;
}

/** Sticky action bar. Order: secondary (Cancel) first, primary last (right / bottom on phones). */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 mt-auto flex flex-wrap justify-end gap-2 border-t border-line/70 bg-[var(--glass-solid)] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:[&>*]:flex-1">
      {children}
    </div>
  );
}
