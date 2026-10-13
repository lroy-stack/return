import { lazy, Suspense, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { matchPath, navigate, useLocation } from "../lib/router";
import { Sheet } from "../ui/Sheet";
import { LoadingBlock } from "../ui/States";

// The card layout, QR and PDF code only load when the sheet opens.
const QuickCardFlow = lazy(() => import("./QuickCardFlow").then((m) => ({ default: m.QuickCardFlow })));

/**
 * Opens the Quick card sheet from the URL: `?quick-card=1` on any page, with the item preselected on
 * `/items/:id`. Closing removes the parameter, so back/forward and bookmarks behave.
 */
export function QuickCardHost() {
  const t = useT();
  const { pathname, search } = useLocation();
  const wanted = search.get("quick-card") === "1";
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (wanted) setMounted(true);
  }, [wanted]);

  if (!mounted) return null;
  const itemId = matchPath("/items/:id", pathname)?.id ?? null;
  const close = () => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("quick-card")) return;
    params.delete("quick-card");
    const rest = params.toString();
    navigate(`${window.location.pathname}${rest ? `?${rest}` : ""}`, { replace: true });
  };
  return (
    <Sheet open={wanted} onClose={close} title={t("qc.title")} description={t("qc.desc")} size="lg">
      <Suspense
        fallback={
          <div className="px-5 pb-5">
            <LoadingBlock rows={3} />
          </div>
        }
      >
        <QuickCardFlow initialItemId={itemId} />
      </Suspense>
    </Sheet>
  );
}
