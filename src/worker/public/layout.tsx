import type { Child } from "hono/jsx";
import { LANGUAGES, type Language } from "../../shared/settings";
import { dict, LANGUAGE_NAMES } from "./i18n";

export interface LayoutProps {
  lang: Language;
  title: string;
  children?: Child;
  /** Show the language switcher (links back to the same page with ?lang=). */
  switcher?: boolean;
  /** Load the Turnstile widget script (pages with the contact form). */
  turnstile?: boolean;
  /** Page-specific scripts (served from /p/), loaded after the shared public.js. */
  scripts?: string[];
  /** "chat": the page fills the viewport (thread scrolls, composer stays at the bottom) and drops the footer. */
  variant?: "chat";
}

export function Layout({
  lang,
  title,
  children,
  switcher = true,
  turnstile = false,
  scripts = [],
  variant,
}: LayoutProps) {
  const t = dict(lang);
  return (
    <html lang={lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#FAF7F2" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0F1719" media="(prefers-color-scheme: dark)" />
        <meta name="robots" content="noindex, nofollow, noarchive" />
        <meta name="color-scheme" content="light dark" />
        <title>{title}</title>
        <link rel="stylesheet" href="/p/public.css" />
        <script src="/p/public.js" defer />
        {scripts.map((src) => (
          <script key={src} src={src} defer />
        ))}
        {turnstile ? (
          <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
        ) : null}
      </head>
      <body class={variant === "chat" ? "is-chat" : undefined}>
        <a class="skip" href="#content">
          {t.common.skipLink}
        </a>
        <header class="topbar">
          <span class="brand">RETURN</span>
          {switcher ? (
            <nav aria-label={t.common.language} class="langs">
              {LANGUAGES.map((l) => (
                <a
                  key={l}
                  href={`?lang=${l}`}
                  hreflang={l}
                  lang={l}
                  aria-current={l === lang ? "true" : undefined}
                >
                  {LANGUAGE_NAMES[l]}
                </a>
              ))}
            </nav>
          ) : null}
        </header>
        <main id="content" class="page">
          {children}
        </main>
        {variant === "chat" ? null : (
          <footer class="footer">
            <p>{t.common.tagline}</p>
            <p>
              <a class="footer-link" href={`/privacy?lang=${lang}`}>
                {t.common.privacy}
              </a>
            </p>
          </footer>
        )}
      </body>
    </html>
  );
}

/** Full HTML document for a page component. */
export async function renderPage(node: { toString(): string | Promise<string> }): Promise<string> {
  return `<!DOCTYPE html>${await node.toString()}`;
}
