# AndrexTheDev — Web3 Security & Forensics Suite

Zehn spezialisierte Web3-, Bitcoin- und Compliance-Werkzeuge, vollständig **lokal im Browser** ausgeführt: keine Konten, kein Server-Upload, keine Tracking-Pixel. Static-Site-Generierung mit **Astro 6 + React-Islands + TypeScript + Tailwind 4**.

## Werkzeuge

| # | Route | Zweck |
|---|-------|-------|
| 01 | `/tools/7702-slotguard` | EIP-7702-Delegationen, Storage-Kollisionen, Panic-Revoke-Paket |
| 02 | `/tools/stva-upgradediff` | Drei-Ebenen-Prüfung von Safe-/Proxy-Upgrades |
| 03 | `/tools/dac8-selfproof` | BIP-322 / EIP-191/712 / ERC-1271 Eigenübertrag-Nachweise |
| 04 | `/tools/bitvault-stress` | Miniscript-Tresore, vByte, Dust-Klippe, Gebühren-Heatmap |
| 05 | `/tools/passkey-continuity` | WebAuthn/P-256 Multi-Chain, RIP-7212-Erkennung |
| 06 | `/tools/userop-autopsy` | Bundler-Marge & Paymaster-Spread aus EntryPoint-Logs |
| 07 | `/tools/x402-paywallguard` | x402-Middleware-Schwachstellen, SIWX-Scanner, ERC-7715-Radar |
| 08 | `/tools/intentlens-7683` | ERC-7683-Intents dekodieren, Spread, Refund-Calldata |
| 09 | `/tools/stealthaudit-5564` | EIP-5564 Viewing-Key-Scan im WebWorker (kein Export von Keys) |
| 10 | `/tools/bundlewatch-ens` | dApp-Frontend-Integrität gegen ENS-contenthash & Releases |

## Entwicklung

```bash
npm ci             # Node >= 22 (Astro 6)
npm run dev        # Dev-Server
npm run build      # Produktions-Build nach dist/
npm run preview    # dist/ lokal ausliefern
npm run audit      # Policy-Audit ueber dist/ (nach Build)
npm run test:demos # 123-Check Demo-Regression aller 10 Module
npm run verify     # Gesamtpipeline: typecheck + build + audit + test:demos
```

## Architektur-Regeln (safety invariants)

- **Keine Server-Logik**: `output: 'static'`, keine API-Routen, keine CSR-Only-Geheimnisse.
- **Route-Level Code-Splitting**: schwere Krypto-Module (`viem`, `@noble/*`, `bitcoinjs-lib`, `bip322-js`) werden ausschließlich per dynamischem `import()` aus Tool-Islands gezogen — siehe `manualChunks` in `astro.config.mjs`.
- **Landing + Recht = 0 KB JS**: `BaseLayout shell="static"` unterdrückt die `GlobalApp`-Hydration; nur Tool-Seiten nutzen `shell="interactive"`.
- **Keine Seed-Phrasen/private Keys**: BitVault-Stress blockt Mnemonics aktiv; StealthAudit akzeptiert nur Viewing Keys und exportiert niemals Schlüsselmaterial.
- **Offline-first**: Jedes Modul hat manuelle Eingabe- bzw. Datei-Fallbacks; RPC-Endpunkte sind nutzersetzbar (`RpcPanel`, persistiert lokal).
- **Deterministik**: Risiko-Scores und Schwellenwerte sind fix im Modul-Code dokumentiert.

## Phase-5-Audit

`scripts/audit-dist.mjs` prüft nach dem Build:

1. Negativ-Keywords in sichtbaren Texten (Preis-/Gratisbegriffe, konkrete Infrastruktur-Namen),
2. zeichenexakte Spenden-Adressen (SOL/BTC/ETH + Checksummen-Kollisionen),
3. Homepage-Bundle (keine Tool-/WASM-Chunks, JS-Budget ≤ 300 KB),
4. Pflicht-Artefakte (sitemap, robots.txt, llms.txt, Rechtsseiten, CSP mit `wasm-unsafe-eval`).

## Rechtliches

AGB, Disclaimer und Datenschutz-Transparenz: siehe `/agb`, `/disclaimer`, `/datenschutz`.
Kontakt: **hippie.highho@gmail.com** · Spenden freiwillig (SOL/BTC/EVM, siehe `/donate`).
