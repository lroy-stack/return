import { CARD_THEMES, LANGUAGES, type Language } from "../../../shared/settings";
import { useT } from "../../lib/i18n";
import { Select, TextInput, Toggle } from "../../ui/Field";
import { FieldGroup, LANGUAGE_NAMES, SectionCard, type SectionProps } from "./shared";

export function TagsSettingsSection({ draft, update, errors }: SectionProps) {
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
        <Select
          label={t("tagsCfg.theme")}
          value={tg.cardTheme}
          onChange={(e) =>
            update((d) => {
              d.tags.cardTheme = e.target.value as (typeof CARD_THEMES)[number];
            })
          }
        >
          {CARD_THEMES.map((c) => (
            <option key={c} value={c}>
              {t(`theme.card.${c}` as const)}
            </option>
          ))}
        </Select>
        <Select
          label={t("tagsCfg.cardLanguage")}
          value={tg.cardLanguage}
          onChange={(e) =>
            update((d) => {
              d.tags.cardLanguage = e.target.value as Language;
            })
          }
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </Select>
      </div>
      <Toggle
        label={t("tagsCfg.showName")}
        description={t("tagsCfg.showNameHint")}
        checked={tg.showNameOnCard}
        onChange={(on) =>
          update((d) => {
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
