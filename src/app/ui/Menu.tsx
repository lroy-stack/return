import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from "react";
import {
  type ButtonSize,
  type ButtonVariant,
  buttonClass,
  type IconButtonSize,
  iconButtonClass,
} from "./Button";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import {
  isPrintableKey,
  POPOVER_SURFACE,
  useAnchoredPopover,
  useDismissOnOutsidePointer,
  useTypeahead,
} from "./popover";

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  /** Second line, short. */
  description?: string;
  /** `danger` for destructive actions (they still confirm). */
  tone?: "default" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}

export interface MenuSeparator {
  key: string;
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

const isItem = (e: MenuEntry): e is MenuItem => !("separator" in e);

/**
 * Actions menu (WAI-ARIA APG menu button) in the glass popover: "More" (…) buttons, row actions. Enter, Space or
 * ArrowDown open on the first item, ArrowUp on the last; arrows wrap; Home/End; type-ahead; Escape closes and
 * returns focus to the button; Tab closes and moves on. Choosing an item closes first and then runs `onSelect`
 * with focus back on the button, so a sheet opened by the action restores focus correctly.
 * Values are not actions: use `Select` to choose a value.
 */
export function Menu({
  label,
  items,
  icon = "more",
  iconOnly = true,
  variant = "secondary",
  size = "md",
  align = "end",
  className,
}: {
  /** Accessible name of the button (and its tooltip when icon-only). */
  label: string;
  items: ReadonlyArray<MenuEntry>;
  icon?: IconName;
  /** Icon-only capsule (default) or icon + label + chevron. */
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize & IconButtonSize;
  /** Edge of the button the menu aligns with. */
  align?: "start" | "end";
  /** Layout only (margins, self-alignment). */
  className?: string;
}) {
  const id = useId();
  const menuId = `${id}-menu`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const actions = items.filter(isItem);
  const enabled = (i: number) => Boolean(actions[i] && !actions[i]?.disabled);
  const typeahead = useTypeahead(
    actions,
    (a) => a.label,
    (a) => !a.disabled,
  );

  const close = (focusButton: boolean) => {
    setOpen(false);
    if (focusButton) button.current?.focus();
  };

  /**
   * Close without an explicit choice. Focus inside the menu would be lost with it, so it returns to the button.
   * An outside press on another focusable control still moves focus there; a press on plain text makes the
   * browser blur to <body> after this handler, so focus is restored once more when that happened.
   */
  const dismiss = () => {
    const hadFocus = pop.current?.contains(document.activeElement) ?? false;
    setOpen(false);
    if (!hadFocus) return;
    button.current?.focus({ preventScroll: true });
    window.setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body)
        button.current?.focus({ preventScroll: true });
    }, 0);
  };

  useAnchoredPopover(open, button, pop, { align, onAnchorHidden: dismiss });
  useDismissOnOutsidePointer(open, [button, pop], dismiss);

  useLayoutEffect(() => {
    if (open) refs.current[active]?.focus({ preventScroll: true });
  }, [open, active]);

  const firstFrom = (from: number, dir: 1 | -1) => {
    for (let n = 0; n < actions.length; n++) {
      const i = (from + dir * n + actions.length * 2) % actions.length;
      if (enabled(i)) return i;
    }
    return -1;
  };
  const show = (at: "first" | "last") => {
    const i = at === "first" ? firstFrom(0, 1) : firstFrom(actions.length - 1, -1);
    if (i < 0) return;
    setActive(i);
    setOpen(true);
  };
  const run = (item: MenuItem) => {
    if (item.disabled) return;
    close(true);
    item.onSelect();
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show(e.key === "ArrowDown" ? "first" : "last");
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(firstFrom(active + 1, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        setActive(firstFrom(active - 1, -1));
        return;
      case "Home":
        e.preventDefault();
        setActive(firstFrom(0, 1));
        return;
      case "End":
        e.preventDefault();
        setActive(firstFrom(actions.length - 1, -1));
        return;
      case "Escape":
        // Handled here so an enclosing sheet does not receive the close request.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      case "Tab":
        // Focus the button first; the browser's Tab then continues from there.
        close(true);
        return;
      default:
        if (isPrintableKey(e)) {
          e.preventDefault();
          const i = typeahead(e.key, active);
          if (i >= 0) setActive(i);
        }
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        id={`${id}-button`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => (open ? close(true) : show("first"))}
        onKeyDown={onButtonKeyDown}
        className={
          iconOnly
            ? iconButtonClass(variant, size, className)
            : buttonClass(variant, size, cx("gap-1.5", className))
        }
      >
        <Icon name={icon} className="size-5" />
        {iconOnly ? null : (
          <>
            {label}
            <Icon name="chevron_down" className="size-4 opacity-70" />
          </>
        )}
      </button>
      {open ? (
        <div
          ref={pop}
          popover="manual"
          id={menuId}
          role="menu"
          aria-labelledby={`${id}-button`}
          onKeyDown={onMenuKeyDown}
          className={cx(POPOVER_SURFACE, "min-w-52 overflow-y-auto")}
        >
          <MenuEntries
            items={items}
            active={active}
            onActive={setActive}
            onRun={run}
            itemRef={(index, el) => {
              refs.current[index] = el;
            }}
          />
        </div>
      ) : null}
    </>
  );
}

/** Rows of a menu (shared by `Menu` and the gallery's `MenuPreview`). */
function MenuEntries({
  items,
  active,
  onActive,
  onRun,
  itemRef,
}: {
  items: ReadonlyArray<MenuEntry>;
  active: number;
  onActive: (index: number) => void;
  onRun: (item: MenuItem) => void;
  itemRef?: (index: number, el: HTMLButtonElement | null) => void;
}) {
  let actionIndex = -1;
  return (
    <>
      {items.map((entry) => {
        if (!isItem(entry)) {
          return <hr key={entry.key} className="mx-3 my-1 h-px shrink-0 border-0 bg-line" />;
        }
        actionIndex += 1;
        const index = actionIndex;
        return (
          <button
            key={entry.key}
            ref={itemRef ? (el) => itemRef(index, el) : undefined}
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={entry.disabled || undefined}
            onClick={() => onRun(entry)}
            onPointerMove={() => {
              if (!entry.disabled && index !== active) onActive(index);
            }}
            className={cx(
              "flex min-h-11 w-full shrink-0 items-center gap-3 rounded-control px-3 py-2 text-left outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              index === active && "bg-fill-hover",
              entry.tone === "danger" ? "text-danger" : "text-fg",
              entry.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {entry.icon ? <Icon name={entry.icon} className="size-5 shrink-0" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium">{entry.label}</span>
              {entry.description ? (
                <span className="block text-footnote text-on-glass-muted">{entry.description}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** Gallery / QA only: the open menu surface drawn in place (inert, hidden from assistive technology). */
export function MenuPreview({ items, active = 0 }: { items: ReadonlyArray<MenuEntry>; active?: number }) {
  return (
    <div
      aria-hidden="true"
      inert
      className="glass-strong flex w-full max-w-72 flex-col overflow-hidden rounded-card p-1.5 text-fg"
    >
      <MenuEntries items={items} active={active} onActive={() => undefined} onRun={() => undefined} />
    </div>
  );
}
