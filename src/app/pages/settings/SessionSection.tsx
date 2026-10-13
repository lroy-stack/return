import { useState } from "react";
import { useT } from "../../lib/i18n";
import { releaseThisDevice } from "../../lib/push";
import { clearCaches } from "../../lib/pwa";
import { Button } from "../../ui/Button";
import { SectionCard } from "./shared";

/** Cloudflare Access logout; clears this origin's cookie and sends the browser to the login page. */
const ACCESS_LOGOUT = "/cdn-cgi/access/logout";

export function SessionSection() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    await releaseThisDevice();
    await clearCaches();
    window.location.assign(ACCESS_LOGOUT);
  };
  return (
    <SectionCard title={t("settings.session")} description={t("settings.sessionDesc")}>
      <p className="text-subhead text-muted">{t("session.signOutHint")}</p>
      <div>
        <Button variant="danger-soft" loading={busy} onClick={signOut}>
          {t("session.signOut")}
        </Button>
      </div>
    </SectionCard>
  );
}
