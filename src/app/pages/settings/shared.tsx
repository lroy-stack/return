import type { ReactNode } from "react";
import type { Language, Settings } from "../../../shared/settings";
import type { FieldErrors } from "../../lib/forms";
import { Card, Section } from "../../ui/Card";

export interface SectionProps {
  draft: Settings;
  update: (mutate: (d: Settings) => void) => void;
  errors: FieldErrors;
}

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch", es: "Español" };

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
  return (
    <Section title={title} description={description}>
      <Card>
        <div className="flex flex-col gap-4">{children}</div>
      </Card>
    </Section>
  );
}

/** A labelled cluster of related controls inside a card (inset, no extra border). */
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
      <legend className="px-1 text-subhead font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}
