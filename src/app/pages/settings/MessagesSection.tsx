import { useState } from "react";
import { LANGUAGES, type Language } from "../../../shared/settings";
import { useT } from "../../lib/i18n";
import { TextArea } from "../../ui/Field";
import { Tabs } from "../../ui/Tabs";
import { LANGUAGE_NAMES, SectionCard, type SectionProps } from "./shared";

const MESSAGES = [
  { key: "returnMessage", label: "messages.return", hint: "messages.returnHint", max: 600 },
  { key: "lostMessage", label: "messages.lost", hint: "messages.lostHint", max: 600 },
  { key: "thankYouMessage", label: "messages.thanks", hint: "messages.thanksHint", max: 300 },
] as const;

export function MessagesSection({ draft, update, errors }: SectionProps) {
  const t = useT();
  const [lang, setLang] = useState<Language>("en");
  return (
    <SectionCard title={t("settings.messages")} description={t("settings.messagesDesc")}>
      <Tabs
        tabs={LANGUAGES.map((l) => ({ key: l, label: LANGUAGE_NAMES[l] }))}
        value={lang}
        onChange={setLang}
        label={t("messages.language")}
      >
        <div className="flex flex-col gap-4">
          {MESSAGES.map((m) => (
            <TextArea
              key={`${m.key}-${lang}`}
              label={t(m.label)}
              hint={lang === "en" ? t(m.hint) : t("messages.fallbackHint")}
              rows={4}
              maxLength={m.max}
              value={draft.messages[m.key][lang]}
              onChange={(e) =>
                update((d) => {
                  d.messages[m.key][lang] = e.target.value;
                })
              }
              error={errors[`messages.${m.key}.${lang}`]}
            />
          ))}
        </div>
      </Tabs>
    </SectionCard>
  );
}
