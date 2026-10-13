import {
  createContext,
  type PointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useT } from "../lib/i18n";
import { Button, IconButton } from "./Button";
import { cx } from "./cx";

const PHONE = "(max-width: 39.999rem)";
const DISMISS_PX = 96;

interface SheetGuard {
  setDirty: (dirty: boolean) => void;
  /** Close the sheet the way Escape does: asks first when there are unsaved edits. */
  requestClose: () => void;
}
const NO_GUARD: SheetGuard = { setDirty: () => {}, requestClose: () => {} };
const SheetGuardContext = createContext<SheetGuard | null>(null);

/**
 * Forms inside a Sheet call this with "has unsaved edits". While true, Escape, the scrim, the close button and a
 * drag-down ask before discarding. Returns the guarded close for the Cancel button; a successful save should close
 * through the parent's own `onClose`, which never asks.
 */
export function useSheetGuard(dirty: boolean): () => void {
  const provided = useContext(SheetGuardContext);
  // A form used outside a Sheet would have a Cancel button that does nothing: fail loudly while developing.
  if (!provided && import.meta.env.DEV) throw new Error("useSheetGuard must be used inside a <Sheet>");
  const guard = provided ?? NO_GUARD;
  useEffect(() => {
    guard.setDirty(dirty);
    return () => guard.setDirty(false);
  }, [guard, dirty]);
  return guard.requestClose;
}

/**
 * Native <dialog> shown modally. Phone: glass bottom sheet with a grabber (drag down or tap the scrim to close).
 * Tablet/desktop: floating side panel. `placement="compact"`: bottom sheet on phones, small centred panel from
 * 640 px (short menus). `placement="center"`: compact alert (confirmations) on every size.
 * The browser traps focus, sends Escape as a `cancel` request and restores focus to the opener. Children mount only while open,
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
  // Latest `open` prop. The native `close` event also fires when WE close the dialog because the parent
  // set open=false (e.g. switching from one sheet to another); only user-initiated closes may call onClose,
  // otherwise that late event cancels whatever the parent just opened.
  const openRef = useRef(open);
  openRef.current = open;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const drag = useRef<{ y: number; dy: number; id: number } | null>(null);
  const titleId = useId();
  const descId = useId();
  const t = useT();
  const dirtyRef = useRef(false);
  const [asking, setAsking] = useState(false);
  const guard = useMemo<SheetGuard>(
    () => ({
      setDirty: (dirty) => {
        dirtyRef.current = dirty;
      },
      requestClose: () => {
        if (dirtyRef.current) setAsking(true);
        else onCloseRef.current();
      },
    }),
    [],
  );

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) {
      setAsking(false);
      dirtyRef.current = false;
    }
  }, [open]);

  // Tap / click on the scrim. The ::backdrop pseudo-element cannot hold a child, so its clicks target the
  // <dialog> itself; the listener is attached here rather than as JSX onClick because the keyboard equivalent is
  // the native `cancel` (Escape) handled below, not a key handler on the dialog.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === d) guard.requestClose();
    };
    d.addEventListener("click", onBackdrop);
    return () => d.removeEventListener("click", onBackdrop);
  }, [guard]);

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
      guard.requestClose();
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
      // Escape / Android back fire the native `cancel` event. It is prevented and routed through the guard; the
      // parent closes the sheet through `open`. Controls that use Escape themselves (Select, Combobox, Menu)
      // cancel the keydown, so no close request reaches the dialog. Note: Chrome makes a repeated cancel without
      // user activation non-cancelable and closes the dialog anyway; `onClose` below handles that case.
      onCancel={(e) => {
        // React bubbles `cancel`/`close` from a nested dialog (discard question, confirmations) to this one.
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        guard.requestClose();
      }}
      // Fires for every close, including ours. A late event after a programmatic close (open already false) is
      // ignored, so it cannot cancel a sheet the parent just opened. A close the parent did not ask for (open is
      // still true: the browser forced a repeated cancel) is reported; with unsaved edits the dialog is shown
      // again (children stay mounted, so nothing is lost) and the discard question is asked instead.
      onClose={(e) => {
        if (e.target !== e.currentTarget || !openRef.current) return;
        const d = ref.current;
        if (dirtyRef.current && d && !d.open) {
          d.showModal();
          setAsking(true);
          return;
        }
        onClose();
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
                onClick={guard.requestClose}
              />
            </div>
          </header>
          <SheetGuardContext.Provider value={guard}>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
          </SheetGuardContext.Provider>
          <Sheet
            open={asking}
            onClose={() => setAsking(false)}
            title={t("sheet.discardTitle")}
            placement="center"
          >
            <SheetBody>
              <p className="text-body">{t("sheet.discardBody")}</p>
            </SheetBody>
            <SheetFooter>
              <Button onClick={() => setAsking(false)}>{t("sheet.keepEditing")}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setAsking(false);
                  dirtyRef.current = false;
                  onClose();
                }}
              >
                {t("sheet.discard")}
              </Button>
            </SheetFooter>
          </Sheet>
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
