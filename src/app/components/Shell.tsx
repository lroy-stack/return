import { type ReactNode, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { useOverview } from "../lib/overview-context";
import { Link, useLocation } from "../lib/router";
import { CountBadge } from "../ui/Badge";
import { cx } from "../ui/cx";
import { Icon, type IconName } from "../ui/Icon";
import { AppearanceControl, AppearanceSheet, QuickActionsSheet } from "./QuickActions";
import { QuickCardHost } from "./QuickCardHost";

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

const RAIL_KEY = "return.rail";

function readRailExpanded(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "expanded";
  } catch {
    return false;
  }
}

/**
 * Tracks the page's large title (`[data-page-title]` from PageHeader): `scrolled` once content moves under the
 * header (glass on), `collapsed` once the title is gone (compact title shown).
 */
function useScrollChrome(pathname: string) {
  const [state, setState] = useState({ scrolled: false, collapsed: false, title: "" });
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on navigation
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const h1 = document.querySelector<HTMLElement>("#main [data-page-title]");
      const scrolled = window.scrollY > 4;
      const collapsed = h1 ? h1.getBoundingClientRect().bottom < 56 : false;
      const title = h1?.textContent ?? "";
      setState((s) =>
        s.scrolled === scrolled && s.collapsed === collapsed && s.title === title
          ? s
          : { scrolled, collapsed, title },
      );
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [pathname]);
  return state;
}

/**
 * App chrome (Liquid Glass layer). Phone < 640: compact glass header + floating capsule tab bar + floating "+".
 * Tablet 640–1023: floating glass nav rail (icons + labels, expandable). Desktop >= 1024: floating glass sidebar.
 * Content scrolls underneath; chrome never carries content.
 */
export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const { pathname } = useLocation();
  const overview = useOverview();
  const unread = overview.state.status === "ready" ? overview.state.data.unreadConversations.length : 0;
  const [quickOpen, setQuickOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [railExpanded, setRailExpanded] = useState(readRailExpanded);
  const chrome = useScrollChrome(pathname);

  // Refresh the attention data whenever the user moves to another screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is stable
  useEffect(() => {
    overview.reload(true);
  }, [pathname]);

  const toggleRail = () => {
    const next = !railExpanded;
    setRailExpanded(next);
    try {
      window.localStorage.setItem(RAIL_KEY, next ? "expanded" : "collapsed");
    } catch {
      // Not persisted; still applies for this session.
    }
  };

  const isActive = (n: NavDef) => new RegExp(n.match).test(pathname);
  const unreadLabel = t("nav.unread", { n: unread });
  const quickLabel = t("quick.open");

  /** Sidebar / expanded-rail row: icon + label inline. */
  const rowLink = (n: NavDef) => {
    const active = isActive(n);
    return (
      <Link
        key={n.to}
        to={n.to}
        aria-current={active ? "page" : undefined}
        className={cx(
          "pressable flex min-h-11 items-center gap-3 rounded-full px-3.5 text-body font-semibold",
          active ? "bg-primary-tint text-on-glass-primary" : "text-fg hover:bg-fill",
        )}
      >
        <Icon name={n.icon} className="size-5.5" />
        <span className="min-w-0 flex-1 truncate">{t(n.labelKey)}</span>
        {n.to === "/conversations" ? <CountBadge count={unread} label={unreadLabel} /> : null}
      </Link>
    );
  };

  /** Collapsed rail / phone tab: icon above a small label. */
  const stackLink = (n: NavDef, variant: "rail" | "tab") => {
    const active = isActive(n);
    return (
      <Link
        key={n.to}
        to={n.to}
        aria-current={active ? "page" : undefined}
        className={cx(
          "pressable relative flex flex-col items-center justify-center gap-0.5 font-semibold",
          variant === "tab"
            ? "min-h-11 flex-1 rounded-full text-[0.6875rem]"
            : "min-h-15 w-full rounded-[1.25rem] text-caption",
          active ? "bg-primary-tint/90 text-on-glass-primary" : "text-on-glass-muted hover:text-fg",
        )}
      >
        <span className="relative">
          <Icon name={n.icon} className="size-6" strokeWidth={active ? 2 : 1.75} />
          {n.to === "/conversations" ? (
            <CountBadge
              count={unread}
              label={unreadLabel}
              className="absolute -top-1.5 -right-3 h-4.5 min-w-4.5 px-1"
            />
          ) : null}
        </span>
        <span>{t(n.labelKey)}</span>
      </Link>
    );
  };

  const logo = (withWord: boolean) => (
    <Link
      to="/"
      aria-label={withWord ? undefined : "RETURN"}
      className="flex min-h-11 min-w-11 items-center justify-center gap-2.5 rounded-full text-headline font-bold tracking-[0.14em] text-primary-text"
    >
      <Logo />
      {withWord ? <span>RETURN</span> : null}
    </Link>
  );

  return (
    <div
      data-rail={railExpanded ? "expanded" : "collapsed"}
      className="min-h-dvh data-[rail=expanded]:[--rail-w:14.5rem]"
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-fg"
      >
        {t("nav.skip")}
      </a>

      {/* Desktop: floating glass sidebar */}
      <aside className="glass-strong no-print fixed top-3 bottom-3 left-3 z-40 hidden w-[var(--sidebar-w)] flex-col gap-5 rounded-sheet p-3 lg:flex">
        <div className="px-2 pt-1">{logo(true)}</div>
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-haspopup="dialog"
          className="pressable specular flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 font-semibold text-primary-fg hover:bg-primary-hover"
        >
          <Icon name="plus" className="size-5" />
          {t("common.new")}
        </button>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
          {NAV.map(rowLink)}
        </nav>
        <div className="mt-auto px-1 pb-1">
          <AppearanceControl block />
        </div>
      </aside>

      {/* Tablet: floating glass nav rail (collapsible) */}
      <aside
        className={cx(
          "glass no-print fixed top-3 bottom-3 z-40 hidden w-[var(--rail-w)] flex-col gap-4 rounded-sheet p-2.5 sm:flex lg:hidden",
          "left-[max(0.75rem,env(safe-area-inset-left))]",
        )}
      >
        <div className={cx("flex", railExpanded ? "px-1.5" : "justify-center")}>{logo(railExpanded)}</div>
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-haspopup="dialog"
          aria-label={railExpanded ? undefined : quickLabel}
          title={quickLabel}
          className={cx(
            "pressable specular flex min-h-12 items-center justify-center gap-2 self-center rounded-full bg-primary font-semibold text-primary-fg hover:bg-primary-hover",
            railExpanded ? "w-full px-4" : "size-12",
          )}
        >
          <Icon name="plus" className="size-6" />
          {railExpanded ? t("common.new") : null}
        </button>
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
          {NAV.map((n) => (railExpanded ? rowLink(n) : stackLink(n, "rail")))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          {railExpanded ? (
            <AppearanceControl block />
          ) : (
            <button
              type="button"
              onClick={() => setAppearanceOpen(true)}
              aria-haspopup="dialog"
              aria-label={t("theme.appearance")}
              title={t("theme.appearance")}
              className="pressable mx-auto inline-flex size-11 items-center justify-center rounded-full text-on-glass-muted hover:bg-fill hover:text-fg"
            >
              <Icon name="sun" />
            </button>
          )}
          <button
            type="button"
            onClick={toggleRail}
            aria-expanded={railExpanded}
            aria-label={t(railExpanded ? "nav.collapse" : "nav.expand")}
            title={t(railExpanded ? "nav.collapse" : "nav.expand")}
            className={cx(
              "pressable inline-flex min-h-11 items-center gap-3 rounded-full text-subhead font-semibold text-on-glass-muted hover:bg-fill hover:text-fg",
              railExpanded ? "px-3.5" : "mx-auto size-11 justify-center",
            )}
          >
            <Icon name="sidebar" />
            {railExpanded ? t("nav.collapse") : null}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col sm:pl-[calc(var(--rail-w)+0.75rem)] lg:pl-[calc(var(--sidebar-w)+0.75rem)]">
        {/* Compact glass header: logo on phones at rest, page title once the large title scrolls away. */}
        <header
          data-collapsed={chrome.collapsed ? "true" : "false"}
          className={cx(
            "chrome-header no-print z-30 flex h-[calc(3.25rem+env(safe-area-inset-top))] items-end transition-[background-color,box-shadow] duration-200",
            "sticky top-0 max-sm:px-[max(var(--page-x),env(safe-area-inset-right))]",
            "sm:pointer-events-none sm:fixed sm:inset-x-0 sm:top-0 sm:pl-[calc(var(--rail-w)+0.75rem)] lg:pl-[calc(var(--sidebar-w)+0.75rem)]",
            chrome.scrolled ? "glass-bar" : "bg-transparent",
            !chrome.collapsed && "sm:invisible",
          )}
        >
          <div className="relative flex h-13 w-full items-center justify-between gap-3 sm:justify-center">
            <div className={cx("sm:hidden", chrome.collapsed && "max-sm:invisible")}>{logo(true)}</div>
            <p
              aria-hidden="true"
              className="chrome-title pointer-events-none absolute inset-x-14 truncate text-center text-headline font-semibold sm:static"
            >
              {chrome.title}
            </p>
            <button
              type="button"
              onClick={() => setAppearanceOpen(true)}
              aria-haspopup="dialog"
              aria-label={t("theme.appearance")}
              title={t("theme.appearance")}
              className="pressable inline-flex size-11 items-center justify-center rounded-full text-on-glass-muted hover:bg-fill hover:text-fg sm:hidden"
            >
              <Icon name="sun" />
            </button>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-page flex-1 px-page-x pt-3 pb-[calc(var(--shell-bottom)+2rem)] outline-none sm:pt-10 sm:pb-16 lg:pt-12"
        >
          {children}
        </main>
      </div>

      {/* Phone: floating capsule tab bar + floating create button, in thumb reach. */}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-end gap-2.5 px-[max(0.75rem,env(safe-area-inset-left))] sm:hidden">
        <nav
          aria-label={t("nav.main")}
          className="glass pointer-events-auto flex h-[var(--tabbar-h)] min-w-0 flex-1 items-stretch gap-0.5 rounded-full p-1"
        >
          {NAV.map((n) => stackLink(n, "tab"))}
        </nav>
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          aria-haspopup="dialog"
          aria-label={quickLabel}
          className="pressable specular pointer-events-auto inline-flex size-[var(--tabbar-h)] shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg hover:bg-primary-hover"
        >
          <Icon name="plus" className="size-7" strokeWidth={2} />
        </button>
      </div>

      <QuickActionsSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
      <QuickCardHost />
      <AppearanceSheet open={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
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
