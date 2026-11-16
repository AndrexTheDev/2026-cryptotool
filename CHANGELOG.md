# Changelog

## 2026-11-15 — Wave 17: Feature↔Demo-Paritaet

- **SlotGuard-Demo** zeigt jetzt auf den MetaMask-Delegator (0x63c0c19a…E32B) → uebt den Known-Delegates-Badge-Pfad aus Wave 12 (Delegation mit Code, Label, Reset-Hinweis greifbar).
- **Paritaets-Lock-in:** alle 10 Tools muessen DemoButton + Demo-Handler besitzen (Struktur-Assertion) — Feature-ohne-Demo-Regel verankert.
- Demo-Regression: 126 Checks.

## 2026-11-15 — Wave 16: UserOp-Demo uebt v0.9-Pfad

- Offline-Demo der UserOp-Autopsy ist jetzt ein **zwei-Receipt-Array**: v0.6-Bundle (bisher) + v0.9-Bundle auf dem v0.9-EntryPoint-Singleton inklusive `IgnoredInitCode`-Ereignis — die Wave-4-Erkennung (Versions-Badge, IgnoredInitCode-Zeile) wird im Demo-Klick direkt sichtbar statt nur latent.
- verify-demos prueft den Demo-Block (nicht bloss die globale Map): v0.9-Adresse + IgnoredInitCode-Referenz muessen im Demo-Pfad referenziert sein.
- Demo-Regression: 124 Checks.

## 2026-11-15 — Wave 15: Konsolidierung auf dem neuen Stack

- Preview-Umgebung auf Astro 7.4.1 neu gestartet (alter Prozess lief noch auf 6.4.8-node_modules): **17/17 Routen 200**, Sitemap-Index korrekt, Title/Noscript unveraendert.
- vite-Direkt-DevDep 7.3.8 → ^8.3.8 angeglichen (Astro 7 bringt ohnehin vite 8.3.8 — jetzt ein einziger Baum, keine dedup-Parallelkopie mehr).
- `npm outdated` Final: nur typescript 5.9.3 (< 7.0.2, Wave-9/14-Entscheidung steht) — alle bewusst.
- Kein Funktionsdelta, daher Demo-Regression unveraendert.

## 2026-11-15 — Wave 14: npm-Audit-Sweep, Astro-Major 6 → 7, Security-Gate in verify

- **Ausloeser:** `npm audit` zeigte 3 Findings — darunter **GHSA-26w7-cxv4-gfx2 (RCE über AVIF-Bildoptimierung, CVSS 9.8, range < 7.2.8)**, womit der bewusste Astro-6-Pin (Wave 9) nicht mehr tragfaehig war.
- **Major-Upgrade kontrolliert durchgefuehrt:** API-Abwaertskompatibilitaet vorab verifiziert (kein `Astro.glob`, keine Content-Collections, keine ViewTransitions im Code; rein statischer Output). Groesste Node-kompatible Version gewaehlt: **astro 7.0→7.4.1** (7.4.2+ erfordert Node >=22.23.4, Sandbox hat 22.22.3 — engines-Kompatibilitaet gegen npm pro Version geprueft) + @astrojs/react 7.1.9.
- **Overrides** `esbuild ^0.28.2`, `sharp ^0.35.5` (GHSA-g7r4 Dev-Server, diverse libvips/libheif/libsvg-CVEs) eingezogen.
- **Verbleibende Findings bewertet (not applicable fuer diese Suite):** GHSA-mh32 (XSS nur via dynamischer Tag-Namen — nicht verwendet) und GHSA-r3h5 (@astrojs/node Datei-Lesen — wir nutzen reinen Static-Output, no Server-Adapter). Beide mit Range <=7.4.6; Nachzug bei Node>=22.23.4-Umgebungen.
- **Neues Quality-Gate:** `npm run verify` inkludiert jetzt `audit:deps` (npm audit, `--audit-level=critical --omit=dev`) — kritische Dep-Findings brechen kuenftig die Pipeline.
- Version **1.1.0**. Komplette Pipeline (inkl. Build, 15 Seiten) auf Astro 7.4.1 reproduzierbar gruen.

## 2026-11-15 — Wave 13: Fee-Bumping-Landschaft (BitVaultStress)

- Neues Wissensaccordion „Gebuehren-Bumping-Landschaft 2026" im Stress-Bericht: pre-signierte Recovery-TXs tragen fixe Fees — die Bewertung haengt von der Relais-Policy ab. Dokumentiert (Quellen: Optech #323, Core-Release-Notes): Full-RBF default seit Core 28.0 (10/2024), verpflichtend seit 29.0 (04/2025); Ephemeral Anchors (P2A `OP_1 0x4e73`) seit 28.0 standard-relay-faehig fuer Zero-Fee-Commitments; TRUC/v3-Pinning-Begrenzung (10.000 vB, eine unbestaetigte Vorfahre); 1p1c-Package-Relay als Rettungsweg unterbezahlter Parents.
- Demo-Regression: 123 Checks; Drift-Lock-in hat erneut die README-Zahl gezogen.

## 2026-11-15 — Wave 12: Known-Delegates, CI-Majors, security.txt

- **SlotGuard-7702**: Known-Delegates-Registry (konservativ, >= 3 unabhaengige Quellen je Adresse): MetaMask EIP-7702 Delegator `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` wird bei Delegationen namentlich als Badge markiert — Triage-Trennung „bekannte Implementierung" vs. „unbekannter Delegate" (Dormant-Sweeper-Kandidat). Reset-Hinweis via address(0)-Autorisierung.
- **CI**: actions/checkout v4 → v7.0.1, actions/setup-node v4 → v7.1.0 (drei Major-Stufen nachgezogen, via GitHub-API gegen letzte Releases verifiziert).
- **security.txt** (RFC 9116) unter `public/.well-known/security.txt`: Kontakt ueber Issues/Advisory-Flow, Expires 30.06.2027, Sprachen de/en. audit-dist erzwingt Existenz + parsebares, nicht abgelaufenes Expires.
- Demo-Regression: 121 Checks.

## 2026-11-15 — Wave 11: EIP-7951/Fusaka-Mainnet-Kontext (PasskeyContinuity)

- P256VERIFY (Precompile 0x0100) ist seit dem **Fusaka-Hardfork (03.12.2025)** konsensfähig auf dem Ethereum-Mainnet aktiv — selbe Adresse wie RIP-7212 auf Rollups. Adoptions-Referenz im Tool entsprechend zweigeteilt (Mainnet EIP-7951 vs. Rollup-RIP-7212).
- Fachlich wichtiger Unterschied dokumentiert: EIP-7951 macht die high-S-Ablehnung (Malleability-Schutz) verbindlich; RIP-7212 ueberliess sie den Chains. Malleability-Interpretation im Kommentar entsprechend praezisiert.
- Der Doku-Drift-Lock-in hat direkt bewiesen, dass er greift: neuer Check erhoehte die Summe auf 117 → README-Zahl wurde vom Lock-in als veraltet gemeldet und aktualisiert.
- Demo-Regression: 117 Checks.

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
