import { lazy, Suspense } from "react";
import type { Tag } from "../../shared/schemas";
import { api, qs } from "../lib/api";
import { useResource } from "../lib/hooks";
import { useT } from "../lib/i18n";
import { useLocation } from "../lib/router";
import { useSettings } from "../lib/settings-context";
import { ButtonLink } from "../ui/Button";
import { PageHeader } from "../ui/Page";
import { EmptyState, ErrorState, LoadingBlock } from "../ui/States";

// The print studio (QR rendering, PDF export) is owned elsewhere and loaded on demand.
const PrintStudio = lazy(() => import("./print/PrintStudio").then((m) => ({ default: m.PrintStudio })));

export function PrintRoute() {
  const t = useT();
  const { search } = useLocation();
  const { state: settingsState, settings } = useSettings();
  const ids = (search.get("ids") ?? "").split(",").filter(Boolean);
  const tags = useResource<Tag[]>(`print:${ids.join(",")}`, async (signal) => {
    const { tags: all } = await api.get<{ tags: Tag[] }>(`/tags${qs({ status: "active" })}`, signal);
    return ids.length ? all.filter((tag) => ids.includes(tag.id)) : all;
  });

  const back = { to: "/tags", label: t("nav.tags") };
  if (tags.state.status === "loading" || settingsState.status === "loading") {
    return (
      <>
        <PageHeader title={t("print.title")} back={back} />
        <LoadingBlock />
      </>
    );
  }
  if (tags.state.status === "error") {
    return (
      <>
        <PageHeader title={t("print.title")} back={back} />
        <ErrorState error={tags.state.error} onRetry={() => tags.reload()} />
      </>
    );
  }
  if (tags.state.data.length === 0) {
    return (
      <>
        <PageHeader title={t("print.title")} back={back} />
        <EmptyState
          icon="tag"
          title={t("print.empty")}
          action={
            <ButtonLink to="/tags" variant="primary">
              {t("nav.tags")}
            </ButtonLink>
          }
        />
      </>
    );
  }
  return (
    <Suspense fallback={<LoadingBlock />}>
      <PrintStudio tags={tags.state.data} settings={settings} />
    </Suspense>
  );
}
