import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { type TypeaheadBuffer, typeaheadMatch } from "./select-logic";

/**
 * Anchored popovers (Select, Combobox, Menu). The surface uses the Popover API (`popover="manual"`), so it is
 * promoted to the top layer: it escapes `overflow: hidden`, transforms and `backdrop-filter` of sheets and glass
 * bars, and sits above an open modal <dialog> while staying a DOM descendant of it (so it is not inert).
 * Without Popover API support it falls back to `position: fixed` with a high z-index (it can be clipped inside a
 * sheet there; coarse pointers use native controls anyway).
 */

const GAP = 6;
const EDGE = 8;
/** Prefer opening below unless less than this much room is left there. */
const MIN_BELOW = 180;
/** Once open, keep the chosen side while at least this much room remains on it (no flip-flop while filtering). */
const MIN_KEEP = 96;

export const POPOVER_SURFACE =
  "popover-surface glass-strong fixed inset-auto z-[60] m-0 flex flex-col overflow-hidden rounded-card p-1.5 text-fg";

function supportsPopover(el: HTMLElement): boolean {
  return typeof el.showPopover === "function";
}

function isShown(el: HTMLElement): boolean {
  try {
    return el.matches(":popover-open");
  } catch {
    return false;
  }
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The visual viewport (on-screen keyboard aware) in layout-viewport coordinates. */
function viewport(): Box & { width: number } {
  const vv = window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  const width = document.documentElement.clientWidth || window.innerWidth;
  return { top, bottom: top + (vv?.height ?? window.innerHeight), left: 0, right: width, width };
}

/**
 * The part of the screen where the anchor can actually be seen: the viewport intersected with every clipping
 * ancestor (a sheet's scrolling body, a scroll pane). An anchor scrolled under a sheet header is "hidden".
 */
function visibleArea(anchor: HTMLElement): Box {
  const area: Box = viewport();
  for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" && el.tagName !== "DIALOG") break;
    if (/(auto|scroll|hidden|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
      const r = el.getBoundingClientRect();
      area.top = Math.max(area.top, r.top);
      area.bottom = Math.min(area.bottom, r.bottom);
      area.left = Math.max(area.left, r.left);
      area.right = Math.min(area.right, r.right);
    }
  }
  return area;
}

export interface AnchorOptions {
  /** Popover at least as wide as the anchor (listboxes). */
  matchWidth?: boolean;
  /** Horizontal alignment with the anchor. */
  align?: "start" | "end";
  /** Upper bound for the height in px (content scrolls inside). */
  maxHeight?: number;
  /** Called when the anchor scrolls out of view or under a clipping edge (the caller closes). */
  onAnchorHidden?: () => void;
}

/**
 * Place `popover` next to `anchor`: below if there is room, else above; clamped to the visual viewport. Above
 * placement is anchored with `bottom`, so a list that shrinks or grows (Combobox filtering) stays attached to
 * the field. Returns false when the anchor is no longer visible (less than half of it inside its clip area).
 */
function place(anchor: HTMLElement, el: HTMLElement, opts: AnchorOptions): boolean {
  const a = anchor.getBoundingClientRect();
  const clip = visibleArea(anchor);
  const visible = Math.min(a.bottom, clip.bottom) - Math.max(a.top, clip.top);
  if (visible < a.height / 2) return false;
  const vp = viewport();

  el.style.minWidth = opts.matchWidth ? `${Math.round(a.width)}px` : "";
  el.style.maxWidth = `${Math.min(448, vp.width - 2 * EDGE)}px`;
  // Natural height from the children's full content (scrollHeight), so measuring never resets max-height and
  // with it the inner list's scroll position.
  const cs = getComputedStyle(el);
  const chrome =
    Number.parseFloat(cs.paddingTop) +
    Number.parseFloat(cs.paddingBottom) +
    Number.parseFloat(cs.borderTopWidth) +
    Number.parseFloat(cs.borderBottomWidth);
  const natural = Array.from(el.children).reduce((h, c) => h + (c as HTMLElement).scrollHeight, chrome);
  const cap = opts.maxHeight ?? 360;

  const below = vp.bottom - a.bottom - GAP - EDGE;
  const above = a.top - vp.top - GAP - EDGE;
  const previous = el.dataset.side;
  const placeBelow =
    previous === "bottom"
      ? below >= Math.min(natural, MIN_KEEP) || below >= above
      : previous === "top"
        ? !(above >= Math.min(natural, MIN_KEEP) || above >= below)
        : below >= Math.min(natural, MIN_BELOW) || below >= above;
  const maxH = Math.max(MIN_KEEP, Math.min(cap, placeBelow ? below : above));
  el.style.maxHeight = `${maxH}px`;

  const width = el.offsetWidth;
  let left = opts.align === "end" ? a.right - width : a.left;
  left = Math.max(EDGE, Math.min(left, vp.width - EDGE - width));
  el.style.left = `${Math.round(left)}px`;
  el.dataset.side = placeBelow ? "bottom" : "top";
  // Fixed elements resolve `bottom` against the layout viewport.
  const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
  if (placeBelow) {
    el.style.top = `${Math.round(a.bottom + GAP)}px`;
    el.style.bottom = "auto";
  } else {
    el.style.top = "auto";
    el.style.bottom = `${Math.round(layoutHeight - (a.top - GAP))}px`;
  }

  // Fallback path only (not in the top layer): a transformed / filtered ancestor can become the containing block
  // of a fixed element. Correct by the measured offset so the surface still lands next to the anchor. (In the top
  // layer the viewport is always the containing block; measuring there would also catch the scale-in animation.)
  if (isShown(el)) return true;
  const r = el.getBoundingClientRect();
  const dx = r.left - left;
  if (Math.abs(dx) > 0.5) el.style.left = `${Math.round(left - dx)}px`;
  if (placeBelow) {
    const dy = r.top - (a.bottom + GAP);
    if (Math.abs(dy) > 0.5) el.style.top = `${Math.round(a.bottom + GAP - dy)}px`;
  } else {
    const dy = r.bottom - (a.top - GAP);
    if (Math.abs(dy) > 0.5) el.style.bottom = `${Math.round(layoutHeight - (a.top - GAP) + dy)}px`;
  }
  return true;
}

/**
 * Shows the popover element (rendered only while `open`) in the top layer and keeps it attached to the anchor
 * on scroll, resize, on-screen keyboard changes and whenever its own content changes size (filtering).
 */
export function useAnchoredPopover(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  popover: RefObject<HTMLElement | null>,
  opts: AnchorOptions = {},
): { reposition: () => void } {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const reposition = () => {
    const a = anchor.current;
    const el = popover.current;
    if (!a || !el) return;
    if (!place(a, el, optsRef.current)) optsRef.current.onAnchorHidden?.();
  };
  const repositionRef = useRef(reposition);
  repositionRef.current = reposition;

  useLayoutEffect(() => {
    const el = popover.current;
    if (!open || !el) return;
    if (supportsPopover(el) && !isShown(el)) {
      try {
        el.showPopover();
      } catch {
        // Not connected yet or already shown by the browser: the fixed fallback still applies.
      }
    }
    repositionRef.current();
    return () => {
      if (supportsPopover(el) && isShown(el)) el.hidePopover();
    };
  }, [open, popover]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedule = (e?: Event) => {
      // Scrolling inside the popover itself (long lists) never moves the anchor.
      if (e?.target instanceof Node && popover.current?.contains(e.target)) return;
      if (!frame)
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          repositionRef.current();
        });
    };
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    // Content changes (Combobox filtering, async rows): the popover and its children change size.
    const resize = typeof ResizeObserver === "function" ? new ResizeObserver(() => schedule()) : null;
    const el = popover.current;
    if (resize && el) {
      resize.observe(el);
      for (const child of Array.from(el.children)) resize.observe(child);
    }
    return () => {
      resize?.disconnect();
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [open, popover]);

  return { reposition };
}

/**
 * Swallow the click that completes a dismissing pointer press, once. Without this, the press that closes a
 * listbox over a sheet's scrim would also reach the scrim and close the sheet (losing the form); natively, a
 * click outside an open select popup only closes the popup. Disarmed by the next pointer press (a press that
 * produced no click, e.g. a touch scroll) or after a short timeout.
 */
function swallowNextClick(): void {
  const swallow = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    disarm();
  };
  const disarm = () => {
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("pointerdown", disarm, true);
    window.clearTimeout(timer);
  };
  window.addEventListener("click", swallow, true);
  // Registered after the current pointerdown has finished dispatching, so it cannot disarm itself.
  window.setTimeout(() => window.addEventListener("pointerdown", disarm, true), 0);
  const timer = window.setTimeout(disarm, 1500);
}

/**
 * Light dismiss: a pointer press outside the anchor and the popover closes it, and the click that completes the
 * press is swallowed (it never activates what lies underneath, such as a sheet's scrim).
 */
export function useDismissOnOutsidePointer(
  open: boolean,
  inside: ReadonlyArray<RefObject<HTMLElement | null>>,
  onDismiss: () => void,
): void {
  const ref = useRef({ inside, onDismiss });
  ref.current = { inside, onDismiss };
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && ref.current.inside.some((r) => r.current?.contains(target))) return;
      swallowNextClick();
      ref.current.onDismiss();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);
}

/**
 * Scroll `item` into view inside `container` only (never scrolls the page or a sheet). Uses layout offsets, not
 * client rects, so the popover's scale-in animation cannot skew the result.
 */
export function scrollIntoContainer(container: HTMLElement | null, item: HTMLElement | null, center = false) {
  if (!container || !item) return;
  let top = 0;
  let node: HTMLElement | null = item;
  while (node && node !== container && node.offsetParent !== null) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
    if (node === container.offsetParent) {
      top -= container.offsetTop;
      break;
    }
  }
  const height = item.offsetHeight;
  if (center) {
    container.scrollTop = top - (container.clientHeight - height) / 2;
    return;
  }
  // Sticky group headings cover the top of the scroller.
  const header = container.querySelector('[role="group"]') ? 36 : 4;
  if (top - header < container.scrollTop) container.scrollTop = top - header;
  else if (top + height > container.scrollTop + container.clientHeight)
    container.scrollTop = top + height - container.clientHeight + 4;
}

/** Type-ahead for listboxes and menus (logic in `typeaheadMatch`). Returns `(key, from) => index | -1`. */
export function useTypeahead<T>(
  items: ReadonlyArray<T>,
  text: (item: T) => string,
  enabled: (item: T) => boolean,
) {
  const buffer = useRef<TypeaheadBuffer>({ value: "", at: 0 });
  return (key: string, from: number): number =>
    typeaheadMatch(items, text, enabled, buffer.current, key, from, Date.now());
}

export const isPrintableKey = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) =>
  e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;
