import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useId,
} from "react";

const CONTROL =
  "block w-full rounded-xl border border-line-strong bg-raised px-3 min-h-11 text-fg placeholder:text-muted/80 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:border-2";

interface FieldShellProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}

function useFieldIds(explicit?: string) {
  const auto = useId();
  const id = explicit ?? auto;
  return { id, hintId: `${id}-hint`, errorId: `${id}-error` };
}

function Shell({
  id,
  hintId,
  errorId,
  label,
  hint,
  error,
  required,
  className = "",
  children,
}: FieldShellProps & { id: string; hintId: string; errorId: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (hint: unknown, error: unknown, hintId: string, errorId: string) =>
  [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

export function TextInput({
  label,
  hint,
  error,
  required,
  className,
  ...rest
}: FieldShellProps & Omit<InputHTMLAttributes<HTMLInputElement>, "className">) {
  const ids = useFieldIds(rest.id);
  return (
    <Shell {...ids} {...{ label, hint, error, required, className }}>
      <input
        {...rest}
        id={ids.id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids.hintId, ids.errorId)}
        className={CONTROL}
      />
    </Shell>
  );
}

export function TextArea({
  label,
  hint,
  error,
  required,
  className,
  rows = 3,
  ...rest
}: FieldShellProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">) {
  const ids = useFieldIds(rest.id);
  return (
    <Shell {...ids} {...{ label, hint, error, required, className }}>
      <textarea
        {...rest}
        rows={rows}
        id={ids.id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids.hintId, ids.errorId)}
        className={`${CONTROL} py-2.5 leading-relaxed`}
      />
    </Shell>
  );
}

export function Select({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...rest
}: FieldShellProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  const ids = useFieldIds(rest.id);
  return (
    <Shell {...ids} {...{ label, hint, error, required, className }}>
      <select
        {...rest}
        id={ids.id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint, error, ids.hintId, ids.errorId)}
        className={CONTROL}
      >
        {children}
      </select>
    </Shell>
  );
}

/** Switch-style checkbox with a visible label and optional description. */
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
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 py-1">
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
        className="relative mt-0.5 inline-block h-7 w-12 shrink-0 rounded-full border border-line-strong bg-sunken transition-colors duration-150 peer-checked:border-primary peer-checked:bg-primary peer-disabled:opacity-55 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:top-0.5 after:left-0.5 after:size-5.5 after:rounded-full after:bg-fg after:transition-transform after:duration-150 peer-checked:after:translate-x-5 peer-checked:after:bg-primary-fg"
      />
      <span className="min-w-0">
        <span className="block text-[0.95rem] font-medium">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  className = "",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2.5 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-primary"
      />
      <span className="text-[0.95rem]">{label}</span>
    </label>
  );
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-tint px-3 py-2 text-sm font-medium text-danger"
    >
      {message}
    </p>
  );
}
