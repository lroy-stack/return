# Security policy

## Reporting a vulnerability

Please report security issues privately. Do not open a public GitHub issue, pull request or discussion for a
vulnerability.

Use GitHub private vulnerability reporting for this repository:

1. Open the **Security** tab of `lroy-stack/return-app`.
2. Choose **Report a vulnerability** (Security Advisories).
3. Describe the issue, the affected file or endpoint, steps to reproduce, and the impact you expect.

Include a proof of concept only where it is needed to reproduce the issue, and keep it to your own test data.

We aim to acknowledge a report within 7 days and to agree a fix and disclosure timeline with you after triage.
This is a personal project maintained by one person, so these targets are best effort.

## Scope

In scope:

- The code in this repository: the Worker (`src/worker/`), the owner panel (`src/app/`), the shared code
  (`src/shared/`), the service worker (`src/sw/`), migrations, and the scripts.
- Configuration in this repository that would be unsafe for anyone who deploys it (for example, a header or
  CSP that is missing or wrong in a template).

Out of scope:

- The author's live deployment (`return.lr0y.dev`, `app.return.lr0y.dev`). You may check that it is up and that
  the controls described below hold, but do not:
  - run load, flood, fuzz or scanning tests that disrupt the service or consume its quotas;
  - attempt social engineering, phishing or physical attacks against the author or anyone else;
  - access, modify or delete data that belongs to other people, or try to read another person's conversations,
    items or files;
  - test a Cloudflare account, Access policy or email address that is not your own.
- Denial of service through volume alone, rate-limit bypass that only shows the limit is approximate, and
  reports about missing features.
- Findings in third-party services (Cloudflare, OpenStreetMap Nominatim, Turnstile) that should go to their
  vendors.
- Issues that require control of the owner's Cloudflare account or their device. These are listed as accepted
  residual risks in `docs/security.md`.

If you are unsure whether something is in scope, report it privately and ask.

## Security model in brief

The full threat model, the mitigations and the verifying tests are in [`docs/security.md`](docs/security.md).
In summary:

- **Owner surface.** The panel and `/api` run on a separate host protected by Cloudflare Access. The Worker
  verifies the Access JWT (signature, issuer, audience, expiry) and an owner allowlist. Client headers are never
  trusted.
- **Finder surface.** A tag URL is a capability to see the public card and start one conversation. Tag tokens are
  128-bit random values. Finder conversation access uses a 256-bit token, of which only the SHA-256 hash is stored.
- **Isolation.** Every owner query is scoped to the owner. Foreign or missing resources return 404.
- **Private files.** Files live in a private R2 bucket and are served only through authenticated routes. Uploads
  are re-encoded, and metadata such as EXIF and GPS is removed server-side.
- **Web surface.** Public pages use a strict Content Security Policy. Templates escape output by default.
  State-changing requests require a same-origin `Origin` header.
- **Anti-abuse.** Turnstile on first contact, rate limits per IP, and caps per tag and per conversation.

## Secrets

No secrets are stored in this repository. Real values live only in:

- Cloudflare Worker secrets, set with `wrangler secret put`;
- a local `.dev.vars` file for development, which is git-ignored.

`.dev.vars.example` lists the variable names with placeholder values. Do not commit `.dev.vars`, `.env` files or
private keys (for example `vapid-private.key`). If you find a secret in the repository history, report it
privately as described above.
