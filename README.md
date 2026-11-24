# StackAutopsy — Web3 Security & Forensics Suite

<p align="center">
  <img src="public/logo.png" alt="StackAutopsy logo — three-layer stack with the dissected middle layer in gold" width="360" />
</p>

Ten specialized Web3, Bitcoin and compliance tools, computed **locally in the browser** and verified **live against the networks of truth**: no accounts, no operator server, no tracking pixels. Static site generation with **Astro 7 + React islands + TypeScript + Tailwind 4**.

The UI language is English. The legal pages (`/agb`, `/disclaimer`, `/datenschutz`) keep their German URL slugs by design; their content is provided in English as well.

## Tools (plain-language overview + examples)

| # | Route | Plain-language explanation | Example |
|---|-------|----------------------------|---------|
| 01 | `/tools/7702-slotguard` | Checks whether your normal Ethereum wallet has hidden program code ("a delegate") attached via EIP-7702, warns on data clashes, and builds an encrypted emergency undo file. | You signed a sketchy airdrop claim and want to check if a hidden sweeper script is attached to your address—and create an undo file. |
| 02 | `/tools/stva-upgradediff` | Translates raw hex update data ("calldata") into plain steps: what you are signing, what executes, and what risks stay hidden. | Your team Safe wallet asks you to approve an upgrade shown only as `0x4f1ef286…`; paste it to see the exact new contract and whether it is an official Safe release. |
| 03 | `/tools/dac8-selfproof` | Creates a short "I own this wallet" statement tied to one Bitcoin or Ethereum transfer, verifies the signature locally, and exports a clean proof report. | You moved 0.38 BTC from an exchange to your hardware wallet and need EU DAC8 / Travel Rule ownership proof without uploading your full history. |
| 04 | `/tools/bitvault-stress` | Simulates high Bitcoin fees on your vault or inheritance plan to flag small coin pieces ("UTXOs") near the dust cliff and creates an offline heir practice guide. | You hold small deposits (3,400 or 21,000 sats) in an inheritance vault and test at which fee rate fees would eat them—plus export a drill for heirs. |
| 05 | `/tools/passkey-continuity` | Tests whether each selected blockchain verifies passkeys (FaceID / TouchID) natively or via a backup contract, plus a 5-point recovery checklist. | You unlock your smart wallet with FaceID on Base and check whether another network supports passkeys before sending funds there. |
| 06 | `/tools/userop-autopsy` | Breaks down smart-wallet (ERC-4337) receipts to compare real network gas costs against what the bundler or paymaster actually billed you. | Your smart wallet charged $3 in gas/USDC when the network was quiet; paste the TX hash to see the exact extra markup percentage. |
| 07 | `/tools/x402-paywallguard` | Scans AI agent payment packages (x402), login/payment code, spending limits (ERC-7715), and HTTP logs for known bugs and failed paid calls. | You run an AI agent that pays for API calls with USDC and check its lockfile, middleware code, and spending limits before deploying. |
| 08 | `/tools/intentlens-7683` | Reads cross-chain intent swaps (ERC-7683) in plain language, calculates the hidden solver fee spread, checks deadlines, and prepares refund data. | You bridged 1,000 USDC from Ethereum to Base and either received less than expected or the swap timed out past its deadline. |
| 09 | `/tools/stealthaudit-5564` | Uses only your read-only viewing key to scan a block range for private EIP-5564 stealth payments and exports a key-free report for taxes or heirs. | Someone paid you via a privacy stealth address and your tax advisor needs a list of incoming payments without exposing your spending key. |
| 10 | `/tools/bundlewatch-ens` | Compares the scripts running on a Web3 app website against its official ENS record and release file hashes, and flags weak single-key ENS ownership. | Before signing a big swap on a DeFi website, verify that its live scripts match the official ENS release and no extra domains were injected. |

## Development

```bash
npm ci             # Node >= 22.23.4 (Astro 7)
npm run dev        # dev server
npm run build      # production build into dist/
npm run preview    # serve dist/ locally
npm run audit      # policy audit over dist/ (after build)
npm run test:demos # 142-check demo regression of all 10 modules
npm run test:beta  # 70-check beta suite: adversarial lib tests + SSR render smoke of all 10 tools + live npm/RPC paths
npm run test:interact # 60-check interaction suite (happy-dom): (1) demo → run → outcome per tool, (2) run without input → validation feedback, (3) cross-check verdicts with mocked chain (match ✓ / MISMATCH), (4) export flows produce valid JSON/CSV/print downloads
npm run verify     # full pipeline: typecheck + build + audit-dist + audit:deps + test:demos + test:beta + test:interact
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
