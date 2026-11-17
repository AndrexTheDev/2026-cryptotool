# Changelog

## 2026-11-17 — Wave 29: Dependabot (dependency-currency automation)

- `.github/dependabot.yml` added: weekly (Mondays) grouped minor/patch PRs for npm (production and development groups) and GitHub Actions; majors arrive as individual PRs for deliberate review.
- Rationale: the manual currency audits of waves 9/14/26/28 are now automated. Notably this covers the pending astro ≥ 7.4.7 bump — the CI runner (`node: '22'` → 22.23.x) satisfies the engine floor even though the dev sandbox (22.22.3) does not, so a Dependabot astro PR is verified end-to-end by the full CI pipeline (typecheck, build, audit-dist, 132-check demo regression).
- picomatch stays transitive-only (no fix released); it rides along once the parent packages bump.

## 2026-11-17 — Wave 28: Dependency currency (viem 2.58.0)

- **viem 2.57.20 → 2.58.0** (minor, released 2026-11-17): core EVM library used by SlotGuard/STVA/PasskeyContinuity/BundleWatch/IntentLens. No API surface changes affecting this codebase; full regression re-verified.
- Re-checked the blocked follow-ups: picomatch still 4.0.7 (no fix released), astro 7.4.2+ still blocked (sandbox Node 22.22.3 < 22.23.4), typescript 7.0.2 still waits on the astro lift. Remaining outdated: none actionable.
- Pipeline: tsc (both flags) 0 errors; `npm run verify` green (15 pages, audit-dist passed, 132/132).

## 2026-11-17 — Wave 27: Rebrand to StackAutopsy

- **New product brand:** the suite is now **StackAutopsy** — Web3 Security & Forensics Suite. The former "A" monogram was replaced by a new mark: a three-layer stack (emerald) with the middle layer in gold — the "dissected layer", the forensic signature of the brand.
- **Scope of the rename (product brand):** `BRAND` constant in `src/config/site.ts` (drives nav, footer, layouts, llms.txt), package name (`stackautopsy`, version 1.2.0, description finally English), og-image wordmark + embedded mark, donation payment labels (BTC BIP-21 / SOL Pay), DAC8 certificate `standard` string + demo message, export footer (`export.ts`) and per-tool generator footers, donate page + donation modal headings, legal page titles/descriptions, AGB product naming + brand clause (§ 6), disclaimer/datenschutz titles, JSON-LD `WebSite`/`SoftwareApplication` names, README H1, design-system comment.
- **New assets:** `public/favicon.svg` redrawn (stack mark), `public/og-image.svg` (wordmark + mark), `public/logo.png` (generated brand logo, referenced from README + apple-touch-icon).
- **Deliberately unchanged (author/infrastructure, not brand):** LICENSE copyright (`© 2026 AndrexTheDev`), JSON-LD `Person` author entries, legal operator/controller identity in AGB § 1 / disclaimer / datenschutz § 7, GitHub repo URLs in security.txt, deployment domain `suite.andrexthe.dev` (infrastructure; a domain move is a separate operator decision — one line in `astro.config.mjs` / `PUBLIC_SITE_URL`).
- **Lock-ins synced:** `audit-dist.mjs` llms.txt brand check → `StackAutopsy`; `verify-demos.mjs` donation-label asserts (×3) + DAC8 demo message → `StackAutopsy`; LICENSE hygiene check intentionally still asserts `AndrexTheDev` (author).
- Pipeline: tsc (both strictness flags) 0 errors; `npm run verify` green (build 15 pages, audit-dist passed, 132/132 demo checks).

## 2026-11-17 — Wave 26: Post-i18n dependency audit (documented assessment)

- **Trigger:** after the i18n merge a full `npm audit` (all severities, incl. dev) reports **12 high-severity findings**, all transitive — none reachable in this deployment.
- **Root cause 1 — GHSA-fc5q-39xc-vjpf / CVE-2026-112366 (picomatch ReDoS, high, CVSS 7.5):** affects every published version ≤ 4.0.7 (the newest on npm). No patched release exists yet (fix PR micromatch/picomatch#194 is merged but unpublished). Propagates through fdir → tinyglobby → vite → astro, and anymatch@2.3.2 (inside unstorage). **Not applicable here:** the ReDoS needs an attacker-controlled repeated extglob pattern; the only glob patterns in play are our own build config (`src/**/*` etc.), never request/user input. All affected packages are build-time tooling (vite/tinyglobby/fdir/anymatch/unstorage), not runtime.
- **Root cause 2 — GHSA-mh32-jxcr-mh9f / CVE-2026-126361 (astro XSS via dynamic tag names, low, CVSS 2.3):** exploitable only if untrusted input is used as an element name. We never do that (no dynamic tag rendering). Fixed in 7.4.5.
- **Root cause 3 — GHSA-r3h5-4585-7x3w / CVE-2026-126364 (@astrojs/node image endpoint file read, medium):** only reachable with the `@astrojs/node` adapter. We use pure static output, no adapter — the image endpoint does not exist. Fixed in 7.4.7.
- **Why no upgrade now:** Astro 7.4.2+ (which carries the 7.4.5/7.4.7 fixes) raises the Node engine floor to **≥ 22.23.4**; this sandbox runs Node **22.22.3**, so 7.4.1 is the newest engines-compatible release. The two astro fixes (7.4.5, 7.4.7) therefore cannot be installed here. Verified per-version against `npm view astro@<v> engines.node`.
- **Production gate stays green:** `npm run audit:deps` (prod-only, `--audit-level=critical`) reports 0 critical findings — none of the 12 are production-critical. `astro`/`vite` are build-time dependencies (listed under `dependencies` because Astro requires it), but their vulnerable code paths (image endpoint, dynamic tags, globbing) are not part of the shipped static bundle.
- **Action / lock-in:** follow-up scheduled — bump astro to ≥ 7.4.7 (clears GHSA-mh32 + GHSA-r3h5) once the environment provides Node ≥ 22.23.4; re-audit picomatch once a fixed release (>4.0.7) is published. Documented in ROADMAP. Pipeline unchanged: tsc (both flags) 0 errors, `npm run verify` green (build 15 pages, audit-dist passed, 132/132 demo checks).

## 2026-11-17 — Wave 25: Internationalization (English-first)

- **Scope**: the entire repository is now English-first — UI shell (TopNav/Footer/ToolGrid/ToolPageHeader/layouts), all shared React components, all 10 tool components, lib/worker/hooks, scripts (verify-demos.mjs, audit-dist.mjs) and documentation (README/CHANGELOG/ROADMAP).
- **Language toggle removed**: the DE|EN switcher in the TopNav (incl. its inline script and the `data-i18n-*` attribute mechanism) was dropped by owner decision — the suite is English-only; `lang="en"`, `og:locale en_GB`, `inLanguage: ['en']`.
- **URL slugs unchanged by owner decision**: the legal pages keep their German routes `/agb`, `/disclaimer`, `/datenschutz`; their content is now English.
- **Data formats consistently English**: CSV export column keys in English with dot decimals, locales switched from `de-DE` to `en-GB`, JSON export file names renamed `*-bericht.json` → `*-report.json`, DAC8 `verification.result` union = `valid`/`invalid`/`not checked`, intents `decodeConfidence` union = `full`/`partial`/`raw`, refund source strings English (`refundAddress (explicit)` etc.).
- **Intentionally kept German**: the BANNED regex list in `scripts/audit-dist.mjs` (negative-keyword check targets legacy German marketing terms).
- Lock-in: demo regression stays at **132 checks** — content assertions in verify-demos.mjs were synced with the translated component sources (`full`, `/fallback 2/`, `/ephemeral anchors/i`, `/ERC-8213/` + `/calldata-digest fallback/i`, DAC8 `as of 11/2026` / `EUR 50,000` / `58 countries`, README drift check case-insensitive).
- Pipeline: tsc (both strictness flags) 0 errors; `npm run verify` green (build 15 pages, audit-dist passed, 132/132).

## 2026-11-16 — Wave 24: Fork landscape 11/2026 (Glamsterdam/BPO follow-up)

- Verified research on the Ethereum fork roadmap (multiply corroborated: BlockEden 25.01.2026, iq.wiki, Metrika, Blofin 14.10.2026, weex 06.10.2026, kiln.fi):
  - **Fusaka follow-ups complete**: BPO-1 (17.12.2025; target 6→10, max 9→15) and **BPO-2 (07.01.2026; →14/21)** — blob capacity since Fusaka >3x, L2 fees ~−60 % per the BlockEden review.
  - **Glamsterdam = next major fork** (Gloas + Amsterdam): headliners **EIP-7732 (ePBS)** and **EIP-7928 (block-level access lists)**, plus gas repricing (EIP-7904) and a gas-limit target of ~200 M; **active on Sepolia since 06.10.2026** (13:53:36 UTC, epoch 353,024), Hoodi late 10/2026, **mainnet target early 12/2026 — not yet fixed** (EIP-7773 leaves the date open).
- Surgical edit: the adoption reference block in `PasskeyContinuity.tsx` (the project's only fork-context surface) extended with the 11/2026 fork landscape; hedging made explicit ("not yet fixed") so the text does not wrongly appear stale once the date is set.
- Lock-in: **+1 check (131 → 132)** — M04 asserts Glamsterdam/06.10.2026/BPO-2/EIP-7732 in the source; README drift in sync.
- Previously: **PR #4 squash-merged** (owner decision, commit d69aca5; DAC8 live status now in main). Branch `arena/bd2fa4fa` rebased onto the new main.

## 2026-11-16 — Wave 23: DAC8 live-status refresh (Q4/2026 research)

- Background: DAC8 has been **live** since 01.01.2026, the first reporting year 2026 is currently running — the existing tool note was already phrased in the present tense but lacked the German implementation and deadline facts. Verified update of the legal time context in `Dac8SelfProof.tsx`:
  - **DE implementation** via the Kryptowerte-Steuertransparenzgesetz (**KStTG**): Bundestag 06.11.2025, Bundesrat consent **19.12.2025** (Deloitte German Tax News, 23.12.2025; kleinstb.de, as of 09/2026).
  - First reporting period = **calendar year 2026**; first submissions in 2027: EU/CARF baseline **31.01.2027** (EY), German **KStTG deadline 31.07.2027** to the BZSt (kleinstb/PPI); first automatic EU exchange by **30.09.2027**.
  - User **self-certification by 01.01.2027** (pre-existing accounts); KStTG fine range **up to EUR 50,000** per violation; practical trap **cost basis 0** for coins transferred in (burden of proof on the user); **CARF internationally from 2027 across 58 countries**.
- Lock-in: **+2 checks (129 → 131)** — M03 content asserts on KStTG/date/deadlines/fines/CARF-58; README drift lock-in updated to 131.
- Pipeline: 131/131 green; tsc with both strictness flags 0 errors.
- **PR #3 squash-merged before that** (owner decision, commit 2523235 on main; branch rebased onto origin/main).

## 2026-11-16 — Wave 22: exactOptionalPropertyTypes permanently enabled

- **`exactOptionalPropertyTypes` permanently enabled** (tsconfig, in addition to `noUncheckedIndexedAccess`). All measured diagnostics (27 error blocks, wave-19b remainder) fixed — exclusively by widening the *declarations*: optional properties that producers already explicitly pass as `undefined` now carry the honest type `prop?: T | undefined`.
- Changed type targets (pure type level, **not a single byte of runtime code**): `StatusTile.detail` + `SourceBadge.source` (shared ui), `Analysis` (BitVault), `TxFacts`/`Cert` (DAC8: blockHash/blockHeight/timestamp/amountLabel/confirmed/note/costBasisHint/verification.detail), `DecodedOrder` + `resolveRefundRecipient` signature (intents), `PolicyNode.key` (miniscript), `parseSafeExport` return type + `DecodedCall.descriptor` (stva), `PolicyDimension.evidence` + `HarLikeEntry.time` + `DeliveryFinding.time` (x402), `RawAnnouncement`/`StealthHit` txHash+caller (stealth.worker), `ChainFinding`/`CollisionItem` (SlotGuard), `TxAutopsy` (Userop), export `status.detail`.
- Why the declaration side instead of rebuilding producers: most literals already built `undefined` values as the actual state (`note.trim() || undefined`, `facts?.blockHash`); the flag merely forces the types to reflect that truth. Result: `tsc --noEmit` with both flags 0 errors; full pipeline **129/129 green** (the reference vectors cover the affected parsers bit-exactly again).
- The same HYGIENE lock-in (remains exactly 1 check) now enforces **both** flags permanently — check count stays 129, README/drift lock-in consistently unchanged.
- Note: the session git state was re-synced from GitHub before this wave (local branch pointed at the merge base; remote head adopted unchanged; no force push).

## 2026-11-16 — Wave 21: TypeScript strictness consolidation implemented

- **`noUncheckedIndexedAccess` permanently enabled** (tsconfig). All 68 measured sites (18 files, wave-19b probe) fixed: array/map indexes and regex group extractions in evm-utils, x402 lockfile parsing (npm/go/pip), the BIP-322 PoF PSBT varint reader, contenthash varint, miniscript satisfaction weights, the stealth worker (hash bytes), the UserOp receipt decoder, the donation wallet flow, and more.
- Technique kept conservative: guards instead of non-null assertions; runtime behavior unchanged — provable: full pipeline (build 15 pages, dist audit, dep audit) plus **128/128 demo checks still green** (the check matrix covers the affected parsers with exact reference vectors).
- Lock-in: tsconfig must keep the option enabled; regression breaks the pipeline.
- On the new branch after the merge of PR #2 (squash 8681fbd).

## 2026-11-15 — Wave 20: clean-room verification (pre-merge)

- Reproducibility proven: all tracked files copied into an empty room, `npm ci` exclusively from the lockfile → entire pipeline green (typecheck, build 15 pages, dist audit, dep audit at critical, 128/128 checks). The lockfile suffered no drift through the consecration waves.

## 2026-11-15 — Wave 19b: TypeScript strictness probe (documented assessment)

- Currently `strict: true`. Probe against `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`: **103 diagnostics**; `noUncheckedIndexedAccess` alone: **68 sites** (predominantly array-index patterns in tools).
- Assessment: purely static deepening without runtime change; touching 68 call sites late in the session would be churn-risky. Documented proposal for follow-up work (measured, not felt).
- GitHub license recognition only kicks in after merge (LICENSE sits on the PR branch): expected.

## 2026-11-15 — Wave 19: MIT license (owner decision)

- `LICENSE` (MIT, Copyright (c) 2026 AndrexTheDev) added; `package.json` `license: MIT`; README license section. Lock-in: LICENSE must carry the MIT header and the package.json field must match.

## 2026-11-15 — Wave 18: merge-readiness sweep

- **Secrets/key audit** across all 73 tracked files: no private-key artifacts (test vectors are documented constructs, not material). Regex scan (`BEGIN…PRIVATE`, 64-hex `private_key` patterns) clean.
- **CSP decision reconfirmed:** the meta CSP in BaseLayout covers `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`; `script-src … 'unsafe-inline'` is mandatory as long as 61 Astro inline scripts (language toggle, hydration guards, JSON-LD) exist without nonce mechanics — hashes next to `'unsafe-inline'` would be ineffective. Decision ROADMAP #8 stands.
- **og:image** points absolutely at /og-image.svg (present); robots.txt links the sitemap; .gitignore covers node_modules/dist/.astro/.env; the largest tracked blob is package-lock.json (200 KB) — no large artifacts in the repo.
- Repo finding: LICENSE is missing upstream — license choice is the owner's (not part of the code PR).

## 2026-11-15 — Wave 17: feature↔demo parity

- **SlotGuard demo** now points at the MetaMask delegator (0x63c0c19a…E32B) → exercises the known-delegates badge path from wave 12 (delegation with code, label, reset note tangible).
- **Parity lock-in:** all 10 tools must have a DemoButton + demo handler (structural assertion) — the no-feature-without-demo rule is anchored.
- Demo regression: 126 checks.

## 2026-11-15 — Wave 16: UserOp demo exercises the v0.9 path

- The UserOp-Autopsy offline demo is now a **two-receipt array**: v0.6 bundle (as before) + v0.9 bundle on the v0.9 EntryPoint singleton including an `IgnoredInitCode` event — the wave-4 detection (version badge, IgnoredInitCode line) becomes directly visible on the demo click instead of staying latent.
- verify-demos checks the demo block (not just the global map): the v0.9 address + IgnoredInitCode reference must be referenced in the demo path.
- Demo regression: 124 checks.

## 2026-11-15 — Wave 15: consolidation on the new stack

- Preview environment restarted on Astro 7.4.1 (the old process was still running on 6.4.8 node_modules): **17/17 routes 200**, sitemap index correct, title/noscript unchanged.
- vite direct devDep 7.3.8 → ^8.3.8 aligned (Astro 7 ships vite 8.3.8 anyway — now a single tree, no dedup parallel copy).
- `npm outdated` final: only typescript 5.9.3 (< 7.0.2, wave-9/14 decision stands) — all deliberate.
- No functional delta, so the demo regression is unchanged.

## 2026-11-15 — Wave 14: npm audit sweep, Astro major 6 → 7, security gate in verify

- **Trigger:** `npm audit` showed 3 findings — including **GHSA-26w7-cxv4-gfx2 (RCE via AVIF image optimization, CVSS 9.8, range < 7.2.8)**, which made the deliberate Astro 6 pin (wave 9) no longer viable.
- **Major upgrade performed in a controlled manner:** API backward compatibility verified beforehand (no `Astro.glob`, no content collections, no ViewTransitions in the code; purely static output). Largest Node-compatible version chosen: **astro 7.0→7.4.1** (7.4.2+ requires Node >=22.23.4, the sandbox has 22.22.3 — engines compatibility checked against npm per version) + @astrojs/react 7.1.9.
- **Overrides** `esbuild ^0.28.2`, `sharp ^0.35.5` (GHSA-g7r4 dev server, various libvips/libheif/libsvg CVEs) pulled in.
- **Remaining findings assessed (not applicable to this suite):** GHSA-mh32 (XSS only via dynamic tag names — not used) and GHSA-r3h5 (@astrojs/node file reading — we use pure static output, no server adapter). Both with range <=7.4.6; follow-up in Node>=22.23.4 environments.
- **New quality gate:** `npm run verify` now includes `audit:deps` (npm audit, `--audit-level=critical --omit=dev`) — critical dependency findings will break the pipeline going forward.
- Version **1.1.0**. Complete pipeline (incl. build, 15 pages) reproducibly green on Astro 7.4.1.

## 2026-11-15 — Wave 13: fee-bumping landscape (BitVaultStress)

- New knowledge accordion "fee-bumping landscape 2026" in the stress report: pre-signed recovery TXs carry fixed fees — the assessment depends on the relay policy. Documented (sources: Optech #323, Core release notes): Full-RBF default since Core 28.0 (10/2024), mandatory since 29.0 (04/2025); ephemeral anchors (P2A `OP_1 0x4e73`) standard-relayable since 28.0 for zero-fee commitments; TRUC/v3 pinning limits (10,000 vB, one unconfirmed ancestor); 1p1c package relay as a rescue path for underpaid parents.
- Demo regression: 123 checks; the drift lock-in once again pulled the README number.

## 2026-11-15 — Wave 12: known delegates, CI majors, security.txt

- **SlotGuard-7702**: known-delegates registry (conservative, >= 3 independent sources per address): the MetaMask EIP-7702 delegator `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` is marked by name as a badge on delegations — triage separation "known implementation" vs. "unknown delegate" (dormant sweeper candidate). Reset note via address(0) authorization.
- **CI**: actions/checkout v4 → v7.0.1, actions/setup-node v4 → v7.1.0 (three major steps caught up, verified via the GitHub API against the latest releases).
- **security.txt** (RFC 9116) under `public/.well-known/security.txt`: contact via the issues/advisory flow, Expires 30.06.2027, languages de/en. audit-dist enforces existence + a parseable, unexpired Expires.
- Demo regression: 121 checks.

## 2026-11-15 — Wave 11: EIP-7951/Fusaka mainnet context (PasskeyContinuity)

- P256VERIFY (precompile 0x0100) has been consensus-active on Ethereum mainnet since the **Fusaka hard fork (03.12.2025)** — same address as RIP-7212 on rollups. The adoption reference in the tool split accordingly (mainnet EIP-7951 vs. rollup RIP-7212).
- The technically important difference is documented: EIP-7951 makes the high-S rejection (malleability protection) mandatory; RIP-7212 left it to the chains. The malleability interpretation in the comment was clarified accordingly.
- The docs drift lock-in proved directly that it fires: the new check raised the total to 117 → the README number was reported as stale by the lock-in and updated.
- Demo regression: 117 checks.

## 2026-11-15 — Wave 10: documentation drift elimination

- **Drift lock-in (new, self-referential):** the last demo check verifies that the README names exactly the current check count (including itself) — documentation can no longer lag behind the regression.
- README: 78-check → 116-check corrected.
- llms.txt brought up to the wave 4–9 synchronization state: the x402 matrix now with 12 entries/2.31.0 status (incl. 2026-10 zod/DoS and 2026-11 afterSettle), EntryPoint v0.6–v0.9 detection incl. IgnoredInitCode, the Safe singleton registry from v1.5.0, BIP-322 Complete prefixes PoF, FIDO CXF/CXP maturity levels, the EF clear-signing registry (ERC-7730/8176/8213).

## 2026-11-15 — Wave 9: dependency hygiene & currency audit

- **Fix (session self-finding):** wave-5 commit 641b898 had accidentally recorded the reference packages `content-hash`/`multiformats` as production dependencies (scratch install side effect). Nothing imported them; both removed, lockfile regenerated. Hygiene lock-in in verify-demos: precisely these packages must never become project deps + a cap of 26 deps.
- **Currency audit (npm, 15.11.2026):** 17/19 deps current (including viem 2.57.20, age-encryption 0.3.1, @noble/@scure 2.4.x, bip322-js 4.0.1). Majors deliberately NOT switched, each with a rationale:
  - `astro` 6.4.8 (7.4.12 available): a major jump requires a migration review (React/sitemap integration contracts, Vite 8 pairing) — no blind bump in an audit toolchain.
  - `@astrojs/react` 6.0.6 and `vite` 7.3.8: follow the Astro 6/7 pairing.
  - `typescript` 5.9.3 (7.0.2 available): TS7 is the native port (Go) with changed build/tooling behavior — assess only after the Astro 7 lift.
  - `@astrojs/sitemap` ^3.6.0 already resolves to 3.7.5 (the caret range picks up patch/minor automatically).

## 2026-11-15 — Wave 8: passkey portability (FIDO CXF) + ERC-7715 rename

- **PasskeyContinuity**: fifth checklist item `portability` — does the credential manager support an export? Context: FIDO CXF 1.0 (Credential Exchange Format) has been a Proposed Standard since 14.08.2025 (errata 09.03.2026), while the transport protocol CXP remains a Working Draft dated 03.10.2024 — half portability: the export format is standardized, the transport is not. Both source bases (FIDO spec directory, independent analysis 07/2026) documented.
- **X402PaywallGuard**: the ERC-7715 method rename in the draft is covered — `wallet_requestExecutionPermissions` (draft status 09/2026) named alongside the historical `wallet_grantPermissions` (MetaMask reference implementation Delegation Toolkit) in the UI. Note: the returned permission is authoritative, not the request (draft rule).
- Demo regression: 113 checks.

## 2026-11-15 — Wave 7: ERC-7730/8176/8213 context + ENSv2 documentation

- **STVA**: clear-signing notes brought up to date — ERC-7730 descriptors since 12.05.2026 from the EF-hosted, freely mirrorable registry (clearsigning.org) after the handover from Ledger to the Trillion Dollar Security initiative; ERC-8176 attestations for descriptor audits named. The calldata fingerprint computed by the tool is explicitly classified as the ERC-8213 digest fallback.
- **BundleWatch**: ENSv2 migration context documented (the universal resolver is a DAO-owned proxy at 0xeEeEEEeE…E144EeEe; Sepolia has been running v2 since 08/2026, mainnet upon activation — the query stays compatible). Resolver address verified against the ENS docs (unchanged).
- Demo regression: 108 checks (incl. string lock-ins for the ERC-8176/8213/ENSv2 notes).

### Addendum: x402 advisory matrix updated to 11/2026 (2.31.0)

- **X402-CORE-2026-10** (high, < 2.29.0): the zod 3.x transitive dependency contains GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404) — there is no patched zod 3.x; 2.29.0 moves to zod >= 4.6.6 and simultaneously caps accepts/discovery/SIWX lists at 1024 entries and facilitator responses at 1 MiB (memory DoS). Matches core/fetch/axios/extensions.
- **X402-CORE-2026-11** (high, < 2.30.0): afterSettle hook isolation — a throwing afterSettle hook made settle() reject although the settlement was already final onchain (payment completed, server reports an error). Gate hooks remain fail-closed.
- Lock-ins updated: core 2.22.5 -> 5 advisories; extensions 2.28.0 -> CORE-2026-10 + PT-2026-118463; core 2.29.0 -> only CORE-2026-11; core 2.31.0 (current status) -> no npm advisories. 110 checks in total.

## 2026-11-15 — Wave 6: BIP-322 "Complete" (v1.0.0/v2.0.0) in DAC8-SelfProof

- **BIP-322 final covered**: the BIP was raised to "Complete" on 15.04.2026 — with breaking changes: human-readable prefixes `smp`/`ful`/`pof`, prepended directly to the base64 (no separator), plus a backward-compat clause (no prefix = simple). bip322-js 4.0.1 does not understand the prefixes; detection + stripping now in `lib/bip322.ts` (`classifyBip322Signature`).
- **Proof of funds (pof)**: a finalized PSBT is inspected offline (`inspectPofPsbt`): input count, PSBT_GLOBAL_GENERIC_SIGNED_MESSAGE (0x09) and challenge match — with an explicit note that the unspent status must be checked onchain.
- The demo signer now produces `smp`-prefixed signatures (spec-compliant); the verifier continues to accept legacy without a prefix (regression secured).
- Negative finding noted: the Bitcoin Core v30 standardness changes (datacarriersize 83 → 100,000, multiple OP_RETURN outputs) only affect relay policy, not consensus rules — BitVaultStress needs no change.
- Demo regression: 104 checks.

## 2026-11-15 — Wave 5: Safe v1.5.0 registry + contenthash reference vectors

- **STVA (Safe Upgrade Diff)**: the canonical Safe singleton registry from `safe-global/safe-deployments` embedded — v1.3.0 (canonical/eip155), v1.4.1, v1.5.0 incl. SafeL2 and SafeMigration variants (9 addresses, verified upstream). Target implementations of upgrade transactions are checked against the registry: hits get a version badge, misses get a supply-chain warning in the assumptions. For a recognized singleton < v1.5.0 a note points to the official upgrade recommendation (Safe blog 22.09.2026: module guard requirement, error return, ERC-1271).
- The demo flow now realistically targets SafeL2 v1.5.0; the argument names `implementation`/`masterCopy`/`singleton` are resolved alongside `newImplementation`.
- **Contenthash regression hardened against specification vectors**: the EIP-1577 example vector and the CIDv0 path are checked exactly against the multiformats and content-hash reference outputs (`bafybeibj6…r7d4`, `QmbFMke1…xQDi`). Covers the varint confusion of the walletbeat#1330 bug class.
- age-encryption 0.3.1 confirmed against npm (current, no action needed).
- Demo regression: 94 checks.

## 2026-11-15 — Wave 4: ERC-4337 v0.8/v0.9 (UserOp-Autopsy)

- EntryPoint detection for all four canonical singletons (v0.6 `0x5FF13…d2789`, v0.7 `0x0000…da032`, v0.8 `0x4337084D…Ff108`, v0.9 `0x43370900…D8d009`); version badge per transaction.
- The v0.9 `IgnoredInitCode` event is collected and highlighted on the finding (misdiagnosis source: initCode is silently ignored when the sender exists).
- Topic constants verified per keccak256 signature and pinned in the demo regression (84 checks in total).

## 2026-11-15 — Research update (Arena branch b2c454a8)

**Content (research Oct/Nov 2026):**
- x402 advisory matrix extended to 10 entries: V12 disclosure (25 findings, 3 critical — default spend limit, Solana ApproveChecked bypass, SIWx login replay; fix line 2.23.0 each), separate payment bypass `@x402/core` < 2.27.0, PT-2026-118463 (SIWX server auth bypass, npm/pip/go up to 2.28.0/2.25.0/2.28.0).
- StealthAudit: canonical announcer address corrected to `0x55649E01B5Df198D18D95b5cc5051630cfD45564` (was maintained incorrectly), registry reference added, references accordion.
- SlotGuard: chainId-0 replay warning in the panic package, sweeper context (CrimeEnjoyor family) in the finding text.
- DAC8-SelfProof: time context reporting year 2026 + filing window 2027.
- IntentLens: filler reference frame (Across, Eco, LI.FI, UniswapX, Symbiosis).
- PasskeyContinuity: RIP-7212 adoption list + cost frame (~3,450 vs. 200–300k gas).

**Technique:**
- `npm run verify` full pipeline; `npm run test:demos` 78 checks (new: x402 threshold lock-in, py/go lockfile parser, SlotGuard offline dump variants).
- Astro hover prefetch on tool cards (HTML only).

## 2026-11-15 — Initial release (PR #1, merged as 8d67f2b)

- 10 tools, static Astro 6 SSG app, React islands, Tailwind 4.
- Landing/legal with 0 KB JS, route-level code splitting (viem/bitcoinjs/noble lazy).
- Policy audit (`scripts/audit-dist.mjs`), demo regression, CI workflow, a11y (focus trap, aria-live, reduced motion, skip link), BreadcrumbList/SoftwareApplication/FAQPage/WebSite/Person JSON-LD, sitemap/robots/llms.txt.
