import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

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

interface Viewport {
  top: number;
  bottom: number;
  width: number;
}

function viewport(): Viewport {
  const vv = window.visualViewport;
  const top = vv?.offsetTop ?? 0;
  return {
    top,
    bottom: top + (vv?.height ?? window.innerHeight),
    width: document.documentElement.clientWidth || window.innerWidth,
  };
}

export interface AnchorOptions {
  /** Popover at least as wide as the anchor (listboxes). */
  matchWidth?: boolean;
  /** Horizontal alignment with the anchor. */
  align?: "start" | "end";
  /** Upper bound for the height in px (content scrolls inside). */
  maxHeight?: number;
  /** Called when the anchor scrolls out of view (the caller closes). */
  onAnchorHidden?: () => void;
}

/** Place `popover` next to `anchor`: below if there is room, else above; clamped to the visual viewport. */
function place(anchor: HTMLElement, el: HTMLElement, opts: AnchorOptions): boolean {
  const a = anchor.getBoundingClientRect();
  const vp = viewport();
  if (a.bottom < vp.top || a.top > vp.bottom) return false;

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
  const placeBelow = below >= Math.min(natural, MIN_BELOW) || below >= above;
  const maxH = Math.max(96, Math.min(cap, placeBelow ? below : above));
  const height = Math.min(natural, maxH);
  el.style.maxHeight = `${maxH}px`;

  const width = el.offsetWidth;
  let left = opts.align === "end" ? a.right - width : a.left;
  left = Math.max(EDGE, Math.min(left, vp.width - EDGE - width));
  const top = placeBelow ? a.bottom + GAP : a.top - GAP - height;

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.dataset.side = placeBelow ? "bottom" : "top";

  // Fallback path only (not in the top layer): a transformed / filtered ancestor can become the containing block
  // of a fixed element. Correct by the measured offset so the surface still lands next to the anchor. (In the top
  // layer the viewport is always the containing block; measuring there would also catch the scale-in animation.)
  if (isShown(el)) return true;
  const r = el.getBoundingClientRect();
  const dx = r.left - left;
  const dy = r.top - top;
  if (Math.abs(dx) > 0.5) el.style.left = `${Math.round(left - dx)}px`;
  if (Math.abs(dy) > 0.5) el.style.top = `${Math.round(top - dy)}px`;
  return true;
}

/**
 * Shows the popover element (rendered only while `open`) in the top layer and keeps it attached to the anchor
 * on scroll, resize and on-screen keyboard changes.
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
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [open, popover]);

  return { reposition };
}

/** Close when a pointer goes down outside the anchor and the popover (light dismiss). */
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

/** Case- and accent-insensitive text for matching ("Zürich" ~ "zurich"). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Type-ahead for listboxes and menus: printable keys within 600 ms form a prefix; a single repeated letter
 * cycles through the matches. Returns the next index or -1.
 */
export function useTypeahead<T>(
  items: ReadonlyArray<T>,
  text: (item: T) => string,
  enabled: (item: T) => boolean,
) {
  const buffer = useRef({ value: "", at: 0 });
  return (key: string, from: number): number => {
    const now = Date.now();
    const b = buffer.current;
    b.value = now - b.at > 600 ? key : b.value + key;
    b.at = now;
    const needle = fold(b.value);
    const cycling = needle.length > 1 && [...needle].every((ch) => ch === needle[0]);
    const prefix = cycling ? (needle[0] ?? "") : needle;
    const start = prefix.length === 1 ? from + 1 : from;
    for (let k = 0; k < items.length; k++) {
      const i = (start + k + items.length) % items.length;
      const item = items[i];
      if (item !== undefined && enabled(item) && fold(text(item)).startsWith(prefix)) return i;
    }
    return -1;
  };
}

export const isPrintableKey = (e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }) =>
  e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;
