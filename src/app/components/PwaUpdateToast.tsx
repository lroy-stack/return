import { useEffect } from "react";
import { useT } from "../lib/i18n";
import { applyUpdate, useUpdateReady } from "../lib/pwa";
import { useToast } from "../ui/Toast";

/** Renders nothing; announces "Update ready" with a Reload action while a new service worker is waiting. */
export function PwaUpdateToast() {
  const t = useT();
  const toast = useToast();
  const ready = useUpdateReady();
  // biome-ignore lint/correctness/useExhaustiveDependencies: announce once per waiting worker, not on every language change
  useEffect(() => {
    if (ready)
      toast(t("pwa.updateReady"), "info", {
        sticky: true,
        action: { label: t("pwa.reload"), onClick: applyUpdate },
      });
  }, [ready]);
  return null;
}
