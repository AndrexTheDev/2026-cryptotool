# Changelog

## 2026-11-15 — Wave 6: BIP-322 „Complete“ (v1.0.0/v2.0.0) in DAC8-SelfProof

- **BIP-322 Finale beruecksichtigt**: Der BIP wurde am 15.04.2026 auf „Complete“ gehoben — mit Breaking Changes: menschenlesbare Praefixe `smp`/`ful`/`pof`, direkt dem Base64 vorangestellt (kein Trennzeichen), Backward-Compat-Klausel (ohne Praefix = simple). bip322-js 4.0.1 versteht die Praefixe nicht; Erkennung + Abstreifen jetzt in `lib/bip322.ts` (`classifyBip322Signature`).
- **Proof-of-Funds (pof)**: finalisiertes PSBT wird offline inspektiert (`inspectPofPsbt`): Eingabezahl, PSBT_GLOBAL_GENERIC_SIGNED_MESSAGE (0x09) und Challenge-Uebereinstimmung — mit explizitem Hinweis, dass der Unspent-Status onchain zu pruefen ist.
- Demo-Signer erzeugt jetzt `smp`-praefigierte Signaturen (Spec-konform); Verifier akzeptiert weiterhin Legacy ohne Praefix (Regression abgesichert).
- Negativ-Befund notiert: Bitcoin Core v30-Standardness-Aenderungen (datacarriersize 83 → 100.000, mehrere OP_RETURN-Ausgaben) betreffen nur Relais-Policy, keine Konsensregeln — BitVaultStress benoetigt keine Aenderung.
- Demo-Regression: 104 Checks.

## 2026-11-15 — Wave 5: Safe v1.5.0-Registry + Contenthash-Referenzvektoren

- **STVA (Safe Upgrade Diff)**: Kanonische Safe-Singleton-Registry aus `safe-global/safe-deployments` eingebettet — v1.3.0 (canonical/eip155), v1.4.1, v1.5.0 inkl. SafeL2- und SafeMigration-Varianten (9 Adressen, upstream verifiziert). Ziel-Implementierungen von Upgrade-Transaktionen werden gegen die Registry geprueft: Treffer mit Version-Badge, Nicht-Treffer mit Supply-Chain-Warnung in den Annahmen. Bei erkanntem Singleton < v1.5.0 Hinweis auf die offizielle Upgrade-Empfehlung (Safe-Blog 22.09.2026: Module-Guard-Pflicht, Fehler-Rueckgabe, ERC-1271).
- Demo-Flow zielt jetzt realistisch auf SafeL2 v1.5.0; Argument-Namen `implementation`/`masterCopy`/`singleton` werden neben `newImplementation` aufgeloest.
- **Contenthash-Regression auf Spezifikationsvektoren gehärtet**: EIP-1577-Beispielvektor und CIDv0-Pfad werden exakt gegen multiformats- bzw. content-hash-Referenzausgaben geprueft (`bafybeibj6…r7d4`, `QmbFMke1…xQDi`). Deckt die Varint-Verwechslung der Bug-Klasse walletbeat#1330 ab.
- age-encryption 0.3.1 gegen npm bestaetigt (aktuell, kein Handlungsbedarf).
- Demo-Regression: 94 Checks.

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
