/**
 * RETURN palette. Shared by printed cards (SVG/PDF) and mirrored as CSS custom properties in
 * the panel and public pages. Text colours meet WCAG AA (4.5:1) on `warmWhite`.
 */
export const BRAND = {
  petrol: "#0E4A55",
  petrolDeep: "#0A363E",
  petrolSoft: "#1F6B78",
  warmWhite: "#FAF7F2",
  paper: "#FFFDF9",
  sage: "#8FAE96",
  sageText: "#4A6B55",
  sageTint: "#E4ECE5",
  ink: "#1B2326",
  muted: "#55656A",
  line: "#E3DED5",
  lost: "#A84A27",
  lostTint: "#F6E6DE",
} as const;
