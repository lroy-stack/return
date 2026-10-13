import { useT } from "../../lib/i18n";
import { Link } from "../../lib/router";
import { TextInput, Toggle } from "../../ui/Field";
import { BlockedFinders } from "./BlockedFinders";
import { SectionCard, type SectionProps } from "./shared";

export function PrivacySection({ draft, update, errors }: SectionProps) {
  const t = useT();
  const p = draft.privacy;
  return (
    <div className="flex flex-col gap-5">
      <SectionCard title={t("settings.privacy")} description={t("settings.privacyDesc")}>
        <TextInput
          label={t("privacy.activityDays")}
          type="number"
          inputMode="numeric"
          min={7}
          max={730}
          hint={t("privacy.activityDaysHint")}
          value={p.activityRetentionDays}
          onChange={(e) =>
            update((d) => {
              d.privacy.activityRetentionDays = Number(e.target.value);
            })
          }
          error={errors["privacy.activityRetentionDays"] ? t("privacy.range") : undefined}
        />
        <TextInput
          label={t("privacy.closedDays")}
          type="number"
          inputMode="numeric"
          min={7}
          max={730}
          hint={t("privacy.closedDaysHint")}
          value={p.closedConversationRetentionDays}
          onChange={(e) =>
            update((d) => {
              d.privacy.closedConversationRetentionDays = Number(e.target.value);
            })
          }
          error={errors["privacy.closedConversationRetentionDays"] ? t("privacy.range") : undefined}
        />
        <Toggle
          label={t("privacy.scanCountry")}
          description={t("privacy.scanCountryHint")}
          checked={p.recordScanCountry}
          onChange={(on) =>
            update((d) => {
              d.privacy.recordScanCountry = on;
            })
          }
        />
        <p className="text-subhead text-muted">
          {t("privacy.exportLead")}{" "}
          <Link to="/settings/system" className="touch-target font-medium text-primary-text underline">
            {t("settings.system")}
          </Link>
          . {t("privacy.activityLead")}{" "}
          <Link to="/settings/activity" className="touch-target font-medium text-primary-text underline">
            {t("settings.activity")}
          </Link>
          .
        </p>
      </SectionCard>
      <BlockedFinders />
    </div>
  );
}
