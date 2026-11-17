# Roadmap — Systematic Evolution (status: 17.11.2026)

## Open follow-ups

- [ ] **Astro bump ≥ 7.4.7** (clears GHSA-mh32-jxcr-mh9f XSS low + GHSA-r3h5-4585-7x3w @astrojs/node medium): blocked in this sandbox — 7.4.2+ requires Node ≥ 22.23.4, we have 22.22.3. Neither advisory is reachable here (static output, no adapter, no dynamic tags). Re-attempt when the environment provides Node ≥ 22.23.4.
- [ ] **picomatch ReDoS (GHSA-fc5q-39xc-vjpf / CVE-2026-112366, high):** no patched release exists yet (fix PR merged, unpublished). ReDoS needs attacker-controlled extglob patterns; only our own build config globs are used — not exploitable. Re-audit once picomatch > 4.0.7 ships; it propagates via fdir/tinyglobby/vite/astro (build-time only).
- [ ] **typescript 7.x** (native Go port, changed build/tooling behavior): assess only after the Astro/Node lift (wave-9/14 decision).

## Waves 1–3 (completed, Nov 2026)

Research bases (October–November 2026):

- **x402:** V12 disclosure (25 findings, 22.10.2026), 3 critical (no default spend limit → `@x402/core/fetch/axios` 2.23.0; Solana ApproveChecked-as-TransferChecked → `@x402/svm` 2.23.0 [affected 2.0.0–2.22.0, TS facilitator 2.0–2.22]; SIWx login replay → `@x402/extensions/core` 2.23.0, py 2.20.0, go v2.23.0). Additionally: payment bypass `@x402/core` <2.27.0 (fix 22.09.2026); PT-2026-118463 SIWX server auth bypass in `@x402/extensions` 2.3.1–2.28.0, py 2.11.0–2.25.0, go 2.16.0–2.28.0 (CVSS 6.5/6.9).
- **ERC-5564/6538:** canonical deployments `0x55649E01…D45564` (announcer) / `0x6538E6bf…5d6538` (registry), incl. Polygon/Scroll.
- **DAC8:** data collection running since 01.01.2026 (first reporting year 2026), filing window 01.01.–30.09.2027, member states heterogeneous.
- **ERC-7683:** final; fillers Across/Eco/LI.FI/UniswapX/Symbiosis (as of 2026).
- **RIP-7212:** finalized; live on OP, Base, zkSync Era, Polygon zkEVM, Linea, Scroll (~3,450 vs. ~200–300k gas).
- **EIP-7702:** sweeper family (97 % of malicious delegations via the CrimeEnjoyor pattern), chain_id=0 replay, ERC-7730 clear signing as a countermeasure, blocklist trend.

## Wave 1 — Content & logic (priority A)

1. [x] Update the x402 advisory matrix to the 2026 status (V12 findings, 2.27.0 bypass, PT-2026-118463) + pin the version table in tests
2. [x] StealthAudit: incorporate the official announcer (`0x5564…5564`) and registry addresses (`0x6538…6538`) + note text
3. [x] DAC8-SelfProof: refine the timeline text (reporting year 2026, filing 1.1.–30.9.2027)
4. [x] IntentLens: known-filler note (Across/Eco/LI.FI/UniswapX/Symbiosis) in the details
5. [x] PasskeyContinuity: RIP-7212 chain list (OP, Base, zkSync Era, Polygon zkEVM, Linea, Scroll) as a static reference table + on-chain check note
6. [x] SlotGuard: chain_id=0 replay warning + CrimeEnjoyor pattern note in the result interpretation

## Wave 2 — Technique/quality

7. [x] Tests secured in CI: verify-demos as npm script `test:demos`, audit-dist as `audit`
8. [x] Tighten CSP — **assessed, deliberately not implemented**: the inline scripts (hydration, JSON-LD) would require hashes or nonces; static Astro inlines with hash management are fragile. Risk limited by `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, no-referrer. Decision documented.
9. [x] prefetch hints (Astro prefetch) for tool-card hover on the landing page
10. [x] Extend the demo regression with SlotGuard offline storage dump logic & x402 py/go lockfile paths

## Wave 3 — Documentation

11. [x] Initialize CHANGELOG.md
12. [x] Extend README with test/audit commands (npm scripts)
13. [x] Extend llms.txt with the x402 current advisory status

Deliberately excluded: Astro 7.x (engines Node ≥22.23.4 — sandbox has 22.22.3), Playwright E2E (browser download blocked), server components.
