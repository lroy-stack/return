import { BRAND } from "../../../shared/brand";
import { CARD_THEMES, LANGUAGES, type Language } from "../../../shared/settings";
import { useT } from "../../lib/i18n";
import { LANGUAGE_OPTIONS } from "../../lib/locale-options";
import { TextInput, Toggle } from "../../ui/Field";
import { Select } from "../../ui/Select";
import { FieldGroup, LANGUAGE_NAMES, SectionCard, type SectionProps } from "./shared";

type CardTheme = (typeof CARD_THEMES)[number];

/**
 * Front colour of each card theme (mirrors `front.background` in src/shared/card/themes.ts). Read from BRAND, not
 * CARD_PALETTES: importing the card module here would pull the whole card renderer chunk into the initial load.
 */
const FRONT: Record<CardTheme, string> = { petrol: BRAND.petrol, sage: BRAND.sage, warm: BRAND.warmWhite };

/** Colour of the card front as a small dot (decorative; the option label names the theme). */
function ThemeDot({ theme }: { theme: CardTheme }) {
  return (
    <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill={FRONT[theme]} className="stroke-line-strong" strokeWidth="1" />
    </svg>
  );
}

export function TagsSettingsSection({ draft, update, instant, errors }: SectionProps) {
  const t = useT();
  const tg = draft.tags;
  const example = `${tg.labelPrefix}${"1".padStart(tg.labelDigits, "0")}`;
  return (
    <SectionCard title={t("settings.tags")} description={t("settings.tagsDesc")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          label={t("tagsCfg.prefix")}
          value={tg.labelPrefix}
          onChange={(e) =>
            update((d) => {
              d.tags.labelPrefix = e.target.value;
            })
          }
          maxLength={8}
          error={errors["tags.labelPrefix"]}
          hint={t("tagsCfg.example", { example })}
        />
        <TextInput
          label={t("tagsCfg.digits")}
          type="number"
          min={1}
          max={6}
          value={tg.labelDigits}
          onChange={(e) =>
            update((d) => {
              d.tags.labelDigits = Number(e.target.value);
            })
          }
          error={errors["tags.labelDigits"] ? t("tagsCfg.digitsRange") : undefined}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Select<CardTheme>
          label={t("tagsCfg.theme")}
          options={CARD_THEMES.map((c) => ({
            value: c,
            label: t(`theme.card.${c}` as const),
            leading: <ThemeDot theme={c} />,
          }))}
          value={tg.cardTheme}
          onChange={(v) =>
            instant((d) => {
              d.tags.cardTheme = v;
            })
          }
        />
        <Select<Language>
          label={t("tagsCfg.cardLanguage")}
          options={LANGUAGE_OPTIONS}
          value={tg.cardLanguage}
          onChange={(v) =>
            instant((d) => {
              d.tags.cardLanguage = v;
            })
          }
        />
      </div>
      <Toggle
        label={t("tagsCfg.showName")}
        description={t("tagsCfg.showNameHint")}
        checked={tg.showNameOnCard}
        onChange={(on) =>
          instant((d) => {
            d.tags.showNameOnCard = on;
          })
        }
      />
      <TextInput
        label={t("tagsCfg.printedEmail")}
        type="email"
        hint={t("tagsCfg.printedEmailHint")}
        value={tg.printedEmail ?? ""}
        onChange={(e) =>
          update((d) => {
            d.tags.printedEmail = e.target.value.trim() || null;
          })
        }
        error={errors["tags.printedEmail"]}
      />
      <FieldGroup legend={t("tagsCfg.cardMessage")}>
        <div className="flex flex-col gap-3">
          {LANGUAGES.map((l) => (
            <TextInput
              key={l}
              label={LANGUAGE_NAMES[l]}
              maxLength={90}
              value={tg.cardMessage[l]}
              onChange={(e) =>
                update((d) => {
                  d.tags.cardMessage[l] = e.target.value;
                })
              }
              error={errors[`tags.cardMessage.${l}`]}
            />
          ))}
        </div>
      </FieldGroup>
    </SectionCard>
  );
}
