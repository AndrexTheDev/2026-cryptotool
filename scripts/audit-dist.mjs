#!/usr/bin/env node
/**
 * Phase-5-Audit fuer dist/:
 *  1) Negativ-Keyword-Grep (verbotene Begriffe in sichtbaren HTML/Textdateien)
 *  2) Spenden-Adressen: character-exact vorhanden (SOL/BTC/ETH)
 *  3) Homepage-/Legal-Bundle-Audit: /index.html darf keine Tool-/WASM-/Crypto-Chunks referenzieren
 *  4) Sitemap- + robots.txt- + llms.txt-Vorhandensein
 * Exit != 0 bei jedem Befund.
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

// ---------------------------------------------------------------- 1) Negativ-Keywords
// Begriffe, die weder UI noch Meta/Marketing enthalten duerfen (Preis-Versprechen, Infrastruktur-Namen).
const BANNED = [
  /kostenlos/i, /gratis/i, /nulltarif/i, /\b0\s?euro\b/i, /\bfor free\b/i, /free of charge/i, /no cost/i,
  /no[- ]?charge/i, /free[- ]?tier/i, /kostenlosem?\s/i,
  /alchemy/i, /infura/i, /quicknode/i, /ankr\.com/i, /llamarpc/i, /cloudflare-eth/i, /vercel/i, /netlify/i,
  /cloudflare pages/i, /github pages/i, /amazonaws/i, /azure/i, /google cloud/i,
];
for (const f of txtAndJson) {
  const text = readFileSync(f, 'utf8');
  for (const rx of BANNED) {
    if (rx.test(text)) fail(`${relative(DIST, f)} enthaelt verbotenen Begriff: ${rx}`);
  }
}
ok(`Negativ-Keyword-Grep ueber ${txtAndJson.length} Dateien abgeschlossen`);

// ---------------------------------------------------------------- 2) Spenden-Adressen character-exact
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
  if (!allText.includes(addr)) fail(`Spenden-Adresse ${k} nicht character-exact in dist/ gefunden`);
  else ok(`Spenden-Adresse ${k} exakt vorhanden`);
}
// keine alten/typo-Varianten: lowercase-Kollisionen anderer ETH-Varianten prüfen
const ethLower = EXPECTED.eth.toLowerCase();
const ethVariants = new Set(allText.match(/0xBC3fab34f69bc9f6661608[cC]3[fF]B36dDdC313C42F7/gi) ?? []);
for (const v of ethVariants) if (v !== EXPECTED.eth && v !== ethLower) fail(`ETH-Adress-Variante mit abweichender Checksumme: ${v}`);

// ---------------------------------------------------------------- 3) Homepage Bundle-Audit
const home = readFileSync(join(DIST, 'index.html'), 'utf8');
// Alle JS/WASM/CSS-Referenzen — auch verschachtelte (Astro-Island-Renderer referenziert Pfade im Skript-Inhalt)
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
if (heavyRef.length) fail(`index.html referenziert schwere Chunks: ${heavyRef.join(', ')}`);
else ok('index.html referenziert keine Tool-/WASM-Chunks');

// Homepage-JS-Gesamtgewicht
let homeJsBytes = 0;
for (const r of referenced.filter((x) => x.endsWith('.js') || x.includes('.js?'))) {
  const clean = r.split('?')[0].replace(/^\//, '');
  const p = join(DIST, clean);
  if (existsSync(p)) homeJsBytes += statSync(p).size;
}
const KB = 1024;
if (homeJsBytes > 300 * KB) fail(`Homepage-JS zu schwer: ${(homeJsBytes / KB).toFixed(0)} KB (Limit 300 KB)`);
else ok(`Homepage-JS initial: ${(homeJsBytes / KB).toFixed(0)} KB (Limit 300 KB)`);

// ---------------------------------------------------------------- 4) Pflicht-Artefakte
for (const must of ['sitemap-index.xml', 'robots.txt', 'llms.txt', 'agb/index.html', 'disclaimer/index.html', 'datenschutz/index.html']) {
  if (!existsSync(join(DIST, must))) fail(`Pflicht-Artefakt fehlt: ${must}`);
  else ok(`Artefakt vorhanden: ${must}`);
}

// CSP-Meta auf jeder HTML-Seite + wasm-unsafe-eval
for (const f of htmlFiles) {
  const h = readFileSync(f, 'utf8');
  if (!/Content-Security-Policy/i.test(h)) fail(`${relative(DIST, f)} ohne CSP-Meta`);
  else if (!/wasm-unsafe-eval/.test(h)) fail(`${relative(DIST, f)} CSP ohne wasm-unsafe-eval`);
}
ok(`CSP in ${htmlFiles.length} HTML-Seiten geprueft`);

// ---------------------------------------------------------------- 5) HTML-Struktur-Checks
const titles = new Map();
for (const f of htmlFiles) {
  const h = readFileSync(f, 'utf8');
  const rel = relative(DIST, f);
  const h1s = [...h.matchAll(/<h1[\s>]/g)].length;
  if (h1s !== 1) fail(`${rel}: ${h1s} <h1> (erwartet: genau 1)`);
  const ids = [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  if (dup.length) fail(`${rel}: doppelte IDs: ${[...new Set(dup)].join(', ')}`);
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(m[1]);
    } catch (e) {
      fail(`${rel}: JSON-LD nicht parsebar: ${(e).message}`);
    }
  }
  const t = h.match(/<title>([^<]*)<\/title>/)?.[1];
  if (t) {
    if (titles.has(t)) fail(`Titel-Duplikat: '${t}' in ${rel} und ${titles.get(t)}`);
    titles.set(t, rel);
  }
}
ok(`HTML-Struktur: ${htmlFiles.length} Seiten (h1/IDs/JSON-LD/Titel-Duplikate)`);

// ---------------------------------------------------------------- 6) llms.txt-Inhalt
const llms = readFileSync(join(DIST, 'llms.txt'), 'utf8');
if (!llms.includes('hippie.highho@gmail.com')) fail('llms.txt ohne Kontakt-E-Mail');
if (!llms.includes('AndrexTheDev')) fail('llms.txt ohne Brand');
const TOOLSLUGS = ['7702-slotguard','stva-upgradediff','dac8-selfproof','bitvault-stress','passkey-continuity','userop-autopsy','x402-paywallguard','intentlens-7683','stealthaudit-5564','bundlewatch-ens'];
for (const t of TOOLSLUGS) if (!llms.includes(t)) fail(`llms.txt nennt ${t} nicht`);
ok('llms.txt: Brand, Kontakt, alle 10 Tools referenziert');

// ---------------------------------------------------------------- 7) Tool-Seiten-Budgets & noscript
for (const slug of TOOLSLUGS) {
  const f = join(DIST, 'tools', slug, 'index.html');
  if (!existsSync(f)) continue;
  const h = readFileSync(f, 'utf8');
  if (!h.includes('<noscript')) fail(`tools/${slug}: kein noscript-Fallback`);
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
  if (bytes > 400 * KB) fail(`tools/${slug}: ${(bytes / KB).toFixed(0)} KB initiales JS (Limit 400 KB)`);
}
ok('Tool-Seiten: noscript vorhanden, initiales JS <= 400 KB');

// ---------------------------------------------------------------- 8) security.txt (RFC 9116)
{
  const sec = join(DIST, '.well-known', 'security.txt');
  if (!existsSync(sec)) fail('.well-known/security.txt fehlt im Build');
  else {
    const t = readFileSync(sec, 'utf8');
    const exp = t.match(/^Expires:\s*(.+)$/m)?.[1]?.trim();
    if (!exp) fail('security.txt ohne Expires-Feld');
    const expDate = exp ? new Date(exp) : null;
    if (!expDate || Number.isNaN(expDate.getTime())) fail('security.txt Expires nicht parsebar');
    else if (expDate.getTime() < Date.now()) fail('security.txt Expires ist abgelaufen');
  }
  ok('security.txt vorhanden, Expires gueltig');
}

console.log(failures ? `\n${failures} Befund(e) — Audit NICHT bestanden` : '\nAudit bestanden');
process.exit(failures ? 1 : 0);
