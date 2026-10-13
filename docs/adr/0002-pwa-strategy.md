# 0002. Ship two origin-scoped PWAs with hand-written service workers that never cache private data

- Status: accepted (2026-10-13, owner)
- Date: 2026-10-13
- Deciders: owner (lr0y); proposed by the architect agent

Markers: **[verified]** = read in official docs on 2026-10-13 · **[unverified]** = secondary source or needs a device test.

## Context
- One Worker serves two origins: `app.return.lr0y.dev` (owner SPA + `/api`, whole host behind Cloudflare Access,
  JWT verified in `auth/access.ts`) and `return.lr0y.dev` (server-rendered finder pages, capability URLs `/t/<tag>`
  and `/c/<finder token>`, `Cache-Control: no-store`, strict CSP `script-src 'self'`). Hashed SPA bundles under
  `/assets/*` and finder statics under `/p/*` skip the Worker (`run_worker_first`). The app host already 308-redirects
  `/t/*` and `/c/*` to the public host.
- The owner wants both audiences to be able to "save it on the phone". Web Push on iOS works only for Home Screen web
  apps (iOS 16.4+, manifest `display` `standalone`/`fullscreen`, permission only from a user gesture) **[verified]**,
  so the owner PWA is also the prerequisite for iPhone push (ADR 0003).
- iOS 26: every site added to the Home Screen opens as a web app by default; manifests still apply **[verified]**.
  Home Screen web apps on iOS have cookies and storage separate from Safari; only cookies are copied when the web app
  is created **[unverified for iOS; Apple session notes]**. Out-of-scope redirect logins (OAuth-style) in standalone
  mode are a long-standing source of login loops **[unverified; developer reports]**.
- Chrome's install criteria: `name`/`short_name`, 192 px and 512 px icons, `start_url`, `display`, HTTPS **[verified,
  page dated 2024-09]**. If `start_url` is omitted, the URL of the page that links the manifest is used **[verified]**;
  a fragment in the app `id` is ignored **[verified]**; whether the default start URL keeps the fragment is
  **[unverified]**.
- `<link rel="manifest">` is fetched without cookies unless `crossorigin="use-credentials"`; behind Access the manifest
  and service-worker script can receive the login redirect instead **[unverified; community report]**. Access
  sessions can last up to one month (default 24 h); logout is `/cdn-cgi/access/logout`; a more specific Access path
  application takes precedence over the host application **[verified]**.
- Safari deletes script-writable storage after 7 days of use without interaction with the site; Home Screen web apps
  have their own counter **[unverified; WebKit 2020 policy]**.
- The codebase deliberately keeps dependencies few (in-house router, hand-written `public/p/public.js`).

## Options considered
1. **vite-plugin-pwa / Workbox** — generated precache, update hooks. Cons: a dependency chain for ~150 lines of logic,
   Vite 8 compatibility unverified, the finder SW lives outside the SPA build anyway, and the "never cache private
   responses" rule becomes implicit configuration. Reversal: cheap.
2. **Hand-written service workers, one per origin, with a pure routing function** — few deps, explicit and unit-testable
   security rules. Cons: we own precache/update edge cases. Reversal: cheap (self-unregistering SW).
3. **Manifest only, no service worker** — simplest; iOS 26 installs anyway and Declarative Web Push needs no SW on
   iOS 18.4+ **[verified]**. Cons: no push on Chrome/Firefox (they need a SW push handler), no offline shell, no update
   control. Reversal: trivial.
4. **One PWA for both audiences on one origin** — rejected: the origin is the security boundary between the
   Access-protected owner and anonymous finders (storage, cookies, SW scope, push subscriptions).

## Decision
Option 2. Two PWAs, one per origin, each with its own manifest and hand-written service worker. **Deciding factor:**
the rule "private responses are never stored in Cache Storage" must be explicit code with a unit test, not plugin
configuration; the logic is small enough to own.

### Owner PWA (`app.return.lr0y.dev`)
| Item | Decision |
|---|---|
| Manifest | `/manifest.webmanifest`: `id` `/`, `start_url` `/`, `scope` `/`, `display` `standalone`, name/short_name `RETURN`, theme/background colours from the design tokens, PNG icons 192, 512, maskable 512; `apple-touch-icon` 180 in `index.html`. Linked with `crossorigin="use-credentials"`. |
| Service worker | `/sw.js`, scope `/`, registered with `updateViaCache: 'none'`. Emitted at build time by a small Vite plugin that injects `BUILD_ID` and the precache list (the emitted `/assets/*` files + `/index.html` + icons). |
| Routing (pure `strategyFor(request)`, unit-tested) | `/api/*`, `/cdn-cgi/*`, any non-GET → **passthrough** (no `respondWith`, nothing stored). Navigations → network-first (4 s timeout) → cached `/index.html`; redirect responses (Access login) are passed through and never cached. `/assets/*`, icons, manifest → cache-first from the build's precache. Everything else → passthrough. |
| Offline | The shell renders; API calls fail as `network` (`ApiRequestError.isNetwork`) and pages show the existing error state with an "offline" message. No offline data in v1. |
| Updates | The new SW installs and waits. The panel shows a toast "Update ready · Reload" (existing `Toast` action) → `SKIP_WAITING` → reload on `controllerchange`. Cache `return-app-<BUILD_ID>`; older caches deleted on activate. If `/api/system` reports a different major contract version than the bundle, prompt a reload. |
| Rollback | A `sw.js` that unregisters itself and deletes its caches (kill switch), documented in operations. |
| Sign out | Unsubscribe this device's push subscription, delete caches (and local E2EE material only if the owner ticks "Forget this device", ADR 0004), then navigate to `/cdn-cgi/access/logout`. |
| Access | Panel application session duration **30 days** (from 24 h): an installed app used rarely must not demand a login at the moment an item is found. If spike S1 shows that the manifest, `sw.js` or icons still receive the Access redirect, add path-specific Access applications with a *Bypass* policy for exactly `/manifest.webmanifest`, `/sw.js`, `/icons/*` (public, non-sensitive files); `/`, `/assets/*` and `/api/*` stay protected and the Worker keeps verifying the JWT on `/api`. |
| iOS login fallback ladder (if S1 fails) | (a) Log in in Safari first, then Add to Home Screen (cookie copied at creation) — acceptable for a 30-day session; (b) the installed panel authenticates as a paired device against the API host (ADR 0005) with CORS limited to the app origin. |

### Finder PWA (`return.lr0y.dev`)
| Item | Decision |
|---|---|
| Where | Only conversation pages `/c/*` link a manifest. Tag pages `/t/*` are never installable. |
| Manifest | Static `/p/finder.webmanifest`: name `RETURN` (never the item name), `scope` `/c/`, `display` `standalone`, icons under `/p/icons/`; **no `start_url`**, so it defaults to the page URL, including the `#k=` key fragment from ADR 0004; the derived `id` (fragment ignored) makes each conversation its own app. |
| Fallback (if spike S2 shows the fragment is dropped or Chrome refuses an implicit `start_url`) | The Worker serves `/c/<token>/manifest.webmanifest` with `start_url` `/c/<token>` (no key). On first launch, the installed app asks once for the full private link and keeps it in its own storage. |
| Service worker | `/p/finder-sw.js`, registered with scope `/c/`, allowed by `Service-Worker-Allowed: /c/` in `public/_headers`. `skipWaiting` + `clients.claim` immediately (pages are server-rendered; there is no SPA state to keep consistent). |
| Routing (pure, unit-tested) | Navigations under `/c/` → **network-only**; on network failure → the cached offline page (the existing static `/p/emergency.html`, extended with an "you are offline, reopen this when connected" line). `/c/*/state.json`, entry endpoints, form posts → passthrough, never stored. `/p/*` → network-first with cache fallback (file names are not hashed). |
| Reopen semantics | The Home Screen icon reopens the exact private link. Online → live conversation; offline → offline page with the printed-email advice. No outbox, no persisted drafts, no cached conversation HTML or messages on the finder's device (it may be borrowed or shared). |
| Install UX | After the finder's first message, a dismissible card on `/c/*`: "Keep this conversation on your phone". iOS: Share › Add to Home Screen steps (iOS 26 opens it as a web app by default). Chromium: a button wired to `beforeinstallprompt`. "Copy private link" stays the primary way to keep the conversation. |
| CSP | Unchanged: `default-src 'self'` already covers `manifest-src` and `worker-src`; `connect-src 'self'`. |

### Scope separation
Different origins give separate service workers, Cache Storage, IndexedDB/localStorage, cookies and push
subscriptions. The owner SW cannot control finder URLs (different origin, and `/t`, `/c` on the app host are
redirects). The finder SW is limited to `/c/`, so the tag page and `/privacy` are never served from a cache.

## Consequences
- Easier: phone-first use for the owner, iPhone push becomes possible (ADR 0003), finders get a one-tap way back to
  their conversation and, later, finder push.
- Harder: two service workers to keep correct; Access configuration gains a session-length change and possibly three
  bypass paths; device testing on iOS and Android becomes part of release checks for SW changes.
- Tests: unit tests for both `strategyFor` functions (every `/api/*` and `/c/*` case returns passthrough or
  network-only); Playwright: SW registers, offline navigation shows the shell/offline page, and after a session
  `caches.keys()`/`cache.keys()` contain no `/api/` or `/c/` URL.
- Watch: Access redirects seen by the SW (log a client-side counter), install/update failures reported by the panel,
  iOS behaviour after OS updates (re-run spikes S1/S2 after each major iOS release).
- Spikes before building: **S1** (riskiest) install the panel on an iPhone with iOS 26, log in with Access OTP inside
  the standalone app, relaunch after 24 h, confirm the manifest and `sw.js` load; **S2** on iOS 26 and Android Chrome,
  confirm that installing `/c/<token>#k=…` with a `start_url`-less manifest relaunches with the fragment.

## Sources
- WebKit, Web Push for Web Apps on iOS and iPadOS — https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- WebKit, News from WWDC25 (Home Screen web apps by default in iOS 26) — https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/
- WebKit, Meet Declarative Web Push — https://webkit.org/blog/16535/meet-declarative-web-push/
- WWDC23 "What's new in web apps" notes (separate storage, cookie copy) — https://wwdcnotes.com/documentation/wwdc23-10120-whats-new-in-web-apps/
- web.dev, What does it take to be installable? — https://web.dev/articles/install-criteria
- MDN, `start_url` — https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url
- MDN, `id` — https://developer.mozilla.org/en-US/docs/Web/Manifest/id
- Cloudflare Access, session management — https://developers.cloudflare.com/cloudflare-one/identity/users/session-management/
- Cloudflare Access, application paths — https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/
- Manifest behind Access needs `crossorigin="use-credentials"` (community report) — https://community.silverbullet.md/t/sync-failures-with-cloudflare/2038
- Safari 7-day script-writable storage cap, Home Screen counter (summary of the WebKit post) — https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/
