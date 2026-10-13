import type { OwnerAlert } from "../../shared/schemas";
import { api } from "../lib/api";
import { useDataChanged } from "../lib/data-events";
import { emailFailureText } from "../lib/email-failure";
import { useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { Link, useLocation } from "../lib/router";
import { useFormat } from "../lib/settings-context";
import { Icon } from "../ui/Icon";

/**
 * Conditions the owner must see on every screen (`GET /alerts`): today, the latest email meant for the owner failed.
 * Not dismissible on purpose; it goes away when the next owner email (a test email counts) is delivered.
 */
export function AlertsBanner() {
  const t = useT();
  const format = useFormat();
  const { pathname } = useLocation();
  const res = useResource<OwnerAlert[]>(
    "alerts",
    async (signal) => (await api.get<{ alerts: OwnerAlert[] }>("/alerts", signal)).alerts,
    { pollMs: 300_000 },
  );
  useDataChanged(() => res.reload(true));
  const alerts = res.state.status === "ready" ? res.state.data : [];
  if (alerts.length === 0) return null;
  return (
    <section aria-label={t("alert.region")} className="mb-5 flex flex-col gap-2">
      {alerts.map((a) => (
        <div
          key={a.kind}
          role="status"
          className="flex gap-3 rounded-card bg-warning-tint px-4 py-3 text-warning ring-1 ring-warning/30"
        >
          <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("alert.emailTitle")}</p>
            <p className="text-subhead">
              {t("alert.emailBody", { reason: emailFailureText(a.code, t) })}
              {a.since ? ` ${t("alert.since", { when: format.dateTime(a.since) })}` : ""}
            </p>
            {pathname !== "/settings/notifications" ? (
              <Link
                to="/settings/notifications"
                className="touch-target mt-1 inline-block text-subhead font-semibold underline"
              >
                {t("alert.fix")}
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}
