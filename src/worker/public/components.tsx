import type { Child } from "hono/jsx";
import type { Language } from "../../shared/settings";
import { type Dict, dict } from "./i18n";

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
    <div class="notice notice-error" role="alert">
      {general ?? t.errors.fixFields}
    </div>
  );
}

/**
 * Optional "where did you find it" block. Works without JavaScript (describe the place and tick
 * the consent box); public.js adds a GPS button with an explicit preview-and-confirm step.
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
  return (
    <fieldset
      class="location"
      data-location
      data-msg-denied={t.form.locationDenied}
      data-msg-unavailable={t.form.locationUnavailable}
      data-msg-timeout={t.form.locationTimeout}
      data-msg-locating={t.form.locationLocating}
      data-msg-attached={t.form.locationAttached}
      data-unit={t.form.locationMeters}
    >
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
        />
      </Field>
      <button type="button" class="btn btn-secondary" data-gps-start hidden>
        {t.form.locationUse}
      </button>
      <p class="status" data-gps-status role="status" />
      <div class="panel" data-gps-preview hidden>
        <h3>{t.form.locationPreview}</h3>
        <dl>
          <dt>{t.form.locationCoordinates}</dt>
          <dd data-gps-coords />
          <dt>{t.form.locationAccuracy}</dt>
          <dd>
            <span data-gps-accuracy /> {t.form.locationMeters}
          </dd>
        </dl>
        <p>{t.form.locationWillShare}</p>
        <div class="actions">
          <button type="button" class="btn btn-primary" data-gps-confirm>
            {t.form.locationConfirm}
          </button>
          <button type="button" class="btn btn-secondary" data-gps-cancel>
            {t.form.locationCancel}
          </button>
        </div>
      </div>
      <input type="hidden" name="location_source" value={v.location_source === "gps" ? "gps" : "manual"} />
      <input type="hidden" name="location_lat" value={v.location_lat ?? ""} />
      <input type="hidden" name="location_lng" value={v.location_lng ?? ""} />
      <input type="hidden" name="location_accuracy" value={v.location_accuracy ?? ""} />
      <label class="check">
        <input
          type="checkbox"
          name="location_confirmed"
          value="yes"
          checked={v.location_confirmed === "yes"}
        />
        <span>{t.form.locationAgree}</span>
      </label>
    </fieldset>
  );
}
