import { createContext, type ReactNode, useContext } from "react";
import type { Language, Settings } from "../../../shared/settings";
import type { FieldErrors } from "../../lib/forms";
import { Card, Section } from "../../ui/Card";

export interface SectionProps {
  draft: Settings;
  update: (mutate: (d: Settings) => void) => void;
  errors: FieldErrors;
}

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch", es: "Español" };

/**
 * The page's h1 when it already names the open section (phone: pushed view titled "Identity"). A SectionCard with
 * the same title then drops its heading, so the name is not repeated directly under the large title.
 */
export const SettingsPageTitle = createContext<string | null>(null);

/** One settings group: a titled `Section` whose fields sit in a single raised card. */
export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const pageTitle = useContext(SettingsPageTitle);
  return (
    <Section title={title === pageTitle ? undefined : title} description={description}>
      <Card>
        <div className="flex flex-col gap-4">{children}</div>
      </Card>
    </Section>
  );
}

/**
 * A labelled cluster of related controls inside a card (inset well, no extra border). The legend floats inside
 * the well (a plain <legend> would sit on the fieldset's top edge, half outside the fill).
 */
export function FieldGroup({
  legend,
  children,
  className,
}: {
  legend: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={`min-w-0 rounded-control bg-sunken p-3 ${className ?? ""}`}>
      <legend className="float-left mb-2 w-full px-1 text-subhead font-semibold">{legend}</legend>
      <div className="clear-both">{children}</div>
    </fieldset>
  );
}
