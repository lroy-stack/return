import {
  type ChangeEvent,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMediaQuery } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { cx } from "./cx";
import { CONTROL, describedBy, type FieldProps, FieldShell, useFieldIds } from "./Field";
import { Icon } from "./Icon";
import {
  isPrintableKey,
  POPOVER_SURFACE,
  scrollIntoContainer,
  useAnchoredPopover,
  useDismissOnOutsidePointer,
  useTypeahead,
} from "./popover";
import { filterOptions, firstEnabled, fold, step } from "./select-logic";

export { filterOptions };

/**
 * Selection family (docs/design/system.md § Selection).
 * - `Select`: one choice from a short or medium list. Fine pointers get a glass listbox popover (WAI-ARIA APG
 *   select-only combobox: type-ahead, Home/End, PageUp/PageDown, Escape, focus never leaves the trigger);
 *   coarse pointers get the native <select> (iOS wheel / Android sheet) in the same pill shape.
 * - `Combobox`: searchable single choice for long lists (time zones, items, tags). APG editable combobox with
 *   list autocomplete; free text is never accepted (blur restores the current value unless the text matches).
 * - `Menu` (ui/Menu.tsx): actions, not values.
 * Replaces the deprecated native `Select` in ui/Field.tsx.
 */

export interface SelectOption<V extends string> {
  value: V;
  label: string;
  /** Second line in the list (never in the closed control). Searched by Combobox. */
  description?: string;
  /** Consecutive options with the same group render under one heading (native: <optgroup>). */
  group?: string;
  /** Small visual before the label (swatch, thumb). Decorative. */
  leading?: ReactNode;
  /** Extra search terms for Combobox (aliases, offsets). Not shown. */
  keywords?: string;
  disabled?: boolean;
}

export type SelectVariant = "field" | "chip";

const TRIGGER: Record<SelectVariant, string> = {
  field: cx(CONTROL, "relative rounded-full pr-10 pl-4 text-left"),
  chip: "relative block w-full min-h-9 rounded-full bg-fill pr-9 pl-3.5 text-left text-subhead font-semibold text-fg transition-colors duration-150 hover:bg-fill-hover disabled:opacity-55 pointer-coarse:min-h-11 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger",
};

const CHEVRON = "pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted";

const optionId = (listId: string, index: number) => `${listId}-o${index}`;

interface RowProps {
  option: Pick<SelectOption<string>, "value" | "label" | "description" | "leading" | "disabled">;
  index: number;
  id: string;
  active: boolean;
  selected: boolean;
  onActive: (index: number) => void;
  onPick: (index: number) => void;
}

/**
 * One option. Memoised: moving the active row re-renders two rows, not the whole list (≈420 time zones).
 * Options use aria-activedescendant (APG): DOM focus and every key stay on the owning combobox, which implements
 * the keyboard equivalent of this click. tabIndex -1 only makes the option focusable by script.
 */
const OptionRow = memo(function OptionRow({
  option,
  index,
  id,
  active,
  selected,
  onActive,
  onPick,
}: RowProps) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by the combobox (aria-activedescendant)
    <div
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      aria-disabled={option.disabled || undefined}
      data-active={active ? "" : undefined}
      onPointerMove={() => {
        if (!option.disabled && !active) onActive(index);
      }}
      onClick={() => {
        if (!option.disabled) onPick(index);
      }}
      className={cx(
        "flex min-h-10 cursor-default items-center gap-3 rounded-control px-3 py-1.5 select-none pointer-coarse:min-h-11",
        active && "bg-primary-tint text-on-glass-primary ring-1 ring-primary/35 ring-inset",
        option.disabled && "opacity-50",
      )}
    >
      {option.leading ? (
        <span aria-hidden="true" className="flex shrink-0 items-center">
          {option.leading}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-body", selected ? "font-semibold" : "font-medium")}>
          {option.label}
        </span>
        {option.description ? (
          <span className="block truncate text-footnote text-on-glass-muted">{option.description}</span>
        ) : null}
      </span>
      <Icon
        name="check"
        strokeWidth={2.25}
        className={cx("size-4.5 shrink-0", selected ? "text-on-glass-primary" : "invisible")}
      />
    </div>
  );
});

/** A callback whose identity never changes but always calls the latest `fn` (keeps memoised rows stable). */
function useStableCallback<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

/** Shared listbox: grouped options, active row (visual focus via aria-activedescendant), selected check. */
function Listbox<V extends string>({
  id,
  labelId,
  options,
  active,
  value,
  onActive,
  onPick,
  listRef,
}: {
  id: string;
  labelId: string;
  options: ReadonlyArray<SelectOption<V>>;
  active: number;
  value: V | null;
  onActive: (index: number) => void;
  onPick: (index: number) => void;
  listRef: RefObject<HTMLDivElement | null>;
}) {
  const activate = useStableCallback(onActive);
  const pickRow = useStableCallback(onPick);
  const groups: { name: string | undefined; items: { option: SelectOption<V>; index: number }[] }[] = [];
  options.forEach((option, index) => {
    const last = groups[groups.length - 1];
    if (last && last.name === option.group) last.items.push({ option, index });
    else groups.push({ name: option.group, items: [{ option, index }] });
  });

  const row = ({ option, index }: { option: SelectOption<V>; index: number }) => (
    <OptionRow
      key={`${option.value}-${index}`}
      option={option}
      index={index}
      id={optionId(id, index)}
      active={index === active}
      selected={option.value === value}
      onActive={activate}
      onPick={pickRow}
    />
  );

  return (
    <div
      ref={listRef}
      id={id}
      role="listbox"
      aria-labelledby={labelId}
      className="min-h-0 flex-1 scroll-py-1 overflow-y-auto overscroll-contain"
    >
      {groups.map((g, gi) =>
        g.name ? (
          // A listbox may only own options and groups of options; <fieldset> is not allowed inside it.
          // biome-ignore lint/a11y/useSemanticElements: ARIA group inside role=listbox (APG grouped listbox)
          <div key={`g-${g.name}-${g.items[0]?.option.value}`} role="group" aria-labelledby={`${id}-g${gi}`}>
            <div
              id={`${id}-g${gi}`}
              className="sticky top-0 z-[1] bg-[var(--glass-solid)] px-3 pt-2.5 pb-1 text-caption font-semibold tracking-wide text-on-glass-muted uppercase"
            >
              {g.name}
            </div>
            {g.items.map(row)}
          </div>
        ) : (
          <Fragment key={`u-${g.items[0]?.option.value}`}>{g.items.map(row)}</Fragment>
        ),
      )}
    </div>
  );
}

/** Keep focus on the trigger / input while the pointer is used anywhere inside the popover (rows, padding,
 * "No matches"), so it never blurs and closes under the pointer. */
const keepFocus = (e: { preventDefault: () => void }) => e.preventDefault();

/** Keeps the active option visible; centres the selected one when the list opens. */
function useActiveIntoView(
  open: boolean,
  active: number,
  listId: string,
  list: RefObject<HTMLDivElement | null>,
) {
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (!open) {
      wasOpen.current = false;
      return;
    }
    const container = list.current;
    const item = active >= 0 ? document.getElementById(optionId(listId, active)) : null;
    scrollIntoContainer(container, item, !wasOpen.current);
    wasOpen.current = true;
  }, [open, active, listId, list]);
}

function NativeOptions<V extends string>({ options }: { options: ReadonlyArray<SelectOption<V>> }) {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < options.length) {
    const group = options[i]?.group;
    const items: SelectOption<V>[] = [];
    while (i < options.length && options[i]?.group === group) {
      const o = options[i];
      if (o) items.push(o);
      i++;
    }
    const rendered = items.map((o) => (
      <option key={o.value} value={o.value} disabled={o.disabled}>
        {o.label}
      </option>
    ));
    out.push(
      group ? (
        <optgroup key={`g-${group}-${i}`} label={group}>
          {rendered}
        </optgroup>
      ) : (
        rendered
      ),
    );
  }
  return <>{out}</>;
}

export interface SelectProps<V extends string> extends FieldProps {
  options: ReadonlyArray<SelectOption<V>>;
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  id?: string;
  /** Adds a hidden input (custom) or names the native control, for plain form posts. */
  name?: string;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  /** `field` (form row, default) or `chip` (filter toolbars: neutral fill capsule, label hidden by default). */
  variant?: SelectVariant;
  /** Force the native control (true) or the glass listbox (false). Default: native on coarse pointers. */
  native?: boolean;
}

export function Select<V extends string>({
  label,
  labelHidden,
  hint,
  error,
  required,
  className,
  options,
  value,
  onChange,
  disabled,
  id,
  name,
  placeholder,
  variant = "field",
  native,
}: SelectProps<V>) {
  const coarse = useMediaQuery("(pointer: coarse)");
  const ids = useFieldIds(id);
  const shell = {
    label,
    labelHidden: labelHidden ?? variant === "chip",
    hint,
    error,
    required,
    className,
  };
  const selectedIndex = options.findIndex((o) => o.value === value);

  if (native ?? coarse) {
    return (
      <FieldShell ids={ids} {...shell}>
        <div className="relative">
          <select
            id={ids.id}
            name={name}
            value={selectedIndex >= 0 ? value : ""}
            onChange={(e) => onChange(e.target.value as V)}
            disabled={disabled}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(ids, hint, error, false)}
            className={cx(TRIGGER[variant], "peer appearance-none truncate")}
          >
            {selectedIndex < 0 ? (
              <option value="" disabled>
                {placeholder ?? ""}
              </option>
            ) : null}
            <NativeOptions options={options} />
          </select>
          <Icon name="chevron_down" className={cx(CHEVRON, "peer-disabled:opacity-55")} />
        </div>
      </FieldShell>
    );
  }

  return (
    <FieldShell ids={ids} {...shell}>
      <ListboxSelect
        ids={ids}
        options={options}
        value={value}
        selectedIndex={selectedIndex}
        onChange={onChange}
        disabled={disabled}
        required={required}
        invalid={Boolean(error)}
        describedBy={describedBy(ids, hint, error, false)}
        name={name}
        placeholder={placeholder}
        variant={variant}
      />
    </FieldShell>
  );
}

function ListboxSelect<V extends string>({
  ids,
  options,
  value,
  selectedIndex,
  onChange,
  disabled,
  required,
  invalid,
  describedBy: described,
  name,
  placeholder,
  variant,
}: {
  ids: ReturnType<typeof useFieldIds>;
  options: ReadonlyArray<SelectOption<V>>;
  value: V;
  selectedIndex: number;
  onChange: (value: V) => void;
  disabled?: boolean;
  required?: boolean;
  invalid: boolean;
  describedBy?: string;
  name?: string;
  placeholder?: string;
  variant: SelectVariant;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = `${ids.id}-listbox`;
  const selected = options[selectedIndex];
  const typeahead = useTypeahead(
    options,
    (o) => o.label,
    (o) => !o.disabled,
  );
  const close = () => setOpen(false);

  useAnchoredPopover(open, trigger, pop, { matchWidth: true, onAnchorHidden: close });
  useDismissOnOutsidePointer(open, [trigger, pop], close);
  useActiveIntoView(open, active, listId, list);

  const show = (at: number) => {
    setActive(at);
    setOpen(true);
    trigger.current?.focus();
  };
  const pick = (index: number) => {
    const o = options[index];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    close();
  };
  const current = selectedIndex >= 0 ? selectedIndex : firstEnabled(options);
  // True from an Enter/Space keydown we handled until its keyup has finished: the click the browser may still
  // derive from that key must not toggle the list again. Any other click (pointer, VoiceOver VO+Space, Voice
  // Control, NVDA browse mode, element.click()) toggles it.
  const handledByKey = useRef(false);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") handledByKey.current = true;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show(current);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        show(e.key === "Home" ? firstEnabled(options) : firstEnabled(options, options.length - 1, -1));
      } else if (isPrintableKey(e)) {
        const i = typeahead(e.key, selectedIndex);
        if (i >= 0) {
          e.preventDefault();
          show(i);
        }
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!e.altKey) setActive(step(options, active, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) pick(active);
        else setActive(step(options, active, -1));
        return;
      case "PageDown":
      case "PageUp":
        e.preventDefault();
        setActive(step(options, active, e.key === "PageDown" ? 10 : -10));
        return;
      case "Home":
        e.preventDefault();
        setActive(firstEnabled(options));
        return;
      case "End":
        e.preventDefault();
        setActive(firstEnabled(options, options.length - 1, -1));
        return;
      case "Enter":
      case " ":
        e.preventDefault();
        pick(active);
        return;
      case "Escape":
        // Handled here so an enclosing sheet does not receive the close request.
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      case "Tab":
        if (active >= 0) pick(active);
        else close();
        return;
      default:
        if (isPrintableKey(e)) {
          e.preventDefault();
          const i = typeahead(e.key, active);
          if (i >= 0) setActive(i);
        }
    }
  };

  const onKeyUp = () => {
    // Let the keyup's default action (Space → click) run first, then accept clicks again.
    if (handledByKey.current) window.setTimeout(() => (handledByKey.current = false), 0);
  };

  const onClick = () => {
    if (handledByKey.current) return;
    if (open) close();
    else show(current);
  };

  const onBlur = (e: FocusEvent<HTMLButtonElement>) => {
    handledByKey.current = false;
    if (!pop.current?.contains(e.relatedTarget as Node | null)) close();
  };

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        id={ids.id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
        aria-describedby={described}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        title={selected?.label}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onClick={onClick}
        onBlur={onBlur}
        className={TRIGGER[variant]}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {selected?.leading ? (
            <span aria-hidden="true" className="flex shrink-0 items-center">
              {selected.leading}
            </span>
          ) : null}
          <span className={cx("truncate", !selected && "text-muted")}>
            {selected?.label ?? placeholder ?? ""}
          </span>
        </span>
        <Icon
          name="chevron_down"
          className={cx(
            CHEVRON,
            "transition-transform duration-200",
            open && "rotate-180",
            disabled && "opacity-55",
          )}
        />
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open ? (
        <div ref={pop} popover="manual" onPointerDown={keepFocus} className={POPOVER_SURFACE}>
          <Listbox
            id={listId}
            labelId={ids.labelId}
            options={options}
            active={active}
            value={value}
            onActive={setActive}
            onPick={pick}
            listRef={list}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Gallery / QA only: the open listbox surface drawn in place (inert, hidden from assistive technology). */
export function ListboxPreview<V extends string>({
  options,
  value,
  active = -1,
}: {
  options: ReadonlyArray<SelectOption<V>>;
  value: V | null;
  active?: number;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  return (
    <div
      aria-hidden="true"
      inert
      className="glass-strong flex max-h-80 w-full flex-col overflow-hidden rounded-card p-1.5 text-fg"
    >
      <Listbox
        id={id}
        labelId={id}
        options={options}
        active={active}
        value={value}
        onActive={() => undefined}
        onPick={() => undefined}
        listRef={list}
      />
    </div>
  );
}

export interface ComboboxProps<V extends string> extends FieldProps {
  options: ReadonlyArray<SelectOption<V>>;
  /** `null` = nothing chosen yet (the placeholder shows). */
  value: V | null;
  onChange: (value: V) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** Placeholder of the search text (shown when the field is empty). */
  placeholder?: string;
}

/**
 * Searchable single choice for long lists. Typing filters (label, description, keywords; accent-insensitive)
 * and makes the first match active, so Enter picks it. Escape closes and restores the current value. Free text
 * is never kept: on blur an exact label match is accepted, anything else reverts.
 */
export function Combobox<V extends string>({
  label,
  labelHidden,
  hint,
  error,
  required,
  className,
  options,
  value,
  onChange,
  disabled,
  id,
  name,
  placeholder,
}: ComboboxProps<V>) {
  const t = useT();
  const ids = useFieldIds(id);
  const [open, setOpen] = useState(false);
  // null = not editing: the field shows the selected label and the list shows every option.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const listId = `${ids.id}-listbox`;
  const selected = options.find((o) => o.value === value);
  const editing = useRef(false);
  editing.current = query !== null;
  // Latest typed text, readable from handlers that run before the next render (dismiss, then blur).
  const queryRef = useRef<string | null>(null);
  queryRef.current = query;
  // Select the whole label (so typing replaces it) once the field shows it again; skipped if typing resumed.
  const selectLabelSoon = () =>
    window.requestAnimationFrame(() => {
      const el = input.current;
      if (el && document.activeElement === el && !editing.current) el.select();
    });
  const shown = useMemo(
    () => (query === null ? [...options] : filterOptions(options, query)),
    [options, query],
  );

  const close = () => setOpen(false);
  /**
   * End an edit: an exact label match (accent- and case-insensitive) is chosen, anything else reverts to the
   * current value. Runs once per edit, whether the pointer dismissed the list or the field lost focus.
   */
  const commit = () => {
    const typed = queryRef.current;
    queryRef.current = null;
    if (typed !== null) {
      const exact = options.find((o) => !o.disabled && fold(o.label) === fold(typed.trim()));
      if (exact && exact.value !== value) onChange(exact.value);
    }
    setQuery(null);
  };
  useAnchoredPopover(open, anchor, pop, { matchWidth: true, onAnchorHidden: close });
  // Outside press: close and commit/revert like a blur (touch browsers do not always blur the field).
  useDismissOnOutsidePointer(open, [anchor, pop], () => {
    close();
    commit();
  });
  useActiveIntoView(open, active, listId, list);

  const openList = (at: "selected" | "last") => {
    const sel = shown.findIndex((o) => o.value === value);
    setActive(
      at === "last" ? firstEnabled(shown, shown.length - 1, -1) : sel >= 0 ? sel : firstEnabled(shown),
    );
    setOpen(true);
  };
  const pick = (index: number) => {
    const o = shown[index];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    queryRef.current = null;
    setQuery(null);
    close();
    // Typing again replaces the chosen label instead of appending to it.
    selectLabelSoon();
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    queryRef.current = text;
    setQuery(text);
    setActive(firstEnabled(filterOptions(options, text)));
    setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList("selected");
        else if (!e.altKey) setActive(step(shown, active, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openList("last");
        else if (e.altKey) pick(active);
        else setActive(step(shown, active, -1));
        return;
      case "PageDown":
      case "PageUp":
        if (!open) return;
        e.preventDefault();
        setActive(step(shown, active, e.key === "PageDown" ? 10 : -10));
        return;
      case "Enter":
        if (!open) return;
        // Never submit the surrounding form while the list is open.
        e.preventDefault();
        if (active >= 0) pick(active);
        return;
      case "Escape":
        if (!open && query === null) return;
        e.preventDefault();
        e.stopPropagation();
        close();
        queryRef.current = null;
        setQuery(null);
        selectLabelSoon();
        return;
      case "Tab":
        if (open && query !== null && active >= 0) pick(active);
        else close();
        return;
    }
  };

  const onBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (pop.current?.contains(e.relatedTarget as Node | null)) return;
    commit();
    close();
  };

  const status =
    open && query !== null
      ? shown.length > 0
        ? t("select.results", { n: shown.length })
        : t("select.noResults")
      : "";

  return (
    <FieldShell ids={ids} {...{ label, labelHidden, hint, error, required, className }}>
      <div ref={anchor} className="relative">
        <input
          ref={input}
          id={ids.id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && active >= 0 ? optionId(listId, active) : undefined}
          aria-describedby={describedBy(ids, hint, error, false)}
          aria-invalid={error ? true : undefined}
          required={required}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={placeholder}
          title={query === null ? selected?.label : undefined}
          value={query ?? selected?.label ?? ""}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => {
            if (query === null) e.currentTarget.select();
            if (!open) openList("selected");
          }}
          className={cx(CONTROL, "truncate rounded-full pr-10 pl-4")}
        />
        {/* Pointer affordance only; keyboard users open the list with the arrow keys. */}
        <span
          aria-hidden="true"
          onPointerDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            input.current?.focus();
            if (open) close();
            else openList("selected");
          }}
          className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center"
        >
          <Icon
            name="chevron_down"
            className={cx(
              "size-4 text-muted transition-transform duration-200",
              open && "rotate-180",
              disabled && "opacity-55",
            )}
          />
        </span>
        <span role="status" className="sr-only">
          {status}
        </span>
        {name ? <input type="hidden" name={name} value={value ?? ""} /> : null}
        {open ? (
          <div ref={pop} popover="manual" onPointerDown={keepFocus} className={POPOVER_SURFACE}>
            <Listbox
              id={listId}
              labelId={ids.labelId}
              options={shown}
              active={active}
              value={value}
              onActive={setActive}
              onPick={pick}
              listRef={list}
            />
            {shown.length === 0 ? (
              <p className="px-3 py-2.5 text-subhead text-on-glass-muted">{t("select.noResults")}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}
