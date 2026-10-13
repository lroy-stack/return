/**
 * Print studio strings (panel languages EN/ES). Kept next to the studio because this folder is
 * owned separately; candidates to merge into src/app/lib/dict.ts later.
 */
import type { PanelLanguage } from "../../lib/i18n";

const en = {
  subtitle: "CR80 PVC cards, 85.6 × 54 mm, printed on both sides.",
  proofTitle: "Proof only — the domain isn't live yet",
  proofBody:
    "{hosts} is not a public https address. Every export is stamped “PROOF — NOT FOR PRINT”. Print the real cards once RETURN runs on your own domain.",
  previewTitle: "Preview",
  front: "Front",
  back: "Back",
  frontAlt: "Front of card {label}: QR code, label, return message",
  backAlt: "Back of card {label}: fallback email and typeable address",
  qrMeta: "QR {size} mm · modules {module} mm · version {version}",
  thisCard: "Download this card",
  svgFront: "SVG front",
  svgBack: "SVG back",
  pngFront: "PNG front",
  pngBack: "PNG back",
  pngHint: "PNG at 300 dpi including 2 mm bleed. SVG and PDF are vector.",
  pdf: "Download print PDF",
  pdfAbout: "About the print file",
  pdfCount: "{n} cards · {pages} pages",
  pdfHint:
    "One page per side (front, back, front…), page = card + 2 mm bleed, trim box set. The back is laid out for a top-to-bottom flip, so the hole stays on the same edge. Proof marks are never included in the PDF.",
  pdfNone: "Select at least one card.",
  cards: "Cards",
  selectAll: "Select all",
  selectNone: "Clear",
  unassigned: "Not attached to an item",
  revoked: "Revoked",
  preview: "Preview",
  appearance: "Appearance",
  theme: "Card colour",
  language: "Card language",
  languageHint: "A small second line repeats the call to action in another language.",
  reward: "Reward line on the back",
  rewardHint: "Prints “Reward · Belohnung · Recompensa”.",
  marks: "Show proof marks",
  marksHint: "Trim line, safe area and hole die-line in previews, SVG and PNG. Turn off for final files.",
  settingsHint: "Name, printed email and message come from Settings → Tags.",
  warnings: "Check before printing",
  "warning.name_truncated": "The name is too long and was shortened.",
  "warning.message_truncated": "The card message is too long and was shortened.",
  "warning.email_truncated": "The printed email does not fit and was shortened. Use a shorter address.",
  "warning.url_truncated": "The address does not fit completely on the back.",
  "warning.label_truncated": "The label was shortened.",
  "warning.secondary_line_dropped": "The second-language line was left out to make room.",
  "warning.no_printed_email":
    "No printed fallback email. Add one in Settings → Tags: it is the backup when everything else fails.",
  layoutError: "This card cannot be laid out: {message}",
  nfcTitle: "NFC programming",
  nfcIntro: "Program each chip with its card's address after printing:",
  nfcStep1: "Use a native app such as NFC Tools (iPhone or Android). Safari cannot write NFC tags.",
  nfcStep2: "Write a single NDEF record of type URI (URL) with the address below.",
  nfcStep3: "Tap the card with a phone to test it, then mark the tag as programmed.",
  nfcNever: "Never lock the chip: a locked chip can't be corrected if the address ever changes.",
  nfcCapacity: "NTAG213 chips hold 144 bytes.",
  nfcBytes: "{n} bytes",
  nfcTooLong: "Long for an NTAG213 (over 120 bytes): use NTAG215/216 or a shorter domain.",
  nfcEmpty: "Select cards to list their addresses.",
  copy: "Copy address for {label}",
  copied: "Address copied",
  copyFailed: "Could not copy. Select the address and copy it manually.",
  exportFailed: "Export failed: {message}",
};

export type PrintKey = keyof typeof en;

const es: Record<PrintKey, string> = {
  subtitle: "Tarjetas de PVC CR80, 85,6 × 54 mm, impresas por ambas caras.",
  proofTitle: "Solo prueba: el dominio aún no está activo",
  proofBody:
    "{hosts} no es una dirección https pública. Todas las exportaciones llevan el sello “PROOF — NOT FOR PRINT”. Imprime las tarjetas reales cuando RETURN funcione en tu propio dominio.",
  previewTitle: "Vista previa",
  front: "Anverso",
  back: "Reverso",
  frontAlt: "Anverso de la tarjeta {label}: código QR, etiqueta y mensaje",
  backAlt: "Reverso de la tarjeta {label}: correo de respaldo y dirección para escribir",
  qrMeta: "QR {size} mm · módulos {module} mm · versión {version}",
  thisCard: "Descargar esta tarjeta",
  svgFront: "SVG anverso",
  svgBack: "SVG reverso",
  pngFront: "PNG anverso",
  pngBack: "PNG reverso",
  pngHint: "PNG a 300 ppp con 2 mm de sangrado. SVG y PDF son vectoriales.",
  pdf: "Descargar PDF de impresión",
  pdfAbout: "Sobre el archivo de impresión",
  pdfCount: "{n} tarjetas · {pages} páginas",
  pdfHint:
    "Una página por cara (anverso, reverso, anverso…), página = tarjeta + 2 mm de sangrado, con TrimBox. El reverso está pensado para girar de arriba abajo, así el agujero queda en el mismo borde. Las marcas de prueba nunca van en el PDF.",
  pdfNone: "Selecciona al menos una tarjeta.",
  cards: "Tarjetas",
  selectAll: "Seleccionar todas",
  selectNone: "Ninguna",
  unassigned: "Sin objeto asignado",
  revoked: "Revocada",
  preview: "Ver",
  appearance: "Aspecto",
  theme: "Color de la tarjeta",
  language: "Idioma de la tarjeta",
  languageHint: "Una segunda línea pequeña repite el mensaje en otro idioma.",
  reward: "Línea de recompensa en el reverso",
  rewardHint: "Imprime “Reward · Belohnung · Recompensa”.",
  marks: "Mostrar marcas de prueba",
  marksHint:
    "Corte, zona segura y troquel del agujero en vistas previas, SVG y PNG. Desactívalas para los archivos finales.",
  settingsHint: "Nombre, correo impreso y mensaje vienen de Ajustes → Etiquetas.",
  warnings: "Revisa antes de imprimir",
  "warning.name_truncated": "El nombre es demasiado largo y se ha acortado.",
  "warning.message_truncated": "El mensaje de la tarjeta es demasiado largo y se ha acortado.",
  "warning.email_truncated": "El correo impreso no cabe y se ha acortado. Usa una dirección más corta.",
  "warning.url_truncated": "La dirección no cabe completa en el reverso.",
  "warning.label_truncated": "La etiqueta se ha acortado.",
  "warning.secondary_line_dropped": "Se ha omitido la línea en el segundo idioma para dejar espacio.",
  "warning.no_printed_email":
    "No hay correo de respaldo impreso. Añádelo en Ajustes → Etiquetas: es la última vía cuando todo lo demás falla.",
  layoutError: "No se puede maquetar esta tarjeta: {message}",
  nfcTitle: "Programar NFC",
  nfcIntro: "Programa cada chip con la dirección de su tarjeta después de imprimir:",
  nfcStep1: "Usa una app nativa como NFC Tools (iPhone o Android). Safari no puede escribir etiquetas NFC.",
  nfcStep2: "Escribe un único registro NDEF de tipo URI (URL) con la dirección de abajo.",
  nfcStep3: "Acerca un móvil a la tarjeta para probarla y marca la etiqueta como programada.",
  nfcNever: "Nunca bloquees el chip: un chip bloqueado no se puede corregir si la dirección cambia.",
  nfcCapacity: "Los chips NTAG213 guardan 144 bytes.",
  nfcBytes: "{n} bytes",
  nfcTooLong: "Larga para un NTAG213 (más de 120 bytes): usa NTAG215/216 o un dominio más corto.",
  nfcEmpty: "Selecciona tarjetas para ver sus direcciones.",
  copy: "Copiar la dirección de {label}",
  copied: "Dirección copiada",
  copyFailed: "No se pudo copiar. Selecciona la dirección y cópiala a mano.",
  exportFailed: "La exportación falló: {message}",
};

const DICTS: Record<PanelLanguage, Record<PrintKey, string>> = { en, es };

export type PrintT = (key: PrintKey, vars?: Record<string, string | number>) => string;

export function printTranslator(lang: PanelLanguage): PrintT {
  return (key, vars) => {
    const raw = DICTS[lang][key] ?? en[key];
    return vars ? raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? "")) : raw;
  };
}
