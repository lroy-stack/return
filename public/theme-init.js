/*
 * Blocking head script (src/app/lib/theme.ts is the runtime counterpart): applies the stored Light/Dark choice before
 * first paint so the panel never flashes the wrong theme, and points <meta name="theme-color"> at it so the browser
 * chrome matches. Same-origin file because the panel CSP allows `script-src 'self'` only. Keep the two colours in
 * sync with --surface in src/app/styles.css and with THEME_COLORS in src/app/lib/theme.ts.
 */
try {
  const choice = window.localStorage.getItem("return.theme");
  if (choice === "light" || choice === "dark") {
    document.documentElement.setAttribute("data-theme", choice);
    const color = choice === "dark" ? "#0F1719" : "#FAF7F2";
    for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
      meta.setAttribute("content", color);
  }
} catch {
  // Storage blocked: the OS preference decides, exactly as before.
}
