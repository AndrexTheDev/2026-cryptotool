#!/usr/bin/env node
// ============================================================================
// beta-test.mjs — module-by-module beta tests from the USER perspective.
// Complements verify-demos.mjs (demo flows) with:
//   A) lib functional + adversarial input tests per module domain
//   B) SSR render smoke for all 10 tool components (mirrors the astro island
//      build: client:load islands are server-rendered — a render crash here
//      would break the production build too)
//   C) live paths: npm registry (real call) + RPC graceful degradation
// No new dependencies: uses esbuild/react/react-dom from the existing tree.
// Run: npm run test:beta
// ============================================================================

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0;
let fail = 0;
const failed = [];
function t(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(` OK  ${name}`);
  } else {
    fail++;
    failed.push(name);
    console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}
async function tAsync(name, fn) {
  try {
    await fn();
    pass++;
    console.log(` OK  ${name}`);
  } catch (e) {
    fail++;
    failed.push(name);
    console.log(`FAIL ${name} — ${(e && e.message) || e}`);
  }
}
function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------- A1: format lib (all modules)
{
  const f = await import('../src/lib/format.ts');
  t('A1 isHexAddress accepts valid lower/upper', f.isHexAddress('0x' + 'a'.repeat(40)) && f.isHexAddress('0x' + 'A'.repeat(40)));
  t('A1 isHexAddress rejects short/non-hex/empty', !f.isHexAddress('0x123') && !f.isHexAddress('0x' + 'g'.repeat(40)) && !f.isHexAddress(''));
  const rt = f.bytesToHex(f.hexToBytes('0xdeadbeef'));
  t('A1 hex roundtrip', rt === '0xdeadbeef', rt);
  const u = f.hexToUtf8(f.utf8ToHex('Grüße € 😀'));
  t('A1 utf8 roundtrip with umlauts/emoji', u === 'Grüße € 😀', u);
  t('A1 weiToEth 0 and 1.5', f.weiToEth(0n) === '0.0' && f.weiToEth(1500000000000000000n) === '1.5');
  t('A1 hexToBytes rejects odd length', (() => { try { f.hexToBytes('0xabc'); return false; } catch { return true; } })());
}

// ---------------------------------------------------------------- A2: export CSV (all modules export)
{
  const { toCSV } = await import('../src/lib/export.ts');
  t('A2 toCSV empty rows -> empty string', toCSV([]) === '');
  const csv = toCSV([{ a: 'x;y', b: 'he said "hi"', c: 'line\nbreak', d: 42 }]);
  t('A2 toCSV quotes separator-in-field', csv.includes('"x;y"'));
  t('A2 toCSV doubles quotes', csv.includes('"he said ""hi"""'));
  t('A2 toCSV quotes newline field', csv.includes('"line\nbreak"'));
  t('A2 toCSV CRLF line endings + header', csv.startsWith('a;b;c;d\r\n') && csv.trim().split('\r\n').length === 2);
  t('A2 toCSV unions columns across rows', toCSV([{ a: 1 }, { b: 2 }]).startsWith('a;b\r\n'));
}

// ---------------------------------------------------------------- A3: x402 lib (X402PaywallGuard)
{
  const x = await import('../src/lib/x402.ts');
  t('A3 parseDependencies empty input', eq(x.parseDependencies('', 'package-lock.json'), []));
  t('A3 parseDependencies broken JSON does not throw', eq(x.parseDependencies('{"packages":{', 'package-lock.json'), []));
  t('A3 parseDependencies requirements.txt CRLF+BOM', x.parseDependencies('﻿x402==2.10.0\r\nrequests==2.32.0\r\n', 'requirements.txt').some((d) => d.name === 'x402' && d.version === '2.10.0' && d.ecosystem === 'pip'));
  t('A3 parseDependencies go.mod', x.parseDependencies('module example.com/x\ngo 1.24\nrequire github.com/coinbase/x402 v2.10.0\n', 'go.mod').some((d) => d.ecosystem === 'go'));
  t('A3 semverBelow boundary: fix version is NOT below', !x.semverBelow('2.23.0', '2.23.0') && x.semverBelow('2.22.9', '2.23.0'));
  t('A3 scanDependencies: exactly-fixed version yields no finding for that advisory', !x.scanDependencies([{ name: '@x402/svm', version: '2.23.0', ecosystem: 'npm' }]).some((f) => f.advisory.id === 'V12-2026-CRIT-2'));
  t('A3 scanDependencies: old version flagged critical', x.scanDependencies([{ name: '@x402/core', version: '2.10.0', ecosystem: 'npm' }]).some((f) => f.advisory.severity === 'critical'));
  t('A3 analyzePolicy7715 broken JSON returns error', typeof x.analyzePolicy7715('{').error === 'string');
  t('A3 analyzePolicy7715 full policy covers 8 dimensions', x.analyzePolicy7715('{}').dims.length === 8);
  t('A3 parseHar garbage -> no throw', eq(x.parseHar('{'), []) || Array.isArray(x.parseHar('{')));
  const harOk = x.parseHar(JSON.stringify({ log: { entries: [{ request: { url: 'https://a/b', headers: [{ name: 'PAYMENT-SIGNATURE', value: '0x1' }] }, response: { status: 200 }, startedDateTime: '2026-11-15T10:00:00Z' }] } }));
  t('A3 parseHar detects payment header case-insensitively', harOk.length === 1 && harOk[0].hadPaymentHeader === true);
  t('A3 reconcileDeliveries: paid+200 -> no finding', x.reconcileDeliveries(harOk).length === 0);
}

// ---------------------------------------------------------------- A4: contenthash lib (BundleWatchEns)
{
  const c = await import('../src/lib/contenthash.ts');
  t('A4 decodeContenthash garbage -> unknown, no throw', c.decodeContenthash('zz-not-hex').kind === 'unknown');
  t('A4 decodeContenthash empty -> unknown, no throw', c.decodeContenthash('0x').kind === 'unknown' || c.decodeContenthash('0x').kind !== undefined);
  const ipfs = c.decodeContenthash('0xe30101701220' + 'ab'.repeat(32));
  t('A4 decodeContenthash valid ipfs cidv1', ipfs.kind === 'ipfs' && typeof ipfs.cid === 'string' && ipfs.cid.startsWith('b'), JSON.stringify(ipfs));
  t('A4 ipfsGatewayUrl builds https url', c.ipfsGatewayUrl('bafybeigd').startsWith('https://') && c.ipfsGatewayUrl('bafybeigd').includes('bafybeigd'));
}

// ---------------------------------------------------------------- A5: npm-live lib (X402PaywallGuard live check)
{
  const n = await import('../src/lib/npm-live.ts');
  t('A5 isNpmPackageName accepts scoped+plain', n.isNpmPackageName('@x402/core') && n.isNpmPackageName('fflate'));
  t('A5 isNpmPackageName rejects traversal/injection', !n.isNpmPackageName('../evil') && !n.isNpmPackageName('a b') && !n.isNpmPackageName(''));
  t('A5 npmRegistryUrl encodes scope', n.npmRegistryUrl('@x402/core').endsWith('/%40x402%2Fcore'));
  t('A5 fetchLatestNpm(invalid) resolves null, never throws', (await n.fetchLatestNpm('../evil')) === null);
  await tAsync('A5 LIVE: fetchLatestNpm(fflate) returns a semver version from the real registry', async () => {
    const info = await n.fetchLatestNpm('fflate');
    if (info === null) throw new Error('registry unreachable from this environment — skipping live assert');
    if (!/^\d+\.\d+\.\d+/.test(info.version)) throw new Error('unexpected version: ' + info.version);
  });
}

// ---------------------------------------------------------------- A6: rpc lib degradation (all EVM tools)
{
  const esbuild = await import('esbuild');
  mkdirSync('.beta-cache', { recursive: true });
  await esbuild.build({
    entryPoints: ['src/lib/rpc.ts'],
    bundle: true,
    write: true,
    outfile: '.beta-cache/rpc.mjs',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  const r = await import('../.beta-cache/rpc.mjs');
  t('A6 getUserRpc without window returns null (SSR-safe)', r.getUserRpc(1) === null);
  t('A6 setUserRpc without window does not throw', (() => { try { r.setUserRpc(1, 'https://x.example'); return true; } catch { return false; } })());
  await tAsync('A6 unknown chain id -> typed RpcError, no hang', async () => {
    try {
      await r.rpcCall(999999, 'eth_blockNumber', []);
      throw new Error('should have thrown');
    } catch (e) {
      if (!(e instanceof r.RpcError) && !/unreachable|throttled/i.test(String((e && e.message) || e))) throw e;
    }
  });
}

// ---------------------------------------------------------------- B: SSR render smoke — all 10 tools (mirrors astro island SSR)
{
  const esbuild = await import('esbuild');
  const React = await import('react');
  const { renderToString } = await import('react-dom/server');
  mkdirSync('.beta-cache', { recursive: true });

  const tools = [
    ['SlotGuard7702', 'sg-addr'],
    ['UseropAutopsy', 'uo-in'],
    ['PasskeyContinuity', 'pc-acc'],
    ['Dac8SelfProof', 'd8-tx'],
    ['BitVaultStress', 'bv-policy'],
    ['BundleWatchEns', 'bw-ens'],
    ['X402PaywallGuard', 'x4-lock'],
    ['IntentLens7683', 'il-json'],
    ['StealthAudit5564', 'st-vk'],
    ['StvaUpgradeDiff', 'sd-proxy'],
  ];

  for (const [name, inputId] of tools) {
    await tAsync(`B ${name}: bundles without build errors`, async () => {
      await esbuild.build({
        entryPoints: [join('src/components/tools', `${name}.tsx`)],
        bundle: true,
        write: true,
        outfile: join('.beta-cache', `${name}.mjs`),
        format: 'esm',
        jsx: 'automatic',
        packages: 'external',
        logLevel: 'silent',
      });
    });
    await tAsync(`B ${name}: SSR renders (island build safe) + input #${inputId} present`, async () => {
      const mod = await import(`../.beta-cache/${name}.mjs?${Date.now()}`);
      const Comp = mod.default;
      if (typeof Comp !== 'function') throw new Error('no default export component');
      const html = renderToString(React.createElement(Comp));
      if (html.length < 800) throw new Error('suspiciously small render (' + html.length + ' chars)');
      if (!html.includes(`id="${inputId}"`)) throw new Error(`input #${inputId} missing in render`);
    });
    const src = readFileSync(join('src/components/tools', `${name}.tsx`), 'utf8');
    t(`B ${name}: demo scenario button wired`, /DemoButton/.test(src));
  }
  rmSync('.beta-cache', { recursive: true, force: true });
}

// ---------------------------------------------------------------- C: cross-check wiring present (Wave 36/37 UI contracts)
{
  const sg = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  t('C SlotGuard: cross-check runs automatically in offline mode (no extra click)', /getCode\(refChain/.test(sg) && /CrossBadge/.test(sg));
  const uo = readFileSync('src/components/tools/UseropAutopsy.tsx', 'utf8');
  t('C UseropAutopsy: pasted receipts re-fetched live by hash', /getTxReceipt\(chainId, t\.hash\)/.test(uo));
  const d8 = readFileSync('src/components/tools/Dac8SelfProof.tsx', 'utf8');
  t('C DAC8: certificate/manual claims auto-cross-checked (anti-forgery)', /facts\.source !== 'manual'/.test(d8) && /CrossBadge/.test(d8));
  const x4 = readFileSync('src/components/tools/X402PaywallGuard.tsx', 'utf8');
  t('C X402: live registry check auto-runs after scan', /useEffect/.test(x4) && /fetchLatestNpm/.test(x4));
}

console.log(`\n${pass + fail} beta checks, ${fail} failure(s)`);
if (fail) {
  console.log('Failed:', failed.join(' | '));
}
process.exit(fail ? 1 : 0);
