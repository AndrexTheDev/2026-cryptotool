# Changelog

## 2026-11-15 — Wave 4: ERC-4337 v0.8/v0.9 (UserOp-Autopsy)

- EntryPoint-Erkennung fuer alle vier kanonischen Singletons (v0.6 `0x5FF13…d2789`, v0.7 `0x0000…da032`, v0.8 `0x4337084D…Ff108`, v0.9 `0x43370900…D8d009`); Version-Badge pro Transaktion.
- v0.9-`IgnoredInitCode`-Event wird gesammelt und am Befund hervorgehoben (Fehldiagnose-Quelle: initCode wird still ignoriert, wenn der Sender existiert).
- Topic-Konstanten per keccak256-Signatur verifiziert und in der Demo-Regression festgenagelt (84 Checks insgesamt).

## 2026-11-15 — Recherche-Update (Arena-Branch b2c454a8)

**Inhalte (Recherche Okt/Nov 2026):**
- x402-Advisory-Matrix auf 10 Einträge erweitert: V12-Disclosure (25 Findings, 3 kritische — Default-Spend-Limit, Solana-ApproveChecked-Bypass, SIWx-Login-Replay; je Fix-Linie 2.23.0), separater Payment-Bypass `@x402/core` < 2.27.0, PT-2026-118463 (SIWX-Server-Auth-Bypass, npm/pip/go bis 2.28.0/2.25.0/2.28.0).
- StealthAudit: kanonische Announcer-Adresse korrigiert auf `0x55649E01B5Df198D18D95b5cc5051630cfD45564` (war falsch gepflegt), Registry-Referenz ergänzt, Referenzen-Accordion.
- SlotGuard: chainId-0-Replay-Warnung im Panic-Paket, Sweeper-Kontext (CrimeEnjoyor-Familie) im Befundtext.
- DAC8-SelfProof: Zeitkontext Meldejahr 2026 + Filing-Fenster 2027.
- IntentLens: Filler-Referenzrahmen (Across, Eco, LI.FI, UniswapX, Symbiosis).
- PasskeyContinuity: RIP-7212-Adoptionsliste + Kostenrahmen (~3.450 vs. 200–300k Gas).

**Technik:**
- `npm run verify` Gesamtpipeline; `npm run test:demos` 78 Checks (neu: x402-Schwellen-Lock-in, py/go-Lockfile-Parser, SlotGuard-Offline-Dump-Varianten).
- Astro Hover-Prefetch auf Tool-Karten (nur HTML).

## 2026-11-15 — Initial-Release (PR #1, gemergt als 8d67f2b)

- 10 Werkzeuge, statische Astro-6-SSG-App, React-Islands, Tailwind 4.
- Landing/Recht mit 0 KB JS, Route-Level Code-Splitting (viem/bitcoinjs/noble lazy).
- Policy-Audit (`scripts/audit-dist.mjs`), Demo-Regression, CI-Workflow, A11y (Focus-Trap, aria-live, reduced-motion, Skip-Link), BreadcrumbList/SoftwareApplication/FAQPage/WebSite/Person JSON-LD, sitemap/robots/llms.txt.
