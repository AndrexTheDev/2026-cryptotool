# StackAutopsy — Web3 Security & Forensics Suite

<p align="center">
  <img src="public/logo.png" alt="StackAutopsy logo — three-layer stack with the dissected middle layer in gold" width="360" />
</p>

Ten specialized Web3, Bitcoin and compliance tools, computed **locally in the browser** and verified **live against the networks of truth**: no accounts, no operator server, no tracking pixels. Static site generation with **Astro 7 + React islands + TypeScript + Tailwind 4**.

The UI language is English. The legal pages (`/agb`, `/disclaimer`, `/datenschutz`) keep their German URL slugs by design; their content is provided in English as well.

## Tools

| # | Route | Purpose |
|---|-------|---------|
| 01 | `/tools/7702-slotguard` | EIP-7702 delegations, storage collisions, panic-revoke package |
| 02 | `/tools/stva-upgradediff` | Three-layer verification of Safe/proxy upgrades |
| 03 | `/tools/dac8-selfproof` | BIP-322 / EIP-191/712 / ERC-1271 self-transfer proofs |
| 04 | `/tools/bitvault-stress` | Miniscript vaults, vByte, dust cliff, fee heatmap |
| 05 | `/tools/passkey-continuity` | WebAuthn/P-256 multi-chain, RIP-7212 detection |
| 06 | `/tools/userop-autopsy` | Bundler margin & paymaster spread from EntryPoint logs |
| 07 | `/tools/x402-paywallguard` | x402 middleware vulnerabilities, SIWX scanner, ERC-7715 radar |
| 08 | `/tools/intentlens-7683` | Decode ERC-7683 intents, spread, refund calldata |
| 09 | `/tools/stealthaudit-5564` | EIP-5564 viewing-key scan in a WebWorker (no key export) |
| 10 | `/tools/bundlewatch-ens` | dApp frontend integrity against ENS contenthash & releases |

## Development

```bash
npm ci             # Node >= 22.23.4 (Astro 7)
npm run dev        # dev server
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
npm run audit      # policy audit over dist/ (after build)
npm run test:demos # 142-check demo regression of all 10 modules
npm run test:beta  # 70-check beta suite: adversarial lib tests + SSR render smoke of all 10 tools + live npm/RPC paths
npm run verify     # full pipeline: typecheck + build + audit-dist + audit:deps + test:demos + test:beta
```

## Architecture rules (safety invariants)

- **No server logic**: `output: 'static'`, no API routes, no CSR-only secrets.
- **Route-level code splitting**: heavy crypto modules (`viem`, `@noble/*`, `bitcoinjs-lib`, `bip322-js`) are loaded exclusively via dynamic `import()` from tool islands — see `manualChunks` in `astro.config.mjs`.
- **Landing + legal = 0 KB JS**: `BaseLayout shell="static"` suppresses the `GlobalApp` hydration; only tool pages use `shell="interactive"`.
- **No seed phrases/private keys**: BitVault-Stress actively blocks mnemonics; StealthAudit only accepts viewing keys and never exports key material.
- **Live-first**: chain data is fetched live by default — browser-direct to public read endpoints (user-replaceable via `RpcPanel`, persisted locally); every answer shows its source + time (`SourceBadge`), and pasted claims are automatically cross-checked against the chain (`CrossBadge`). **Offline fallbacks** (manual input, files, dumps) exist in every module; live checks then report "unavailable" instead of blocking.
- **Determinism**: risk scores and thresholds are documented fixed in the module code.

## Phase-5 audit

`scripts/audit-dist.mjs` checks after the build:

1. negative keywords in visible texts (price/"free" terms, concrete infrastructure names),
2. character-exact donation addresses (SOL/BTC/ETH + checksum collisions),
3. homepage bundle (no tool/WASM chunks, JS budget ≤ 300 KB),
4. mandatory artifacts (sitemap, robots.txt, llms.txt, legal pages, CSP with `wasm-unsafe-eval`).

## Legal

Terms of use, disclaimer and privacy transparency: see `/agb`, `/disclaimer`, `/datenschutz`.
Contact: **hippie.highho@gmail.com** · donations voluntary (SOL/BTC/EVM, see `/donate`).

## License

[MIT](LICENSE) © 2026 AndrexTheDev
