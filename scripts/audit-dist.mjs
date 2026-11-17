#!/usr/bin/env node
/**
 * Phase-5 audit for dist/:
 *  1) negative keyword grep (banned terms in visible HTML/text files)
 *  2) donation addresses: character-exact presence (SOL/BTC/ETH)
 *  3) homepage/legal bundle audit: /index.html must not reference tool/WASM/crypto chunks
 *  4) sitemap + robots.txt + llms.txt presence
 * Exit != 0 on any finding.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL ' + msg); };
const ok = (msg) => console.log(' OK  ' + msg);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const txtAndJson = files.filter((f) => /\.(html|txt|xml|json|webmanifest)$/.test(f));

// ---------------------------------------------------------------- 1) negative keywords
// Terms that neither UI nor meta/marketing may contain (price promises, infrastructure names).
// Note: the BANNED list itself intentionally stays German-language (legacy marketing terms).
const BANNED = [
  /kostenlos/i, /gratis/i, /nulltarif/i, /\b0\s?euro\b/i, /\bfor free\b/i, /free of charge/i, /no cost/i,
  /no[- ]?charge/i, /free[- ]?tier/i, /kostenlosem?\s/i,
  /alchemy/i, /infura/i, /quicknode/i, /ankr\.com/i, /llamarpc/i, /cloudflare-eth/i, /vercel/i, /netlify/i,
  /cloudflare pages/i, /github pages/i, /amazonaws/i, /azure/i, /google cloud/i,
];
for (const f of txtAndJson) {
  const text = readFileSync(f, 'utf8');
  for (const rx of BANNED) {
    if (rx.test(text)) fail(`${relative(DIST, f)} contains a banned term: ${rx}`);
  }
}
ok(`negative keyword grep across ${txtAndJson.length} files complete`);

// ---------------------------------------------------------------- 2) donation addresses character-exact
const EXPECTED = {
  sol: '79KsqtJJdhKFJ9woxnYgtf3nq7HxQveafWBCtC3mxWi8',
  btc: 'bc1qeqzrlfg3edrydk4s0hecakc82gp26n5p7hkc7f',
  eth: '0xBC3fab34f69bc9f6661608C3FB36dDdC313C42F7',
};
const allText = files
  .filter((f) => /\.(html|js|txt|json)$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
for (const [k, addr] of Object.entries(EXPECTED)) {
  if (!allText.includes(addr)) fail(`donation address ${k} not found character-exact in dist/`);
  else ok(`donation address ${k} present exactly`);
}
// no old/typo variants: check lowercase collisions of other ETH variants
const ethLower = EXPECTED.eth.toLowerCase();
const ethVariants = new Set(allText.match(/0xBC3fab34f69bc9f6661608[cC]3[fF]B36dDdC313C42F7/gi) ?? []);
for (const v of ethVariants) if (v !== EXPECTED.eth && v !== ethLower) fail(`ETH address variant with diverging checksum: ${v}`);

// ---------------------------------------------------------------- 3) homepage bundle audit
const home = readFileSync(join(DIST, 'index.html'), 'utf8');
// all JS/WASM/CSS references — including nested ones (the Astro island renderer references paths inside script content)
const referenced = [
  ...new Set(
    [
      ...[...home.matchAll(/(?:src|href)="([^"]+\.(?:js|wasm|css)[^"]*)"/g)].map((m) => m[1]),
      ...[...home.matchAll(/_astro\/[A-Za-z0-9._-]+\.(?:js|wasm|css)/g)].map((m) => '/' + m[0]),
    ],
  ),
];
const HEAVY = /(worker|noble|viem|bitcoinjs|bip322|secp|stealth|iron|groth|snark|wasm|lib-btc|lib-evm)/i;
const heavyRef = referenced.filter((r) => HEAVY.test(r));
if (heavyRef.length) fail(`index.html references heavy chunks: ${heavyRef.join(', ')}`);
else ok('index.html references no tool/WASM chunks');

// total homepage JS weight
let homeJsBytes = 0;
for (const r of referenced.filter((x) => x.endsWith('.js') || x.includes('.js?'))) {
  const clean = r.split('?')[0].replace(/^\//, '');
  const p = join(DIST, clean);
  if (existsSync(p)) homeJsBytes += statSync(p).size;
}
const KB = 1024;
if (homeJsBytes > 300 * KB) fail(`homepage JS too heavy: ${(homeJsBytes / KB).toFixed(0)} KB (limit 300 KB)`);
else ok(`homepage JS initial: ${(homeJsBytes / KB).toFixed(0)} KB (limit 300 KB)`);

// ---------------------------------------------------------------- 4) mandatory artifacts
for (const must of ['sitemap-index.xml', 'robots.txt', 'llms.txt', 'agb/index.html', 'disclaimer/index.html', 'datenschutz/index.html']) {
  if (!existsSync(join(DIST, must))) fail(`mandatory artifact missing: ${must}`);
  else ok(`artifact present: ${must}`);
}

// CSP meta on every HTML page + wasm-unsafe-eval
for (const f of htmlFiles) {
  const h = readFileSync(f, 'utf8');
  if (!/Content-Security-Policy/i.test(h)) fail(`${relative(DIST, f)} without CSP meta`);
  else if (!/wasm-unsafe-eval/.test(h)) fail(`${relative(DIST, f)} CSP without wasm-unsafe-eval`);
}
ok(`CSP checked in ${htmlFiles.length} HTML pages`);

// ---------------------------------------------------------------- 5) HTML structure checks
const titles = new Map();
for (const f of htmlFiles) {
  const h = readFileSync(f, 'utf8');
  const rel = relative(DIST, f);
  const h1s = [...h.matchAll(/<h1[\s>]/g)].length;
  if (h1s !== 1) fail(`${rel}: ${h1s} <h1> (expected: exactly 1)`);
  const ids = [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) fail(`${rel}: duplicate IDs: ${[...new Set(dup)].join(', ')}`);
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch (e) {
      fail(`${rel}: JSON-LD not parseable: ${(e).message}`);
    }
  }
  const t = h.match(/<title>([^<]*)<\/title>/)?.[1];
  if (t) {
    if (titles.has(t)) fail(`title duplicate: '${t}' in ${rel} and ${titles.get(t)}`);
    titles.set(t, rel);
  }
}
ok(`HTML structure: ${htmlFiles.length} pages (h1/IDs/JSON-LD/title duplicates)`);

// ---------------------------------------------------------------- 6) llms.txt content
const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
if (!llms.includes('hippie.highho@gmail.com')) fail('llms.txt without contact email');
if (!llms.includes('AndrexTheDev')) fail('llms.txt without brand');
const TOOLSLUGS = ['7702-slotguard','stva-upgradediff','dac8-selfproof','bitvault-stress','passkey-continuity','userop-autopsy','x402-paywallguard','intentlens-7683','stealthaudit-5564','bundlewatch-ens'];
for (const t of TOOLSLUGS) if (!llms.includes(t)) fail(`llms.txt does not mention ${t}`);
ok('llms.txt: brand, contact, all 10 tools referenced');

// ---------------------------------------------------------------- 7) tool page budgets & noscript
for (const slug of TOOLSLUGS) {
  const f = join(DIST, 'tools', slug, 'index.html');
  if (!existsSync(f)) continue;
  const h = readFileSync(f, 'utf8');
  if (!h.includes('<noscript')) fail(`tools/${slug}: no noscript fallback`);
  const refs = [
    ...new Set([
      ...[...h.matchAll(/(?:src|href)="([^"]+\.(?:js|wasm)[^"]*)"/g)].map((m) => m[1]),
      ...[...h.matchAll(/_astro\/[A-Za-z0-9._-]+\.(?:js)/g)].map((m) => '/' + m[0]),
    ]),
  ];
  let bytes = 0;
  for (const r of refs) {
    const pth = join(DIST, r.split('?')[0].replace(/^\//, ''));
    if (existsSync(pth)) bytes += statSync(pth).size;
  }
  if (bytes > 400 * KB) fail(`tools/${slug}: ${(bytes / KB).toFixed(0)} KB initial JS (limit 400 KB)`);
}
ok('tool pages: noscript present, initial JS <= 400 KB');

// ---------------------------------------------------------------- 8) security.txt (RFC 9116)
{
  const sec = join(DIST, '.well-known', 'security.txt');
  if (!existsSync(sec)) fail('.well-known/security.txt missing in the build');
  else {
    const t = readFileSync(sec, 'utf8');
    const exp = t.match(/^Expires:\s*(.+)$/m)?.[1]?.trim();
    if (!exp) fail('security.txt without an Expires field');
    const expDate = exp ? new Date(exp) : null;
    if (!expDate || Number.isNaN(expDate.getTime())) fail('security.txt Expires not parseable');
    else if (expDate.getTime() < Date.now()) fail('security.txt Expires has passed');
  }
  ok('security.txt present, Expires valid');
}

console.log(failures ? `\n${failures} finding(s) — audit NOT passed` : '\nAudit passed');
process.exit(failures ? 1 : 0);
