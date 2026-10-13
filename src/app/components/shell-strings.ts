import type { PanelLanguage } from "../lib/i18n";

/**
 * Shell strings that lib/dict.ts does not have yet. lib/ is owned by the pages agent in phase 2: these keys are
 * listed in docs/design/audit-002.md (page change 7) to be moved into dict.ts, after which this file is deleted.
 */
const STRINGS = {
  en: {
    quickTitle: "Create",
    quickOpen: "Create something new",
    quickCard: "Quick card",
    quickCardDesc: "A tag and a printable card in a few taps",
    quickAddItemDesc: "Photo, name and category",
    quickNewTagsDesc: "Blank tags to assign later",
    navExpand: "Show labels",
    navCollapse: "Hide labels",
    appearance: "Appearance",
    newShort: "New",
    gallery: "Component gallery",
  },
  es: {
    quickTitle: "Crear",
    quickOpen: "Crear algo nuevo",
    quickCard: "Tarjeta rápida",
    quickCardDesc: "Una etiqueta y una tarjeta imprimible en pocos toques",
    quickAddItemDesc: "Foto, nombre y categoría",
    quickNewTagsDesc: "Etiquetas en blanco para asignar después",
    navExpand: "Mostrar nombres",
    navCollapse: "Ocultar nombres",
    appearance: "Apariencia",
    newShort: "Nuevo",
    gallery: "Galería de componentes",
  },
} as const satisfies Record<PanelLanguage, Record<string, string>>;

export type ShellStringKey = keyof (typeof STRINGS)["en"];

export function shellString(lang: PanelLanguage, key: ShellStringKey): string {
  return STRINGS[lang][key];
}
