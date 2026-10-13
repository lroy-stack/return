import type { Child } from "hono/jsx";
import type { IconName } from "../../app/ui/icons.generated";
import type { Language } from "../../shared/settings";
import { type Dict, dict } from "./i18n";

/** Icon from the shared sprite (public/p/icons.svg). Attributes only: the strict CSP forbids inline styles. */
export function SpriteIcon({ name, size = 20 }: { name: IconName; size?: 16 | 20 | 24 }) {
  const strokeWidth = size <= 16 ? 2 : size <= 20 ? 1.85 : 1.75;
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`/p/icons.svg#${name}`} />
    </svg>
  );
}

export type FormValues = Record<string, string>;
export type FormErrors = Record<string, string>;

export interface FormState {
  values: FormValues;
  errors: FormErrors;
}

export const EMPTY_FORM: FormState = { values: {}, errors: {} };

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  optionalLabel?: string;
  error?: string;
  /** Keep the label for screen readers only (a visible heading already says the same). */
  labelHidden?: boolean;
  children: Child;
}

/**
 * ARIA attributes for a form control inside a `Field`: marks it invalid and ties it to its hint and
 * error message (`<id>-hint`, `<id>-error`), so assistive technology announces why it failed.
 */
export function fieldAria(id: string, opts: { hint?: boolean; error?: string }) {
  const described = [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean);
  return {
    "aria-invalid": opts.error ? ("true" as const) : undefined,
    "aria-describedby": described.length > 0 ? described.join(" ") : undefined,
  };
}

export function Field({ id, label, hint, optionalLabel, error, labelHidden, children }: FieldProps) {
  return (
    <div class={error ? "field has-error" : "field"}>
      <label for={id} class={labelHidden ? "visually-hidden" : undefined}>
        {label}
        {optionalLabel ? <span class="optional"> ({optionalLabel})</span> : null}
      </label>
      {hint ? (
        <p class="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p class="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormErrorSummary({ state, t }: { state: FormState; t: Dict }) {
  const count = Object.keys(state.errors).length;
  if (count === 0) return null;
  const general = state.errors.form;
  return (
    // public.js moves focus here after a failed submit (tabindex -1: focusable by script only).
    <div class="notice notice-error" role="alert" tabindex={-1} data-error-summary>
      {general ?? t.errors.fixFields}
    </div>
  );
}

/**
 * Optional "where did you find it" block. Works without JavaScript (describe the place);
 * location.js adds a GPS button that applies the fix to the form at once (the tap is the consent)
 * and shows it as a compact card with Remove / Update.
 */
export function LocationFields({
  lang,
  state,
  idPrefix,
}: {
  lang: Language;
  state: FormState;
  idPrefix: string;
}) {
  const t = dict(lang);
  const v = state.values;
  const id = (name: string) => `${idPrefix}-${name}`;
  const messages = {
    locating: t.form.locationLocating,
    refining: t.form.locationRefining,
    attached: t.form.locationAttached,
    removed: t.form.locationRemoved,
    skipped: t.form.locationSkipped,
    waiting: t.form.locationWaiting,
    denied: t.form.locationDenied,
    unavailable: t.form.locationUnavailable,
    timeout: t.form.locationTimeout,
    guideIos: t.form.locationGuideIos,
    guideAndroid: t.form.locationGuideAndroid,
    guideOther: t.form.locationGuideOther,
    webviewIos: t.form.locationWebviewIos,
    webviewAndroid: t.form.locationWebviewAndroid,
    webviewOther: t.form.locationWebviewOther,
  };
  return (
    <fieldset class="location" data-location data-messages={JSON.stringify(messages)}>
      <legend>{t.form.locationHeading}</legend>
      <p class="hint">{t.form.locationIntro}</p>
      <Field
        id={id("label")}
        label={t.form.locationLabel}
        optionalLabel={t.form.optional}
        error={state.errors.location}
      >
        <input
          id={id("label")}
          name="location_label"
          type="text"
          maxlength={300}
          autocomplete="off"
          value={v.location_label ?? ""}
          {...fieldAria(id("label"), { error: state.errors.location })}
        />
      </Field>
      <div data-gps-ui hidden>
        <p class="notice notice-warn" data-gps-webview hidden />
        <button type="button" class="btn btn-secondary" data-gps-start>
          <SpriteIcon name="location" />
          {t.form.locationUse}
        </button>
        <p class="hint gps-consent">{t.form.locationConsent}</p>
        <p class="status" data-gps-status role="status" />
        <button type="button" class="btn btn-secondary btn-sm" data-gps-skip hidden>
          {t.form.locationSkip}
        </button>
        <div class="notice notice-error" data-gps-error role="alert" hidden>
          <p data-gps-error-text />
          <p data-gps-guide />
          <div class="actions">
            <button type="button" class="btn btn-secondary btn-sm" data-gps-retry>
              {t.form.locationRetry}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-gps-describe>
              {t.form.locationDescribe}
            </button>
          </div>
        </div>
        <div class="fix-card" data-gps-card hidden>
          <p class="fix-text">
            <strong>{t.form.locationPreview}</strong>
            <span aria-hidden="true"> · </span>
            <span data-gps-accuracy />
            <span class="fix-coords" data-gps-coords />
          </p>
          <div class="actions">
            <button type="button" class="btn btn-secondary btn-sm" data-gps-remove>
              {t.form.locationRemove}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" data-gps-update>
              {t.form.locationUpdate}
            </button>
          </div>
        </div>
      </div>
      <input type="hidden" name="location_source" value={v.location_source === "gps" ? "gps" : "manual"} />
      <input type="hidden" name="location_lat" value={v.location_lat ?? ""} />
      <input type="hidden" name="location_lng" value={v.location_lng ?? ""} />
      <input type="hidden" name="location_accuracy" value={v.location_accuracy ?? ""} />
    </fieldset>
  );
}
