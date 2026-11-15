# Roadmap — Systematische Weiterentwicklung (Stand: 15.11.2026, Branch arena/b2c454a8)

Recherche-Grundlagen (Oktober–November 2026):

- **x402:** V12-Disclosure (25 Findings, 22.10.2026), 3 kritische (kein Default-Spend-Limit → `@x402/core/fetch/axios` 2.23.0; Solana-ApproveChecked-as-TransferChecked → `@x402/svm` 2.23.0 [betroffen 2.0.0–2.22.0, TS-Facilitator 2.0–2.22]; SIWx-Login-Replay → `@x402/extensions/core` 2.23.0, py 2.20.0, go v2.23.0). Zusätzlich: Payment-Bypass `@x402/core` <2.27.0 (Fix 22.09.2026); PT-2026-118463 SIWX-Server-Auth-Bypass in `@x402/extensions` 2.3.1–2.28.0, py 2.11.0–2.25.0, go 2.16.0–2.28.0 (CVSS 6.5/6.9).
- **ERC-5564/6538:** Kanonische Deployments `0x55649E01…D45564` (Announcer) / `0x6538E6bf…5d6538` (Registry), u. a. Polygon/Scroll.
- **DAC8:** Datenerfassung läuft seit 01.01.2026 (erstes Meldejahr 2026), Filing-Fenster 01.01.–30.09.2027, Mitgliedstaaten heterogen.
- **ERC-7683:** Final; Filler Across/Eco/LI.FI/UniswapX/Symbiosis (Stand 2026).
- **RIP-7212:** finalisiert; live auf OP, Base, zkSync Era, Polygon zkEVM, Linea, Scroll (~3.450 vs. ~200–300k Gas).
- **EIP-7702:** Sweeper-Familie (97 % schädlicher Delegations via CrimeEnjoyor-Pattern), chain_id=0-Replay, ERC-7730-Clear-Signing als Gegenmaßnahme, Blocklist-Trend.

## Wave 1 — Inhalte & Logik (Priorität A)

1. [x] x402-Advisory-Matrix auf 2026er-Stand aktualisieren (V12-Findings, 2.27.0-Bypass, PT-2026-118463) + Versionstabelle in Tests festnageln
2. [x] StealthAudit: Offizielle Announcer- (`0x5564…5564`) und Registry-Adressen (`0x6538…6538`) einpflegen + Hinweistext
3. [x] DAC8-SelfProof: Timeline-Text (Meldejahr 2026, Filing 1.1.–30.9.2027) präzisieren
4. [x] IntentLens: Bekannte-Filler-Hinweis (Across/Eco/LI.FI/UniswapX/Symbiosis) in den Details
5. [x] PasskeyContinuity: RIP-7212-Chainliste (OP, Base, zkSync Era, Polygon zkEVM, Linea, Scroll) als statische Referenztabelle + Hinweis on-chain-Check
6. [x] SlotGuard: chain_id=0-Replay-Warnung + CrimeEnjoyor-Pattern-Hinweis in der Ergebnis-Deutung

## Wave 2 — Technik/Qualität

7. [x] Tests in CI gesichert: verify-demos als npm-Script `test:demos`, audit-dist als `audit`
8. [x] CSP verschärfen — **bewertet, bewusst nicht umgesetzt**: Die Inline-Skripte (DE|EN-Toggle, Island-Hydration, JSON-LD) erfordern Hashes oder Nonces; statische Astro-Inlines mit Hash-Management ist fragil. Risiko begrenzt durch `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, no-referrer. Entscheidung dokumentiert.
9. [x] prefetch-Hinweise (Astro prefetch) für Tool-Karten-Hover auf Landing
10. [x] Demo-Regression um SlotGuard-Offline-Storage-Dump-Logik & x402 py/go-Lockfile-Pfade erweitern

## Wave 3 — Dokumentation

11. [x] CHANGELOG.md initialisieren
12. [x] README um Test-/Audit-Kommandos erweitern (npm scripts)
13. [x] llms.txt um x402-Current-Advisory-Stand ergänzen

Ausgeschlossen bewusst: Astro 7.x (Engines Node ≥22.23.4 — Sandbox hat 22.22.3), Playwright-E2E (Browser-Download blockiert), Server-Komponenten.
