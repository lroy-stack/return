import { useMemo } from "react";
import { LANGUAGES, type Language } from "../../../shared/settings";
import { AppearanceControl } from "../../components/QuickActions";
import { useI18n, useT } from "../../lib/i18n";
import { localeOptions, timeZoneOptions } from "../../lib/locale-options";
import { Card, Section } from "../../ui/Card";
import { TextInput } from "../../ui/Field";
import { Combobox, Select } from "../../ui/Select";
import { LANGUAGE_NAMES, SectionCard, type SectionProps } from "./shared";

const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }));

export function IdentitySection({ draft, update, errors }: SectionProps) {
  const t = useT();
  const { lang } = useI18n();
  const id = draft.identity;
  // Zones and locales are listed once per panel language; the saved value is always present.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the saved value only needs to be added once
  const zones = useMemo(
    () =>
      timeZoneOptions(lang, id.timezone).map((z) => ({ ...z, group: t(`tz.region.${z.region}` as const) })),
    [lang, t],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: as above
  const locales = useMemo(() => localeOptions(lang, id.locale), [lang]);

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title={t("settings.identity")} description={t("settings.identityDesc")}>
        <TextInput
          label={t("identity.publicName")}
          hint={t("identity.publicNameHint")}
          value={id.publicName}
          onChange={(e) =>
            update((d) => {
              d.identity.publicName = e.target.value;
            })
          }
          error={errors["identity.publicName"]}
          maxLength={80}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select<Language>
            label={t("identity.panelLanguage")}
            hint={t("identity.panelLanguageHint")}
            options={LANGUAGE_OPTIONS}
            value={id.panelLanguage}
            onChange={(v) =>
              update((d) => {
                d.identity.panelLanguage = v;
              })
            }
          />
          <Select<Language>
            label={t("identity.finderLanguage")}
            hint={t("identity.finderLanguageHint")}
            options={LANGUAGE_OPTIONS}
            value={id.defaultPublicLanguage}
            onChange={(v) =>
              update((d) => {
                d.identity.defaultPublicLanguage = v;
              })
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Combobox
            label={t("identity.timezone")}
            hint={t("identity.timezoneHint")}
            placeholder={t("tz.searchPlaceholder")}
            options={zones}
            value={id.timezone}
            onChange={(v) =>
              update((d) => {
                d.identity.timezone = v;
              })
            }
            error={errors["identity.timezone"]}
          />
          <Select
            label={t("identity.locale")}
            hint={t("identity.localeHint")}
            options={locales}
            value={id.locale}
            onChange={(v) =>
              update((d) => {
                d.identity.locale = v;
              })
            }
            error={errors["identity.locale"]}
          />
        </div>
      </SectionCard>
      <Section title={t("theme.appearance")} description={t("settings.appearanceDesc")}>
        <Card>
          <AppearanceControl block />
        </Card>
      </Section>
    </div>
  );
}
