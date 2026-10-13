import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type BadgeTone = "neutral" | "lost" | "success" | "info" | "danger";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-sunken text-muted border-line",
  lost: "bg-lost-tint text-lost border-lost/40",
  success: "bg-accent-tint text-accent-text border-accent/50",
  info: "bg-primary-tint text-primary-text border-primary/30",
  danger: "bg-danger-tint text-danger border-danger/40",
};

/** Status chip. Always carries text (and optionally an icon): never colour alone. */
export function Badge({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[tone]}`}
    >
      {icon ? <Icon name={icon} className="size-3.5" /> : null}
      {children}
    </span>
  );
}
