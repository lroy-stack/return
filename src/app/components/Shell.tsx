import { type ReactNode, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { useOverview } from "../lib/overview-context";
import { Link, useLocation } from "../lib/router";
import { applyTheme, readTheme, type ThemeChoice } from "../lib/theme";
import { Icon, type IconName } from "../ui/Icon";

interface NavDef {
  to: string;
  match: string;
  icon: IconName;
  labelKey: "nav.inventory" | "nav.inbox" | "nav.tags" | "nav.settings";
}

const NAV: NavDef[] = [
  { to: "/", match: "^/(items/.*)?$", icon: "inventory", labelKey: "nav.inventory" },
  { to: "/conversations", match: "^/conversations", icon: "inbox", labelKey: "nav.inbox" },
  { to: "/tags", match: "^/tags", icon: "tag", labelKey: "nav.tags" },
  { to: "/settings", match: "^/settings", icon: "settings", labelKey: "nav.settings" },
];

const THEME_ORDER: ThemeChoice[] = ["system", "light", "dark"];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  const next = THEME_ORDER[(THEME_ORDER.indexOf(choice) + 1) % THEME_ORDER.length] ?? "system";
  const current = t(`theme.${choice}` as const);
  const icon: IconName = choice === "dark" ? "moon" : "sun";
  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(next);
        setChoice(next);
      }}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted hover:bg-sunken hover:text-fg ${compact ? "size-11 justify-center px-0" : ""}`}
      aria-label={t("theme.toggle", { current })}
      title={t("theme.toggle", { current })}
    >
      <Icon name={icon} />
      {compact ? null : <span>{current}</span>}
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const { pathname } = useLocation();
  const overview = useOverview();
  const unread = overview.state.status === "ready" ? overview.state.data.unreadConversations.length : 0;

  // Refresh the attention data whenever the user moves to another screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is stable
  useEffect(() => {
    overview.reload(true);
  }, [pathname]);

  const isActive = (n: NavDef) => new RegExp(n.match).test(pathname);

  const renderLink = (n: NavDef, variant: "side" | "tab") => {
    const active = isActive(n);
    const showBadge = n.to === "/conversations" && unread > 0;
    const label = t(n.labelKey);
    const base = "relative flex items-center";
    const cls =
      variant === "side"
        ? `${base} min-h-11 gap-3 rounded-xl px-3 font-medium ${active ? "bg-primary-tint text-primary-text" : "text-fg hover:bg-sunken"}`
        : `${base} min-h-14 flex-1 flex-col justify-center gap-0.5 text-xs font-medium ${active ? "text-primary-text" : "text-muted"}`;
    return (
      <Link key={n.to} to={n.to} className={cls} aria-current={active ? "page" : undefined}>
        <span className="relative">
          <Icon name={n.icon} className={variant === "tab" ? "size-6" : "size-5"} />
          {showBadge && variant === "tab" ? (
            <span className="absolute -top-1 -right-1.5 size-2.5 rounded-full bg-lost ring-2 ring-raised" />
          ) : null}
        </span>
        <span>{label}</span>
        {showBadge ? (
          <span
            className={`rounded-full bg-lost px-1.5 text-xs font-bold text-white ${variant === "side" ? "ml-auto" : "sr-only"}`}
          >
            <span className="sr-only">{t("nav.unread", { n: unread })}</span>
            <span aria-hidden="true">{unread}</span>
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
      >
        {t("nav.skip")}
      </a>

      <aside className="no-print sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-raised p-4 lg:flex">
        <Link
          to="/"
          className="flex items-center gap-2.5 px-2 pt-2 text-xl font-bold tracking-wide text-primary-text"
        >
          <Logo />
          RETURN
        </Link>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
          {NAV.map((n) => renderLink(n, "side"))}
        </nav>
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-1.5 backdrop-blur lg:hidden">
          <Link
            to="/"
            className="flex min-h-11 items-center gap-2 text-lg font-bold tracking-wide text-primary-text"
          >
            <Logo />
            RETURN
          </Link>
          <ThemeToggle compact />
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-page flex-1 px-4 pt-5 pb-28 outline-none sm:px-6 lg:px-10 lg:pt-10 lg:pb-16"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label={t("nav.main")}
        className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {NAV.map((n) => renderLink(n, "tab"))}
      </nav>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M10 22V10h7a4 4 0 0 1 0 8h-7m6 0 5 4"
        fill="none"
        className="stroke-primary-fg"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
