# RETURN — lost-item recovery with QR/NFC tags

**Live:** https://return.lr0y.dev

RETURN is a personal inventory of belongings with QR/NFC tags, built in October 2026. A tag on an item links to a
public page where whoever finds the item can message the owner, optionally share where they found it, and agree a
return. The finder needs no account and no app. Privacy is the main constraint: a stranger must be able to reach
the owner quickly, and nobody but the owner can see the inventory, other conversations or documents.

It is single-owner and self-hosted on your own Cloudflare account. It is not a SaaS and there is no shared instance
to sign up to.

## What it does

- Finder pages (`/t/<token>`) in English, German and Spanish: public card plus one chat timeline with live refresh
  and optional location sharing. First contact is protected by Cloudflare Turnstile and rate limits.
- Owner panel on a separate host behind Cloudflare Access: items, tags, conversations, return plans, recoveries,
  settings.
- Printable cards (CR80 with bleed and trim marks) and a quick paper card as PNG or PDF.
- Place names for shared coordinates via OpenStreetMap Nominatim.
- Email alerts and Web Push to the owner. Push payloads carry no message content.
- Installable owner PWA; the service worker never caches private data.
- Planned: proof photos shared with one finder through revocable, time-limited grants (ADR 0006).

## Built with

TypeScript, Hono, Cloudflare Workers with Static Assets, React 19, Vite, Tailwind 4, D1 (SQLite), R2, Cloudflare
Access and Turnstile, zod, Vitest and Playwright. Versions are pinned in `package.json`.

## Run it locally

Requires Node 24 (`.node-version`) and pnpm.

```bash
pnpm install
cp .dev.vars.example .dev.vars    # local secrets, git-ignored
pnpm db:migrate:local
pnpm dev                          # panel at http://localhost:5173, tag pages at /t/<token>
```

Checks: `pnpm lint && pnpm typecheck && pnpm test`, and `pnpm test:e2e` for Playwright. Deploying your own
instance (D1, R2, Access, Turnstile, secrets, `wrangler.jsonc` from `wrangler.example.jsonc`, then
`pnpm run release --migrate`) is described in `docs/operations.md`.

## Layout

```
src/        Worker (worker/), owner SPA (app/), shared schemas (shared/), service worker (sw/), icon sources (assets/)
public/     static files for the finder pages
migrations/ D1 SQL migrations
test/ e2e/  unit/integration tests (in workerd) and Playwright tests
scripts/    release guard, key generation, icon and backup helpers
docs/       decisions, security, operations, ADRs, specs
```

MIT licence.

---

Versión en español: inventario personal de objetos con etiquetas QR/NFC; quien encuentra un objeto escribe al
dueño sin cuenta ni app. Es de un solo dueño y se despliega en tu propia cuenta de Cloudflare (Workers, D1, R2).
