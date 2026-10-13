import { Component, type ErrorInfo, lazy, type ReactNode, Suspense } from "react";
import { PwaUpdateToast } from "./components/PwaUpdateToast";
import { Shell } from "./components/Shell";
import { useT } from "./lib/i18n";
import { OverviewProvider } from "./lib/overview-context";
import { matchPath, useLocation } from "./lib/router";
import { SettingsProvider } from "./lib/settings-context";
import { InboxPage } from "./pages/InboxPage";
import { InventoryPage } from "./pages/InventoryPage";
import { ItemDetailPage } from "./pages/item/ItemDetailPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrintRoute } from "./pages/PrintRoute";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { TagsPage } from "./pages/TagsPage";
import { Button } from "./ui/Button";
import { LoadingBlock } from "./ui/States";
import { ToastProvider } from "./ui/Toast";

/** Component gallery: a design/QA tool, loaded on demand so it never weighs on the panel bundle. */
const GalleryPage = lazy(() =>
  import("./pages/gallery/GalleryPage").then((m) => ({ default: m.GalleryPage })),
);

function Routes() {
  const { pathname } = useLocation();
  if (pathname === "/") return <InventoryPage />;
  const item = matchPath("/items/:id", pathname);
  if (item) return <ItemDetailPage key={item.id} id={item.id ?? ""} />;
  if (pathname === "/conversations") return <InboxPage />;
  const conversation = matchPath("/conversations/:id", pathname);
  if (conversation) return <InboxPage activeId={conversation.id} />;
  if (pathname === "/tags") return <TagsPage />;
  if (pathname === "/tags/print") return <PrintRoute />;
  if (pathname === "/settings") return <SettingsPage />;
  if (pathname === "/gallery") return <GalleryPage />;
  const section = matchPath("/settings/:section", pathname);
  if (section) return <SettingsPage section={section.section} />;
  return <NotFoundPage />;
}

class Boundary extends Component<
  { children: ReactNode; fallback: (reset: () => void) => ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("render error", error, info.componentStack);
  }
  override render() {
    return this.state.failed
      ? this.props.fallback(() => this.setState({ failed: false }))
      : this.props.children;
  }
}

function RouteBoundary() {
  const t = useT();
  const { pathname } = useLocation();
  return (
    <Boundary
      key={pathname}
      fallback={(reset) => (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-card border border-danger/40 bg-danger-tint p-6"
        >
          <h1 className="text-xl font-bold text-danger">{t("error.crash")}</h1>
          <Button onClick={reset}>{t("common.retry")}</Button>
        </div>
      )}
    >
      <Suspense fallback={<LoadingBlock />}>
        <Routes />
      </Suspense>
    </Boundary>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <PwaUpdateToast />
        <OverviewProvider>
          <Shell>
            <RouteBoundary />
          </Shell>
        </OverviewProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
