import type { ReactNode } from "react";
import type { Language, Settings } from "../../../shared/settings";
import type { FieldErrors } from "../../lib/forms";

export interface SectionProps {
  draft: Settings;
  update: (mutate: (d: Settings) => void) => void;
  errors: FieldErrors;
}

export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch", es: "Español" };

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
    <section className="rounded-card border border-line bg-raised p-4 shadow-card sm:p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? (
        <p className="mt-0.5 mb-4 text-sm text-muted">{description}</p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
