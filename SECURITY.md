# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not as a public issue:

- Email: **hippie.highho@gmail.com**
- Or via the repository's security advisory flow.

A machine-readable version of this policy lives at
[`.well-known/security.txt`](public/.well-known/security.txt) (RFC 9116),
served in the build at `/.well-known/security.txt`.

## Scope notes

- The suite is a **fully static, client-only** build: no server logic, no API
  routes, no server adapter, no accounts, no central data storage. All
  crypto/forensic logic runs in the browser.
- **Build-time tooling** (Astro, Vite, and their transitive deps such as
  picomatch/fdir/tinyglobby) is not part of the shipped bundle. Known
  advisories affecting only that tooling — and not reachable in the deployed
  static output — are tracked in the [ROADMAP](ROADMAP.md#open-follow-ups)
  rather than treated as live exposures.

## Supported versions

Only the latest state of `main` is maintained. Dependency security is gated in
CI by `npm run audit:deps` (production, critical severity) — see
[`.github/workflows/build-audit.yml`](.github/workflows/build-audit.yml).
