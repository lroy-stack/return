import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "li";
  "aria-labelledby"?: string;
}) {
  return (
    <Tag
      className={`rounded-card border border-line bg-raised p-4 shadow-card sm:p-5 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({
  id,
  title,
  description,
  actions,
  icon,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
