import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
  useRef,
} from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/**
 * Shared control chrome: raised field, 44 px min, >= 3:1 boundary, error state via aria-invalid. Text entry uses
 * the 14 px control radius; choice controls (Select, Combobox, SearchField) add `rounded-full` (pill language of
 * chips, buttons and search).
 */
export const CONTROL =
  "block w-full min-h-11 rounded-control border border-line-strong bg-raised px-3.5 text-body text-fg placeholder:text-muted transition-colors duration-150 hover:border-fg/60 disabled:opacity-55 disabled:hover:border-line-strong aria-[invalid=true]:border-danger aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger";

export interface FieldProps {
  label: string;
  /** Visually hide the label (it stays the accessible name). Use only when context makes it obvious. */
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}

export interface FieldIds {
  id: string;
  labelId: string;
  hintId: string;
  errorId: string;
  counterId: string;
}

export function useFieldIds(explicit?: string): FieldIds {
  const auto = useId();
  const id = explicit ?? auto;
  return {
    id,
    labelId: `${id}-label`,
    hintId: `${id}-hint`,
    errorId: `${id}-error`,
    counterId: `${id}-count`,
  };
}

export const describedBy = (ids: FieldIds, hint: unknown, error: unknown, counter: boolean) =>
  [hint ? ids.hintId : null, error ? ids.errorId : null, counter ? ids.counterId : null]
    .filter(Boolean)
    .join(" ") || undefined;

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
  const near = length >= max * 0.9;
  return (
    <span
      id={id}
      className={cx(
        "shrink-0 text-footnote tabular-nums",
        near ? "font-semibold text-warning" : "text-muted",
      )}
    >
      {length}/{max}
    </span>
  );
}

/**
 * Label + control + hint + error (+ counter). Errors are linked with aria-describedby and announced by the
 * form-level `FormError` (role=alert); the field itself is not a live region to avoid double announcements.
 */
export function FieldShell({
  ids,
  label,
  labelHidden,
  hint,
  error,
  required,
  className,
  counter,
  children,
}: FieldProps & { ids: FieldIds; counter?: { length: number; max: number }; children: ReactNode }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <div className={cx("flex items-baseline justify-between gap-3", labelHidden && !counter && "sr-only")}>
        <label
          id={ids.labelId}
          htmlFor={ids.id}
          className={cx("text-subhead font-medium", labelHidden && "sr-only")}
        >
          {label}
          {required ? (
            <span className="text-danger" aria-hidden="true">
              {" "}
              *
            </span>
          ) : null}
        </label>
        {counter ? <Counter id={ids.counterId} length={counter.length} max={counter.max} /> : null}
      </div>
      {children}
      {hint ? (
        <p id={ids.hintId} className="text-footnote text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={ids.errorId} className="flex items-start gap-1.5 text-footnote font-medium text-danger">
          <Icon name="alert" className="mt-px size-4" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Wrap a custom control in the standard label/hint/error layout. The child receives the control id. */
export function Field({
  id,
  children,
  ...props
}: FieldProps & { id?: string; children: (control: { id: string; describedBy?: string }) => ReactNode }) {
  const ids = useFieldIds(id);
  return (
    <FieldShell ids={ids} {...props}>
      {children({ id: ids.id, describedBy: describedBy(ids, props.hint, props.error, false) })}
    </FieldShell>
  );
}

export function TextInput({
  label,
  labelHidden,
  hint,
  error,
  required,
  className,
  leadingIcon,
  showCount,
  ...rest
}: FieldProps & {
  leadingIcon?: IconName;
  /** Show "n/max" next to the label; needs maxLength and a controlled value. */
  showCount?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  const ids = useFieldIds(rest.id);
  const counter =
    showCount && rest.maxLength
      ? { length: String(rest.value ?? "").length, max: rest.maxLength }
      : undefined;
  return (
    <FieldShell ids={ids} {...{ label, labelHidden, hint, error, required, className, counter }}>
      <div className="relative">
        {leadingIcon ? (
          <Icon
            name={leadingIcon}
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
          />
        ) : null}
        <input
          {...rest}
          id={ids.id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, hint, error, Boolean(counter))}
          className={cx(CONTROL, leadingIcon && "pl-11")}
        />
      </div>
    </FieldShell>
  );
}

export function TextArea({
  label,
  labelHidden,
  hint,
  error,
  required,
  className,
  rows = 3,
  showCount,
  ...rest
}: FieldProps & { showCount?: boolean } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  const ids = useFieldIds(rest.id);
  const counter =
    showCount && rest.maxLength
      ? { length: String(rest.value ?? "").length, max: rest.maxLength }
      : undefined;
  return (
    <FieldShell ids={ids} {...{ label, labelHidden, hint, error, required, className, counter }}>
      <textarea
        {...rest}
        rows={rows}
        id={ids.id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, hint, error, Boolean(counter))}
        className={cx(CONTROL, "max-h-80 resize-y py-2.5 leading-relaxed")}
      />
    </FieldShell>
  );
}

/**
 * @deprecated Use `Select` (or `Combobox` for long lists) from `ui/Select.tsx`: options-array API, glass listbox
 * on fine pointers, native picker on coarse pointers. Kept, in the same pill shape, only until the remaining call
 * sites migrate (see docs/design/system.md § Selection); delete it then.
 */
export function Select({
  label,
  labelHidden,
  hint,
  error,
  required,
  className,
  children,
  ...rest
}: FieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  const ids = useFieldIds(rest.id);
  return (
    <FieldShell ids={ids} {...{ label, labelHidden, hint, error, required, className }}>
      <div className="relative">
        <select
          {...rest}
          id={ids.id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, hint, error, false)}
          className={cx(CONTROL, "peer appearance-none truncate rounded-full pr-10 pl-4")}
        >
          {children}
        </select>
        <Icon
          name="chevron_down"
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted peer-disabled:opacity-55"
        />
      </div>
    </FieldShell>
  );
}

/** Search input with icon and clear button. The label is visually hidden. */
export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  clearLabel,
  className,
  autoFocus,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible name of the clear button, e.g. t("common.clear"). */
  clearLabel: string;
  className?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  const ids = useFieldIds(id);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={cx("relative", className)}>
      <label htmlFor={ids.id} className="sr-only">
        {label}
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
      />
      <input
        ref={ref}
        id={ids.id}
        type="search"
        value={value}
        // biome-ignore lint/a11y/noAutofocus: opt-in for search-first sheets
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        enterKeyHint="search"
        className={cx(
          CONTROL,
          "min-h-12 rounded-full bg-raised pr-12 pl-11 [&::-webkit-search-cancel-button]:appearance-none",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label={clearLabel}
          className="absolute top-1/2 right-0.5 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-fill hover:text-fg"
        >
          <Icon name="close" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** iOS-style switch with a visible label and optional description. The whole row is the target. */
export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-body font-medium">{label}</span>
        {description ? <span className="block text-footnote text-muted">{description}</span> : null}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative inline-block h-7.5 w-12.5 shrink-0 rounded-full bg-fill-pressed ring-1 ring-line-strong/60 ring-inset transition-colors duration-200 peer-checked:bg-primary peer-checked:ring-primary peer-disabled:opacity-50 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:top-0.5 after:left-0.5 after:size-6.5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgb(0_0_0/0.25),0_3px_8px_rgb(0_0_0/0.12)] after:transition-transform after:duration-300 after:ease-spring peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export function Checkbox({
  label,
  description,
  checked,
  onChange,
  disabled,
  className = "",
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("inline-flex min-h-11 cursor-pointer items-start gap-3 py-2.5", className)}>
      <span className="relative mt-px inline-flex size-5.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer size-5.5 cursor-pointer appearance-none rounded-md border-[1.5px] border-line-strong bg-raised transition-colors checked:border-primary checked:bg-primary disabled:opacity-50"
        />
        <Icon
          name="check"
          strokeWidth={2.5}
          className="pointer-events-none absolute inset-0.5 size-4.5 text-primary-fg opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-body">{label}</span>
        {description ? <span className="block text-footnote text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
  description?: ReactNode;
  icon?: IconName;
  disabled?: boolean;
}

/** Vertical radio list (2–6 options that need a description). Native radios: arrow keys work. */
export function RadioGroup<V extends string>({
  legend,
  legendHidden,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  legendHidden?: boolean;
  options: ReadonlyArray<ChoiceOption<V>>;
  value: V;
  onChange: (value: V) => void;
  error?: string;
}) {
  const name = useId();
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className={cx("mb-1 text-subhead font-medium", legendHidden && "sr-only")}>{legend}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={cx(
            "flex min-h-11 cursor-pointer items-start gap-3 rounded-control px-3 py-2.5 transition-colors",
            value === o.value ? "bg-primary-tint" : "hover:bg-fill",
            o.disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-primary"
          />
          <span className="min-w-0">
            <span className="block text-body font-medium">{o.label}</span>
            {o.description ? <span className="block text-footnote text-muted">{o.description}</span> : null}
          </span>
        </label>
      ))}
      {error ? <p className="text-footnote font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}

/**
 * iOS segmented control for 2–4 short, mutually exclusive options that switch a view or a setting.
 * Native radios underneath (arrow keys, form semantics); the selected thumb is a raised capsule.
 */
export function SegmentedControl<V extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  block,
  className,
}: {
  /** Accessible group name (not shown). */
  label: string;
  options: ReadonlyArray<ChoiceOption<V>>;
  value: V;
  onChange: (value: V) => void;
  size?: "sm" | "md";
  block?: boolean;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset
      className={cx(
        "inline-flex min-w-0 gap-0.5 rounded-full bg-fill p-0.5",
        block && "flex w-full",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <label
            key={o.value}
            className={cx(
              "relative inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-200 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ring",
              size === "sm" ? "min-h-8 text-footnote pointer-coarse:min-h-10" : "min-h-10 text-subhead",
              selected ? "bg-raised text-fg shadow-card" : "text-muted hover:text-fg",
              o.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={selected}
              disabled={o.disabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon ? <Icon name={o.icon} className="size-4" /> : null}
            {o.label}
          </label>
        );
      })}
    </fieldset>
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-control bg-danger-tint px-3.5 py-2.5 text-subhead font-medium text-danger"
    >
      <Icon name="alert" className="mt-0.5 size-4" />
      {message}
    </p>
  );
}
