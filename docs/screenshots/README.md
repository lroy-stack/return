# Screenshots

The images used in the main README. They are generated, not hand-made, so they stay in step with the UI.

All data is fictional: a traveller called "Alex", invented items, finders ("Sam", "Kim") and places, and
`example.org` addresses. Nothing comes from a real deployment.

## Regenerate

```bash
pnpm screenshots
```

This starts its own dev server on port 5196 with a fresh local state directory (`.wrangler/screens`, wiped on every
run), seeds the demo data through the owner API and the real finder forms, and writes page-only WebP files here
(2x pixel ratio). It never touches the `pnpm dev` or `pnpm test:e2e` databases and is not part of `pnpm test:e2e`.

Requirements: the same as the e2e suite (`.dev.vars` copied from `.dev.vars.example`, and internet access, because
the finder contact form uses Cloudflare's Turnstile test keys). The script is `e2e/screenshots.capture.ts`.

## Files

| File | Viewport | Theme |
|---|---|---|
| `finder-tag-page-light.webp` | phone 375x812 | light |
| `finder-conversation-dark.webp` | phone 375x812 | dark |
| `owner-inventory-light.webp` | desktop 1440x900 | light |
| `owner-item-recovery-dark.webp` | desktop 1440x900 | dark |
| `owner-inbox-thread-light.webp` | desktop 1440x900 | light |
| `owner-quick-card-light.webp` | desktop 1440x900 | light |
| `owner-inventory-phone-dark.webp` | phone 375x812 | dark |
| `owner-settings-privacy-light.webp` | tablet 768x1024 | light |

The quick card preview carries a "PROOF" watermark because the local address is not a public https address. That is
the app working as designed.
