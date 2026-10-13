import type { SVGProps } from "react";

/** Inline 24x24 stroke icons. Decorative by default (aria-hidden); pair with visible text or aria-label on the parent. */
const PATHS = {
  inventory: "M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4m0 0l8-4m-8 4v10",
  inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5",
  tag: "M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z",
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  chevron: "M9 5l7 7-7 7",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  lock: "M7 11V8a5 5 0 0110 0v3M5 11h14v10H5V11z",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8l1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
  camera: "M4 8h3l2-3h6l2 3h3v12H4V8zM12 17a4 4 0 100-8 4 4 0 000 8z",
  photo: "M4 5h16v14H4V5zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  copy: "M8 8h12v12H8V8zM16 8V4H4v12h4",
  download: "M12 4v12m0 0l-4-4m4 4l4-4M4 20h16",
  external: "M14 4h6v6m0-6L10 14M18 14v6H4V6h6",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14m6-12v14",
  pin: "M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  send: "M4 12l16-8-6 16-2.5-6.5L4 12z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  qr: "M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h2v2h-2v-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2z",
  print: "M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7v-6z",
  box: "M3 8l9-5 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8",
  backpack:
    "M8 6a4 4 0 018 0M6 8h12a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9a2 2 0 012-2zM9 15h6v3H9v-3z",
  suitcase: "M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M4 7h16v12H4V7zM8 7v12m8-12v12",
  bag: "M5 8h14l1 12H4L5 8zM9 8V6a3 3 0 016 0v2",
  laptop: "M5 6h14v9H5V6zM2 19h20l-2-4H4l-2 4z",
  tablet: "M6 3h12v18H6V3zM11 18h2",
  phone: "M8 3h8v18H8V3zM11 18h2",
  headphones: "M4 15v-3a8 8 0 0116 0v3M4 15h4v5H5a1 1 0 01-1-1v-4zm16 0h-4v5h3a1 1 0 001-1v-4z",
  wallet: "M4 7h14a2 2 0 012 2v10H6a2 2 0 01-2-2V7zM4 7V6a2 2 0 012-2h11M16 14h.01",
  keys: "M8 15a4 4 0 110-8 4 4 0 010 8zM11 12h10m-3 0v4m-4-4v3",
  documents: "M7 3h8l4 4v14H7V3zM15 3v4h4M10 12h6m-6 4h6",
  clothing: "M8 4l-5 4 3 3 2-1v10h8V10l2 1 3-3-5-4a4 4 0 01-8 0z",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  info: "M12 11v6m0-10h.01M12 22a10 10 0 100-20 10 10 0 000 20z",
  box_open: "M3 9l3-5h12l3 5M3 9h18v11H3V9zM9 13h6",
  refresh: "M20 11a8 8 0 00-14.9-3M4 4v4h4M4 13a8 8 0 0014.9 3M20 20v-4h-4",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${/(^|\s)size-/.test(className) ? "" : "size-5"} ${className}`}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
