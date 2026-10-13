import { useConnectivity } from "../lib/connectivity";
import { notifyDataChanged } from "../lib/data-events";
import { useT } from "../lib/i18n";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

/**
 * Shown on every screen while the browser reports no connection, or while the browser is online but the API cannot be
 * reached. The shell still renders from the service worker's cache; data does not (no offline data in v1).
 */
export function OfflineBanner() {
  const t = useT();
  const state = useConnectivity();
  if (state === "online") return null;
  const offline = state === "offline";
  return (
    <section
      aria-label={t(offline ? "offline.title" : "offline.unreachableTitle")}
      className="mb-5 flex flex-wrap items-center gap-3 rounded-card bg-warning-tint px-4 py-3 text-warning ring-1 ring-warning/30"
    >
      <Icon name="alert" className="size-5 shrink-0" />
      <div role="status" className="min-w-0 flex-1 basis-56">
        <p className="font-semibold">{t(offline ? "offline.title" : "offline.unreachableTitle")}</p>
        <p className="text-subhead">{t(offline ? "offline.body" : "offline.unreachableBody")}</p>
      </div>
      {offline ? (
        <Button size="sm" icon="refresh" onClick={notifyDataChanged}>
          {t("offline.retry")}
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={notifyDataChanged}>
            {t("offline.retry")}
          </Button>
          <Button size="sm" icon="refresh" onClick={() => window.location.reload()}>
            {t("offline.reload")}
          </Button>
        </div>
      )}
    </section>
  );
}
