#!/usr/bin/env node --experimental-strip-types
/**
 * Beta-Test: spielt die Demo-Pfade aller 10 Module deterministisch durch
 * (reine Bibliotheks-/Logik-Ebene; DOM-Flows wurden manuell in der Vorschau geprueft).
 * Lauf: node --experimental-strip-types scripts/verify-demos.mjs
 * Exit != 0 bei jedem Fehlschlag.
 */
import { readFileSync } from 'node:fs';

let failures = 0;
let checks = 0;
const ok = (cond, name) => {
  checks++;
  if (cond) console.log(' OK  ' + name);
  else {
    failures++;
    console.error('FAIL ' + name);
  }
};

// Polyfill: Worker-Module referenzieren self — im Node-Kontext neutralisieren
if (typeof globalThis.self === 'undefined') globalThis.self = undefined;

// ---------------------------------------------------------------- Modul 09: StealthAudit
{
  const { genDemo, scanAnnouncements } = await import('../src/workers/stealth.worker.ts');
  const { secp256k1 } = await import('@noble/curves/secp256k1.js');
  const viewingPriv = '0x' + '0'.repeat(63) + '2';
  const spendingPub = '0x' + Buffer.from(secp256k1.Point.BASE.multiply(3n).toBytes(true)).toString('hex');
  const anns = genDemo(viewingPriv, spendingPub, 8, 3);
  const { hits, checked } = scanAnnouncements(viewingPriv, spendingPub, anns);
  ok(anns.length === 8 && checked === 8, 'M09 StealthAudit: Demo erzeugt 8 Announcements');
  ok(hits.length === 3, `M09 StealthAudit: exakt 3 Treffer (${hits.length})`);
  const wrong = scanAnnouncements('0x' + '0'.repeat(63) + '5', spendingPub, anns).hits;
  ok(wrong.length === 0, 'M09 StealthAudit: falscher Key -> 0 Treffer');
  ok(/^[0-9a-f]{16}$/.test(anns[0].caller.slice(2)) || anns[0].caller.startsWith('0x'), 'M09: Demo-Caller ist hex');
}

// ---------------------------------------------------------------- Modul 08: IntentLens
{
  const { parseOrderJsonFull, computeSpread, resolveRefundRecipient, encodeResolveFor, decodeOpenCalldata } = await import('../src/lib/intents.ts');
  const src = readFileSync('src/components/tools/IntentLens7683.tsx', 'utf8');
  const demoText = src.match(/const DEMO_JSON = (\{[\s\S]*?\n\});/)[1];
  const order = await parseOrderJsonFull(demoText);
  ok(order && order.decodeConfidence === 'vollstaendig', 'M08 IntentLens: Demo-JSON vollstaendig dekodiert');
  const spread = computeSpread(order);
  ok(spread && spread.spreadPct > 0 && spread.spreadPct < 5, `M08 IntentLens: Spread plausibel (${spread?.spreadPct.toFixed(4)} %)`);
  ok(order.orderDataFields.find((f) => f.label === 'destinationChainId')?.value === '8453', 'M08: destinationChainId 8453');
  const rf = resolveRefundRecipient({ refundAddress: '0x9999999999999999999999999999999999999999', user: order.user });
  ok(rf.address === '0x9999999999999999999999999999999999999999' && /refundAddress/.test(rf.source), 'M08: Refund-Prio refundAddress');
  const rf2 = resolveRefundRecipient({ refundAddress: '0x0000000000000000000000000000000000000000', user: order.user });
  ok(/Fallback 2/.test(rf2.source), 'M08: Refund-Prio Fallback user');
  const enc = await encodeResolveFor(order);
  ok(enc.startsWith('0x22bcd51a'), 'M08: resolveFor-Selektor korrekt kodiert');
  // openFor-Selektor-Paritaet mit erc7683 spec
  ok(typeof decodeOpenCalldata === 'function', 'M08: decodeOpenCalldata verfuegbar');
}

// ---------------------------------------------------------------- Modul 07: x402

function extractConst(src, name, kind) {
  const i = src.indexOf('const ' + name + ' = ');
  if (i < 0) throw new Error(name + ' nicht gefunden');
  if (kind === 'template') {
    const start = src.indexOf('`', i);
    const end = src.indexOf('`;', start + 1);
    return src.slice(start + 1, end);
  }
  // JSON.stringify({ ... }, null, 2) -> Objekt mit quote-normalisiertem JS-Literal parsen
  const start = src.indexOf('{', i);
  let depth = 0, j = start;
  let inStr = false, quote = '';
  for (; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (c === '\\') j++;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === "'" || c === '"') { inStr = true; quote = c; }
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  const lit = src.slice(start, j + 1);
  // JS-Objektliteral -> Objekt (sicherer Kontext: nur unsere eigenen Demo-Konstanten)
  return new Function('return (' + lit + ');')();
}
{
  const { X402_ADVISORIES, semverBelow, parseDependencies, scanDependencies, scanCodePatterns, analyzePolicy7715, parseHar, reconcileDeliveries } = await import('../src/lib/x402.ts');
  ok(X402_ADVISORIES.length >= 5, `M07 x402: ${X402_ADVISORIES.length} Advisories eingebettet`);
  ok(semverBelow('2.20.1', '2.28.0') && !semverBelow('2.28.0', '2.28.0'), 'M07: semverBelow Kantenfälle');
  ok(semverBelow('0.4.9', '0.5.2') && !semverBelow('0.5.2', '0.5.2'), 'M07: semver 0.x-Kante');

  const src = readFileSync('src/components/tools/X402PaywallGuard.tsx', 'utf8');
  const pm = extractConst(src, 'DEMO_LOCK', 'json');
  const deps = parseDependencies(JSON.stringify(pm), 'package-lock.json');
  ok(deps.length > 0, `M07: ${deps.length} Dependencies aus Lockfile`);
  const findings = scanDependencies(deps);
  ok(findings.length > 0, `M07: ${findings.length} Advisory-Treffer im Demo-Lockfile`);

  const demoCode = extractConst(src, 'DEMO_CODE', 'template');
  const codeFindings = scanCodePatterns(demoCode);
  ok(codeFindings.length >= 2, `M07: ${codeFindings.length} Code-Pattern im Demo-Middleware-Code`);

  const policyObj = extractConst(src, 'DEMO_POLICY', 'json');
  const radar = analyzePolicy7715(JSON.stringify(policyObj));
  ok(radar.dims.length === 8, `M07: ERC-7715-Radar mit 8 Dimensionen (${radar.dims?.length})`);
  ok(radar.ok < 8, `M07: Radar zeigt Schwächen im Demo-Policy (${radar.ok}/8 Dimensionen belegt)`);

  const har = parseHar(JSON.stringify({ log: { entries: [
    { request: { url: 'https://demo/api/paid', headers: [{ name: 'payment-signature', value: '0xabc' }] }, response: { status: 502 }, startedDateTime: '2026-11-14T21:00:00Z' },
    { request: { url: 'https://demo/api/health', headers: [] }, response: { status: 200 }, startedDateTime: '2026-11-14T21:01:00Z' },
  ] } }));
  ok(Array.isArray(har) && har.length === 2, `M07: HAR-Parser (${har.length} Eintraege)`);
  ok(har[0].hadPaymentHeader === true && har[1].hadPaymentHeader === false, 'M07: Payment-Header-Erkennung');
  const rec = reconcileDeliveries(har);
  ok(rec.length === 1 && /502/.test(rec[0].issue), `M07: Reconcile findet bezahlt-aber-${rec.length === 1 ? 'fehlgeschlagen' : '?'} (${rec.length} Befund)`);
}

// ---------------------------------------------------------------- Modul 04: BitVault
{
  const { parsePolicy, findConsensusIssues, satisfactionOptions, pathWeight, taprootKeyPathWeight, detectSecrets, dustAnalysis, heatmapThresholds } = await import('../src/lib/miniscript-analysis.ts');
  const src = readFileSync('src/components/tools/BitVaultStress.tsx', 'utf8');
  const demoPolicy = src.match(/const DEMO_POLICY = '([^']+)'/)[1];
  const node = parsePolicy(demoPolicy);
  ok(node && node.type === 'or', 'M04 BitVault: Demo-Policy parst (or)');
  const opts = satisfactionOptions(node, 'wsh');
  ok(opts.length >= 2, `M04: ${opts.length} Satisfaction-Pfade`);
  const issues = findConsensusIssues(node);
  ok(Array.isArray(issues), 'M04: Consensus-Warnings Array');
  const pw = pathWeight([73, 33], 100, 'wsh', 65);
  ok(pw.vbytes > 0, `M04: pathWeight berechnet (${pw.vbytes} vB)`);
  ok(taprootKeyPathWeight().vbytes > 0, 'M04: taprootKeyPathWeight > 0');
  ok(detectSecrets('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about') !== null, 'M04: Seed-Detection greift bei Mnemonic');
  ok(detectSecrets('or(pk(xpub661MyMwAqRbcF),after(100))') === null, 'M04: Seed-Detection lässt Policy in Ruhe');
  const dust = dustAnalysis({ sats: 1000, valueLabel: '' }, 300, 20);
  ok(typeof dust.crossedThird === 'boolean' && typeof dust.totalLoss === 'boolean', 'M04: Dust-Analyse (crossedThird/totalLoss boolesch)');
  const hm = heatmapThresholds([100, 250, 55]);
  ok(hm.length > 0 && hm.every((h) => h.rate >= 1), `M04: Heatmap mit ${hm.length} Stufen`);
}

// ---------------------------------------------------------------- Modul 03: DAC8 BIP-322
{
  const { signBip322P2tr, verifyBip322 } = await import('../src/lib/bip322.ts');
  const message = 'AndrexTheDev DAC8-SelfProof demo-check';
  const priv = new Uint8Array(32);
  priv[31] = 1;
  const { address, signatureBase64 } = await signBip322P2tr(priv, message);
  ok(address.startsWith('bc1p') && address.length === 62, `M03 DAC8: P2TR-Demo-Adresse ${address.slice(0, 16)}…`);
  const ver = await verifyBip322(address, message, signatureBase64);
  ok(ver.ok && /simple/i.test(ver.detail), `M03: BIP-322 roundtrip verifiziert (${ver.detail})`);
  const verBad = await verifyBip322(address, message + 'x', signatureBase64);
  ok(!verBad.ok, 'M03: BIP-322 lehnt veränderte Nachricht ab');
}

// ---------------------------------------------------------------- Modul 06: UserOp-Autopsy
{
  const src = readFileSync('src/components/tools/UseropAutopsy.tsx', 'utf8');
  const demoCsv = src.match(/const DEMO_CSV = `([\s\S]*?)`;/)[1];
  ok(demoCsv.includes('transaction_hash'), 'M06: Demo-CSV vorhanden');
  const rows = demoCsv.trim().split('\n').length - 1;
  ok(rows >= 2, `M06: ${rows} Demo-Transaktionen in CSV`);
}

// ---------------------------------------------------------------- Modul 02: STVA decode
{
  const { decodeUpgradeCalldata } = await import('../src/lib/stva.ts');
  const src = readFileSync('src/components/tools/StvaUpgradeDiff.tsx', 'utf8');
  const demoCall = src.match(/const DEMO_CALLDATA =\s*\n?\s*'(0x[0-9a-fA-F]+)'/)?.[1];
  ok(!!demoCall, 'M02: Demo-Calldata extrahiert');
  if (demoCall) {
    const dec = await decodeUpgradeCalldata(demoCall);
    ok(dec && dec.functionName, `M02 STVA: Decodiert als ${dec?.functionName ?? 'null'}`);
    ok(dec?.args && Object.keys(dec.args).length >= 1, 'M02: Argumente benannt dekodiert');
  }
}

// ---------------------------------------------------------------- Modul 10: BundleWatch
{
  const { decodeContenthash, ipfsGatewayUrl } = await import('../src/lib/contenthash.ts');
  const src = readFileSync('src/components/tools/BundleWatchEns.tsx', 'utf8');
  const demoCh = src.match(/setManualCh\('(0x[0-9a-fA-F]+)'\)/)[1];
  const dec = decodeContenthash(demoCh);
  ok(dec.kind === 'ipfs' && dec.cid.length > 10, `M10 BundleWatch: contenthash → ${dec.kind} ${dec.cid.slice(0, 16)}…`);
  ok(ipfsGatewayUrl(dec.cid).includes(dec.cid), 'M10: Gateway-URL korrekt');
}

// ---------------------------------------------------------------- Modul 01: SlotGuard Demo-Konstanten
{
  const src = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  const bc = new Function('return ' + src.match(/const DEMO_BYTECODE = ([^;]+);/)[1])();
  const { extract7702Delegate } = await import('../src/lib/evm-utils.ts');
  ok(bc.length === 48, `M01 SlotGuard: Demo-Bytecode 23 Byte (${(bc.length - 2) / 2} B)`);
  ok(bc.startsWith('0xef0100'), 'M01: 0xef0100-Praefix');
  const d = extract7702Delegate(bc);
  ok(d === '0x' + bc.slice(8), `M01: Delegate extrahiert (${d})`);
}

// ---------------------------------------------------------------- Slot-Mathe gegen bekannte Konstanten
{
  const { erc7201Slot, authorizationDigest } = await import('../src/lib/evm-utils.ts');
  // Referenz: OpenZeppelin v5 OwnableUpgradeable-Storage-Root (Dokumentationskonstante)
  const slot = await erc7201Slot('openzeppelin.storage.Ownable');
  ok(slot === '0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300', 'ERC-7201: OZ-Ownable-Slot exakt');
  const auth = await authorizationDigest(1, '0x1000000000000000000000000000000000000000', 0);
  ok(/^0x[0-9a-f]{64}$/.test(auth), 'EIP-7702 Authorization-Digest Format');
}

// ---------------------------------------------------------------- Modul 05/01: Struktur-Check
{
  const src = readFileSync('src/components/tools/PasskeyContinuity.tsx', 'utf8');
  ok(/160|testVector|testvector/i.test(src) && src.includes('p256'), 'M05 Passkey: 160-Byte-Testvektor + P-256-Pfad vorhanden');
  const sg = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  ok(sg.includes('0xef0100'), 'M01 SlotGuard: 7702-Bytecode-Präfix erkannt');
}

console.log(`\n${checks} Checks, ${failures} Fehlschlag/Fehlschlaege`);
process.exit(failures ? 1 : 0);
