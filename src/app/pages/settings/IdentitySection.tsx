import { LANGUAGES, type Language } from "../../../shared/settings";
import { AppearanceControl } from "../../components/QuickActions";
import { useT } from "../../lib/i18n";
import { Card, Section } from "../../ui/Card";
import { Select, TextInput } from "../../ui/Field";
import { LANGUAGE_NAMES, SectionCard, type SectionProps } from "./shared";

function timezones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "Europe/Berlin", "Europe/Madrid", "America/New_York"];
  }
}

export function IdentitySection({ draft, update, errors }: SectionProps) {
  const t = useT();
  const id = draft.identity;
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
          <Select
            label={t("identity.panelLanguage")}
            hint={t("identity.panelLanguageHint")}
            value={id.panelLanguage}
            onChange={(e) =>
              update((d) => {
                d.identity.panelLanguage = e.target.value as Language;
              })
            }
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_NAMES[l]}
              </option>
            ))}
          </Select>
          <Select
            label={t("identity.finderLanguage")}
            hint={t("identity.finderLanguageHint")}
            value={id.defaultPublicLanguage}
            onChange={(e) =>
              update((d) => {
                d.identity.defaultPublicLanguage = e.target.value as Language;
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <TextInput
              label={t("identity.timezone")}
              list="tz-list"
              value={id.timezone}
              onChange={(e) =>
                update((d) => {
                  d.identity.timezone = e.target.value;
                })
              }
              error={errors["identity.timezone"]}
              autoComplete="off"
            />
            <datalist id="tz-list">
              {timezones().map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>
          <TextInput
            label={t("identity.locale")}
            hint={t("identity.localeHint")}
            value={id.locale}
            onChange={(e) =>
              update((d) => {
                d.identity.locale = e.target.value;
              })
            }
            error={errors["identity.locale"]}
            maxLength={16}
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
