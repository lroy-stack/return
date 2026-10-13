import { InstallPanel } from "../../components/InstallApp";
import { useT } from "../../lib/i18n";
import { SectionCard } from "./shared";

/** Settings > Install app: the install button, or the Add to Home Screen steps on iOS. */
export function InstallSection() {
  const t = useT();
  return (
    <SectionCard title={t("settings.install")} description={t("settings.installDesc")}>
      <InstallPanel />
    </SectionCard>
  );
}
