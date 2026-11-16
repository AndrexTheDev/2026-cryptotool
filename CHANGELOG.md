# Changelog

## 2026-11-15 — Wave 10: Doku-Drift-Eliminierung

- **Drift-Lock-in (neu, selbstreferenziell):** der letzte Demo-Check prueft, dass die README exakt die aktuelle Check-Zahl nennt (inkl. seiner selbst) — Doku kann kuenftig nicht mehr hinter der Regression herhinken.
- README: 78-Check → 116-Check korrigiert.
- llms.txt auf Wellen 4–9 Synchronisationsstand gebracht: x402-Matrix jetzt mit 12 Eintraegen/2.31.0-Stand (inkl. 2026-10 zod/DoS und 2026-11 afterSettle), EntryPoint v0.6–v0.9-Erkennung samt IgnoredInitCode, Safe-Singleton-Registry ab v1.5.0, BIP-322-Complete-Praefixe PoF, FIDO CXF/CXP-Reifestufen, EF-Clear-Signing-Registry (ERC-7730/8176/8213).

## 2026-11-15 — Wave 9: Dependency-Hygiene & Currency-Audit

- **Fix (Session-Eigenbefund):** Wave-5-Commit 641b898 hatte die Referenz-Pakete `content-hash`/`multiformats` versehentlich als Produktions-Dependencies eingetragen (Scratch-Install-Seiteneffekt). Nichts importierte sie; beide entfernt, Lockfile neu. Hygiene-Lock-in in verify-demos: eben diese Pakete duerfen nie Projekt-Deps werden + Obergrenze 26 Deps.
- **Currency-Audit (npm, 15.11.2026):** 17/19 Deps aktuell (darunter viem 2.57.20, age-encryption 0.3.1, @noble/@scure 2.4.x, bip322-js 4.0.1). Bewusst NICHT geschwenkte Majors, je mit Begruendung:
  - `astro` 6.4.8 (7.4.12 draussen): Major-Sprung erfordert Migrationsreview (Integration-Vertraege React/Sitemap, Vite-8-Paarung) — kein Blindbump in einer Audit-Toolchain.
  - `@astrojs/react` 6.0.6 und `vite` 7.3.8: folgen der Astro-6/7-Paarung.
  - `typescript` 5.9.3 (7.0.2 draussen): TS7 ist der native Port (Go) mit geaendertem Build/Tooling-Verhalten — erst nach Astro-7-Aufzug bewerten.
  - `@astrojs/sitemap` ^3.6.0 resolved bereits auf 3.7.5 (Caret-Range nutzt Patch/Minor automatisch).

## 2026-11-15 — Wave 8: Passkey-Portabilität (FIDO CXF) + ERC-7715-Umbenennung

- **PasskeyContinuity**: Fuenfter Checklisten-Punkt `portability` — unterstuetzt der Credential-Manager einen Export? Kontext: FIDO CXF 1.0 (Credential Exchange Format) ist seit 14.08.2025 Proposed Standard (Errata 09.03.2026), das Transport-Protokoll CXP jedoch weiter Working Draft vom 03.10.2024 — halbe Portabilitaet: Export-Format genormt, Transport nicht. Beide Quellenlagen (FIDO-Spec-Directory, unabhaengige Analyse 07/2026) dokumentiert.
- **X402PaywallGuard**: ERC-7715-Methodenumbenennung im Draft beruecksichtigt — `wallet_requestExecutionPermissions` (Draft-Stand 09/2026) neben historischem `wallet_grantPermissions` (MetaMask-Referenzimlementierung Delegation Toolkit) im UI benannt. Hinweis: die zurueckgegebene Permission ist massgeblich, nicht die Anfrage (Draft-Regel).
- Demo-Regression: 113 Checks.

## 2026-11-15 — Wave 7: ERC-7730/8176/8213-Kontext + ENSv2-Dokumentation

- **STVA**: Clear-Signing-Hinweise auf aktuellen Stand — ERC-7730-Deskriptoren seit 12.05.2026 aus dem EF-gehosteten, frei spiegelbaren Registry (clearsigning.org) nach Uebergabe von Ledger an die Trillion-Dollar-Security-Initiative; ERC-8176-Attestierungen fuer Deskriptor-Audits genannt. Der vom Tool berechnete Calldata-Fingerprint wird explizit als ERC-8213-Digest-Fallback eingeordnet.
- **BundleWatch**: ENSv2-Migrationskontext dokumentiert (Universal-Resolver ist DAO-eigener Proxy unter 0xeEeEEEeE…E144EeEe; Sepolia laeuft seit 08/2026 auf v2, Mainnet bei Aktivierung — Abfrage bleibt kompatibel). Resolver-Adresse gegen ENS-Docs verifiziert (unveraendert).
- Demo-Regression: 108 Checks (inkl. String-Lock-ins fuer ERC-8176/8213/ENSv2-Hinweise).

### Nachtrag: x402-Advisory-Matrix auf Stand 11/2026 (2.31.0)

- **X402-CORE-2026-10** (high, < 2.29.0): zod-3.x-Transitivabhaengigkeit enthaelt GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404) — es gibt kein gepatchtes zod 3.x; 2.29.0 geht auf zod >= 4.6.6 und deckelt zugleich accepts/discovery/SIWX-Listen auf 1024 Eintraege sowie Facilitator-Antworten auf 1 MiB (Speicher-DoS). Match auf core/fetch/axios/extensions.
- **X402-CORE-2026-11** (high, < 2.30.0): AfterSettle-Hook-Isolation — ein werfender afterSettle-Hook liess settle() ablehnen, obwohl das Settlement onchain bereits final war (Zahlung vollzogen, Server meldet Fehler). Gate-Hooks bleiben fail-closed.
- Lock-ins aktualisiert: core 2.22.5 -> 5 Advisories; extensions 2.28.0 -> CORE-2026-10 + PT-2026-118463; core 2.29.0 -> nur CORE-2026-11; core 2.31.0 (Aktuellstand) -> keine npm-Advisories. 110 Checks insgesamt.

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
