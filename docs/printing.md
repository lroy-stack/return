# Printing NFC luggage cards

Format: PVC CR80 (85.6 × 54 mm), double-sided, NTAG213 inlay, punched hole. Files come from the panel
(Tags → Print cards): one PDF page per side, 2 mm bleed, vector QR, plus SVG/PNG per side. The NFC programming list (label → URL, with copy buttons and byte length) is in the
print studio itself; Tags → Export NFC CSV gives the same list as a file.

## Before ordering
- The domain must be live and the tag pages verified on a phone. Exports are stamped "PROOF — NOT FOR PRINT"
  while the URL is not a public https host.
- Order a few cards first; scan them in daylight and dim light, scuffed, and through a luggage-tag sleeve.
- Ask the printer for: variable data (a different QR per card), chip encoding service (NDEF URI record =
  the card's URL, **not locked**), hole punching position matching the template, and a proof.
- If the printer does not encode chips, program them yourself with a native app (e.g. NFC Tools on iPhone or
  Android). Safari cannot write NFC; Chrome on Android supports Web NFC but a native app is simpler.

## Vendors found (2026-10-13, check current offers; no prices invented)
| Vendor | Country | What the site states | Status |
|---|---|---|---|
| nfc-tag-shop.de | DE | Printed PVC NFC cards 85.6×54 mm (vCard product 29,90 € incl. VAT); NTAG213 options; double-sided print | Hole punching, MOQ and variable QR not stated → ask for a quote |
| rfid.it | IT | NTAG213 CR80, MOQ 10, volume prices from 200 | Quote for printing/variable data |
| GoToTags | US | Printed NTAG213 PVC cards, MOQ 500 (~3 weeks); badges MOQ 1 with 3 mm hole | Outside EU (shipping/customs) |
| shopnfc.de, zipnfc.de, nfc-tag.de | DE/EU | Sites unreachable during research | Re-check manually |

Quote required for every option: small batch (10–25), double-sided full colour, variable QR + matching encoded
URL per card, punched hole, durability (overlaminate / UV), turnaround and shipping to Germany.
