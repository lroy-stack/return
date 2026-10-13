# RETURN

Personal inventory and lost-item recovery. Each belonging can carry a QR/NFC card pointing to
`https://DOMAIN/t/<token>`. Whoever finds it can message the owner, optionally share where they found it,
and agree a return — no account, no app. The owner manages items, tags, conversations and settings in a
private panel at `https://app.DOMAIN` (Cloudflare Access).

## Run locally
```bash
fnm use                     # Node 24
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev                    # panel at http://localhost:5173, tag pages at /t/<token>
```
Locally the panel is reachable without Access (loopback-only dev bypass, see `src/worker/auth/access.ts`).

## Quality gates
```bash
pnpm lint && pnpm typecheck && pnpm test   # unit + integration in workerd
pnpm test:e2e                               # Playwright, mobile + desktop
```

## Docs
- `docs/decisions.md` — architecture decisions and verified facts
- `docs/security.md` — threat model
- `docs/operations.md` — deploy, configuration, backups, restore, degraded behaviour
- `docs/printing.md` — card production and printers
- `docs/plan.md` — build plan and progress
