import type { ReactNode } from "react";
import type { ItemCategory } from "../../../shared/schemas";

/** A gallery section: anchor id, title, short usage note, then specimens. */
export function Specimen({
  id,
  title,
  usage,
  children,
}: {
  id: string;
  title: string;
  usage: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-h`}
      className="scroll-mt-20 border-t border-line pt-8 first:border-0 first:pt-0"
    >
      <h2 id={`${id}-h`} className="text-title2 font-bold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 mb-5 max-w-prose text-subhead text-muted">{usage}</p>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

/** One labelled row of variants. */
export function Row({
  label,
  children,
  wrap = true,
}: {
  label: string;
  children: ReactNode;
  wrap?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-caption text-muted">{label}</p>
      <div className={wrap ? "flex flex-wrap items-center gap-3" : "flex flex-col gap-3"}>{children}</div>
    </div>
  );
}

/** Small "product photo" as a data URL (no network), for Thumb/ItemCard specimens. */
export function samplePhoto(hue: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'><defs><linearGradient id='b' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue + 40} 18% 88%)'/><stop offset='1' stop-color='hsl(${hue + 20} 14% 70%)'/></linearGradient><linearGradient id='o' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='hsl(${hue} 45% 42%)'/><stop offset='1' stop-color='hsl(${hue} 50% 24%)'/></linearGradient></defs><rect width='160' height='120' fill='url(#b)'/><ellipse cx='80' cy='100' rx='50' ry='7' fill='rgba(0,0,0,.18)'/><rect x='45' y='30' width='70' height='68' rx='16' fill='url(#o)'/><path d='M66 30a14 14 0 0128 0' fill='none' stroke='rgba(0,0,0,.25)' stroke-width='3'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export interface SampleItem {
  id: string;
  name: string;
  brand: string;
  category: ItemCategory;
  photo: string | null;
  tag: string | null;
}

export const SAMPLE_ITEMS: SampleItem[] = [
  {
    id: "a",
    name: "Cabin suitcase",
    brand: "Rimowa · Essential Cabin",
    category: "suitcase",
    photo: samplePhoto(190),
    tag: "003",
  },
  {
    id: "b",
    name: "Navy travel backpack",
    brand: "Osprey · Farpoint 40",
    category: "backpack",
    photo: samplePhoto(215),
    tag: "001",
  },
  {
    id: "c",
    name: "Leather wallet",
    brand: "Bellroy · Note Sleeve",
    category: "wallet",
    photo: null,
    tag: null,
  },
];
