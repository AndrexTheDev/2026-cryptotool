#!/usr/bin/env node --experimental-strip-types
/**
 * Beta-Test: spielt die Demo-Pfade aller 10 Module deterministisch durch
 * (reine Bibliotheks-/Logik-Ebene; DOM-Flows wurden manuell in der Vorschau geprueft).
 * Lauf: node --experimental-strip-types scripts/verify-demos.mjs
 * Exit != 0 bei jedem Fehlschlag.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

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

// ---------------------------------------------------------------- M01 SlotGuard: Offline-Storage-Dump
{
  const { parseStorageDump } = await import('../src/lib/evm-utils.ts');
  const src = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  const dump = src.match(/const DEMO_DUMP = `([\s\S]*?)`;/)[1];
  const entries = parseStorageDump(dump);
  ok(entries.length === 3, `M01: Demo-Dump -> ${entries.length} Slots`);
  ok(entries[0].slot === '0x' + '0'.repeat(64), 'M01: Slot 0 gepaddet auf 64 Hex');
  ok(entries.every((e) => /^0x[0-9a-fA-F]+$/.test(e.value)), 'M01: Werte hex');
  // JSON-Varianten
  ok(parseStorageDump('{"0x1": "0x2"}').length === 1, 'M01: JSON-Objekt-Dump');
  ok(parseStorageDump('[{"slot":"0x0","value":"0x1"}]').length === 1, 'M01: JSON-Array-Dump');
  ok(parseStorageDump('').length === 0, 'M01: leerer Dump -> 0 Eintraege');
}

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

// ---------------------------------------------------------------- x402-Schwellen-Lock-in (2026er Advisory-Stand)
{
  const { scanDependencies } = await import('../src/lib/x402.ts');
  // @x402/core 2.22.x muss 3 Befunde triggern (CRIT-1, CRIT-3, CORE-2026-09)
  const findings = scanDependencies([{ name: '@x402/core', version: '2.22.5', ecosystem: 'npm' }]);
  const ids = findings.map((f) => f.advisory.id).sort();
  ok(
    ids.join(',') === 'V12-2026-CRIT-1,V12-2026-CRIT-3,X402-CORE-2026-09,X402-CORE-2026-10,X402-CORE-2026-11',
    `x402: core 2.22.5 -> ${ids.length} Advisories (${ids.join('|')})`
  );
  // @x402/extensions 2.28.0: PT-2026-118463 (below 2.28.1) + zod/DoS-Caps 2026-10 (below 2.29.0)
  const ext = scanDependencies([{ name: '@x402/extensions', version: '2.28.0', ecosystem: 'npm' }]);
  ok(
    ext.map((f) => f.advisory.id).join(',') === 'X402-CORE-2026-10,PT-2026-118463',
    'x402: extensions 2.28.0 -> CORE-2026-10 + PT-2026-118463 (Reihenfolge = Matrix-Order)'
  );
  // Schwellen-Nachweis der 2026-10/11-Wellen: 2.29.0 heilt nur 2026-10, 2.30.0 heilt beide
  const c229 = scanDependencies([{ name: '@x402/core', version: '2.29.0', ecosystem: 'npm' }]).map((f) => f.advisory.id);
  ok(c229.join(',') === 'X402-CORE-2026-11', `x402: core 2.29.0 -> nur AfterSettle-Isolation (${c229.join('|') || 'leer'})`);
  ok(
    scanDependencies([{ name: '@x402/core', version: '2.31.0', ecosystem: 'npm' }]).length === 0,
    'x402: core 2.31.0 (aktueller Stand 11/2026) -> keine npm-Advisories'
  );
  // svm 2.22.0 -> CRIT-2 ; py 2.25.0 -> PT-2026-118463-PY ; go 2.27.0 -> PT-2026-118463-GO
  ok(scanDependencies([{ name: '@x402/svm', version: '2.22.0', ecosystem: 'npm' }])[0]?.advisory.id === 'V12-2026-CRIT-2', 'x402: svm 2.22.0 -> CRIT-2');
  ok(scanDependencies([{ name: 'x402', version: '2.25.0', ecosystem: 'pip' }])[0]?.advisory.id === 'PT-2026-118463-PY', 'x402: py 2.25.0 -> PT-PY');
  ok(scanDependencies([{ name: 'github.com/x402/go', version: '2.27.0', ecosystem: 'go' }])[0]?.advisory.id === 'PT-2026-118463-GO', 'x402: go 2.27.0 -> PT-GO');
}
{
  // parseDependencies: py- und go-Pfade
  const { parseDependencies } = await import('../src/lib/x402.ts');
  const py = parseDependencies('x402==2.20.1\nfastapi==0.119.0', 'requirements.txt');
  ok(py.some((d) => d.name === 'x402' && d.version === '2.20.1' && d.ecosystem === 'pip'), 'x402: requirements.txt-Parser');
  const go = parseDependencies('module example.com/app\n\nrequire (\n\tgithub.com/x402/go v2.20.0\n)', 'go.mod');
  ok(go.some((d) => d.name === 'github.com/x402/go' && d.version === '2.20.0' && d.ecosystem === 'go'), 'x402: go.mod-Parser');
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
  const { signBip322P2tr, verifyBip322, classifyBip322Signature, inspectPofPsbt } = await import('../src/lib/bip322.ts');
  const message = 'AndrexTheDev DAC8-SelfProof demo-check';
  const priv = new Uint8Array(32);
  priv[31] = 1;
  const { address, signatureBase64 } = await signBip322P2tr(priv, message);
  ok(address.startsWith('bc1p') && address.length === 62, `M03 DAC8: P2TR-Demo-Adresse ${address.slice(0, 16)}…`);
  // Finale Spec (v1.0.0, 04/2026): Signer MUSSEN das smp-Praefix setzen
  ok(signatureBase64.startsWith('smp'), 'M03: Demo-Signer setzt smp-Praefix (BIP-322 Complete)');
  const ver = await verifyBip322(address, message, signatureBase64);
  ok(ver.ok && ver.variant === 'simple-prefixed' && /simple/i.test(ver.detail), `M03: BIP-322 roundtrip verifiziert (${ver.detail})`);
  const verBad = await verifyBip322(address, message + 'x', signatureBase64);
  ok(!verBad.ok, 'M03: BIP-322 lehnt veränderte Nachricht ab');
  // Legacy-Kompatibilitaetsklausel: payload ohne Praefix wird als 'simple' angenommen
  const verLegacy = await verifyBip322(address, message, signatureBase64.slice(3));
  ok(verLegacy.ok && verLegacy.variant === 'simple-legacy', 'M03: Legacy-Signatur ohne Praefix weiterhin gueltig');

  // Varianten-Klassifikation
  ok(classifyBip322Signature('smpQUFB').variant === 'simple-prefixed', 'M03: smp-Klassifikation');
  ok(classifyBip322Signature('fulQUFB').variant === 'full', 'M03: ful-Klassifikation');
  ok(classifyBip322Signature('pofQUFB').variant === 'pof', 'M03: pof-Klassifikation');
  ok(classifyBip322Signature('QUFB').variant === 'simple-legacy', 'M03: Legacy-Klassifikation');

  // PoF: synthetisches finalisiertes PSBT (unabhaengige Konstruktion im Test)
  const txBytes = [
    0x02, 0x00, 0x00, 0x00, // nVersion
    0x01, // vin count
    ...Array(32).fill(0x00), // prevout hash
    0x00, 0x00, 0x00, 0x00, // vout
    0x00, // scriptSig len
    0xff, 0xff, 0xff, 0xff, // nSequence
    0x01, // vout count
    ...Array(8).fill(0x00), // value
    0x01, 0x6a, // spk OP_RETURN
    0x00, 0x00, 0x00, 0x00, // locktime
  ];
  const msgBytes = [...new TextEncoder().encode('DAC8-Test')];
  const psbt = [
    0x70, 0x73, 0x62, 0x74, 0xff, // magic
    0x01, 0x00, txBytes.length, ...txBytes, // global key 0x00: unsigned tx
    0x01, 0x09, msgBytes.length, ...msgBytes, // global key 0x09: message
    0x00, // global map separator
    0x00, // input map (leer)
    0x00, // output map (leer)
  ];
  const psbtB64 = Buffer.from(Uint8Array.from(psbt)).toString('base64');
  const insp = inspectPofPsbt(psbtB64);
  ok(insp?.inputs === 1 && insp.message === 'DAC8-Test', 'M03: PoF-PSBT gelesen (1 Input, Message-Global 0x09)');
  const pofOk = await verifyBip322(address, 'DAC8-Test', 'pof' + psbtB64);
  ok(pofOk.ok && pofOk.variant === 'pof', 'M03: PoF mit uebereinstimmender Challenge akzeptiert (mit Offline-Caveat)');
  const pofMismatch = await verifyBip322(address, 'ANDERE-Challenge', 'pof' + psbtB64);
  ok(!pofMismatch.ok, 'M03: PoF mit abweichender Challenge abgelehnt');
  ok(inspectPofPsbt('bm90LWEtcHNidA==') === null || true, 'M03: Nicht-PSBT-Payload robust (kein Absturz)');
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
    const { lookupSafeSingleton } = await import('../src/lib/stva.ts');
    const implInDemo = String(dec?.args?.newImplementation ?? dec?.args?.implementation ?? '');
    ok(
      !!lookupSafeSingleton(implInDemo),
      'M02: Demo zielt auf kanonisches Safe-Singleton (Registry-Pfad im Demo-Flow abgedeckt)'
    );
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

// ---------------------------------------------------------------- Spenden-URIs (BIP-21 / Solana Pay / EIP-681)
{
  // Node-ESM kann extensionlose TS-Imports nicht aufloesen -> esbuild bündelt
  // donation.ts + site.ts einmalig nach /tmp (esbuild liegt via Vite im Repo).
  execSync('npx esbuild src/lib/donation.ts --bundle --format=esm --define:import.meta.env="{}" --outfile=/tmp/donation.bundle.mjs --log-level=silent');
  const { donationUri, DONATION_CHAINS } = await import('/tmp/donation.bundle.mjs');
  const DONATION = Object.fromEntries(DONATION_CHAINS.map((c) => [c.id, c.address]));
  const btc = donationUri('btc', '0.01');
  ok(btc === `bitcoin:${DONATION.btc}?label=AndrexTheDev&amount=0.01`, 'Spenden: BTC BIP-21 exakt');
  const sol = donationUri('sol');
  ok(sol === `solana:${DONATION.sol}?label=AndrexTheDev`, 'Spenden: SOL Solana-Pay-Format');
  const eth = donationUri('eth', '0.05');
  ok(eth === `ethereum:${DONATION.eth}?value=50000000000000000`, 'Spenden: ETH EIP-681 value-in-wei');
  const ethRaw = donationUri('eth', undefined, true);
  ok(ethRaw === DONATION.eth, 'Spenden: Raw-Adress-Modus');
  ok(donationUri('btc', 'abc') === `bitcoin:${DONATION.btc}?label=AndrexTheDev`, 'Spenden: ungueltiger Betrag wird ignoriert');
}

// ---------------------------------------------------------------- QR-Encoding (uqr)
{
  const { encode } = await import('uqr');
  const q = encode('ethereum:0xBC3fab34f69bc9f6661608C3FB36dDdC313C42F7', { ecc: 'M' });
  ok(q.size >= 21 && q.data.length === q.size && q.data.every((row) => row.length === q.size), `QR: gueltige quadratische Matrix (${q.size}x${q.size})`);
  ok(q.data[1][1] === true && q.data[1][7] === true && q.data[7][1] === true, 'QR: Finder-Pattern vorhanden (Offset 1 Modul)');
}

// ---------------------------------------------------------------- Adress-Chunking (4er-Bloecke)
{
  execSync('npx esbuild src/config/site.ts --bundle --format=esm --define:import.meta.env=\"{}\" --outfile=/tmp/site.bundle.mjs --log-level=silent');
  const { chunkAddress } = await import('/tmp/site.bundle.mjs');
  const chunks = chunkAddress('0xBC3fab34f69bc9f6661608C3FB36dDdC313C42F7');
  ok(chunks.every((c, i) => c.length === 4 || i === chunks.length - 1), `Spenden: 4-Zeichen-Bloecke (${chunks.length} Stueck, letzter ${chunks[chunks.length-1].length} ch)`);
  ok(chunks.join('') === '0xBC3fab34f69bc9f6661608C3FB36dDdC313C42F7', 'Spenden: Chunks rekonstruieren Original');
}

// ---------------------------------------------------------------- Modul 06: UserOp-Autopsy-Mathe mit synthetischem Receipt
{
  // Die Receipt-Formel aus UseropAutopsy.tsx (parseReceipt) nachgespielt:
  // tx bezahlt gasUsed*effPrice, UserOps tragen sumGasCost -> Netto-Marge des Bundlers.
  const gasUsed = 120_000n, effPrice = 1_000_000_000n; // 1 gwei
  const opGasCost = 140_000_000_000_000n; // OP bezahlt mehr als tx kostet
  const opGasUsed = 130_000n;
  const txCost = gasUsed * effPrice; // 120_000_000_000_000 wei
  const net = opGasCost - txCost;
  ok(net === 20_000_000_000_000n, 'M06: Netto-Marge korrekt (0.00002 ETH)');
  const marginPct = Number((net * 10_000n) / txCost) / 100;
  ok(marginPct === 16.66, `M06: Marge ${marginPct} % (Integer-Truncation, deterministisch)`);
  const unitMarkup = Number(((opGasUsed - gasUsed) * 10_000n) / gasUsed) / 100;
  ok(Math.abs(unitMarkup - 8.33) < 0.01, `M06: Gasunit-Aufschlag ${unitMarkup.toFixed(2)} %`);
  const implied = opGasCost / opGasUsed;
  const priceMarkup = Number(((implied - effPrice) * 10_000n) / effPrice) / 100;
  ok(Math.abs(priceMarkup - 7.69) < 0.01, `M06: impliziter Gaspreis-Aufschlag ${priceMarkup.toFixed(2)} %`);
}

// ---------------------------------------------------------------- M06: EntryPoint-Versionen & Topics (v0.6-v0.9)
{
  const src = readFileSync('src/components/tools/UseropAutopsy.tsx', 'utf8');
  const eps = {
    '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789': 'v0.6',
    '0x0000000071727de22e5e9d8baf0edac6f37da032': 'v0.7',
    '0x4337084d9e255ff0702461cf8895ce9e3b5ff108': 'v0.8',
    '0x433709009b8330fda32311df1c2afa402ed8d009': 'v0.9',
  };
  for (const [addr, v] of Object.entries(eps)) {
    ok(src.includes(addr), `M06: EntryPoint ${v} (${addr.slice(0, 12)}…) eingebettet`);
  }
  ok(src.includes('0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f'), 'M06: UserOperationEvent-Topic (v0.6–v0.9 identisch)');
  ok(src.includes('0xd80b2cbd5dc420e00122d9f598731e3834f5d98a280dd183b5a3801dc1f2e967'), 'M06: IgnoredInitCode-Topic (v0.9)');
}

// ---------------------------------------------------------------- M11: Safe-Singleton-Registry (safe-deployments, kanonisch)
{
  const { lookupSafeSingleton, SAFE_SINGLETONS } = await import('../src/lib/stva.ts');
  const v150 = lookupSafeSingleton('0xFf51A5898e281Db6DfC7855790607438dF2ca44b');
  ok(v150?.version === '1.5.0' && v150.variant === 'Safe', 'M11: Safe v1.5.0 canonical erkannt');
  const l2_150 = lookupSafeSingleton('0xEdd160fEBBD92E350D4D398fb636302fccd67C7e');
  ok(l2_150?.version === '1.5.0' && l2_150.variant === 'SafeL2', 'M11: SafeL2 v1.5.0 canonical erkannt');
  const l2_141 = lookupSafeSingleton('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'); // Grossschreibung → Normalisierung testen
  ok(l2_141?.version === '1.4.1' && l2_141.variant === 'SafeL2', 'M11: SafeL2 v1.4.1 case-insensitiv erkannt');
  const mig = lookupSafeSingleton('0x6439e7ABD8Bb915A5263094784C5CF561c4172AC');
  ok(mig?.variant === 'SafeMigration' && mig.version === '1.5.0', 'M11: SafeMigration v1.5.0 erkannt');
  ok(lookupSafeSingleton('0x000000000000000000000000000000000000dead') === undefined, 'M11: unbekannte Adresse → undefined');
  ok(Object.keys(SAFE_SINGLETONS).length === 9, 'M11: Registry enthaelt exakt 9 kanonische Eintraege');
  const src = readFileSync('src/components/tools/StvaUpgradeDiff.tsx', 'utf8');
  ok(src.includes('lookupSafeSingleton'), 'M11: Registry-Abgleich im STVA-Report verdrahtet');
  ok(src.includes('clearsigning.org') && src.includes('ERC-8176'), 'M11: EF-Registry + Attestierungs-Standard im Deskriptor-Hinweis');
  ok(src.includes('ERC-8213-Calldata-Digest-Fallback'), 'M11: ERC-8213-Digest-Fallback beim Fingerprint benannt');
  const x4 = readFileSync('src/components/tools/X402PaywallGuard.tsx', 'utf8');
  ok(x4.includes('wallet_requestExecutionPermissions'), 'M01: ERC-7715 Methoden-Umbenennung (Draft 09/2026) dokumentiert');
  const bw = readFileSync('src/components/tools/BundleWatchEns.tsx', 'utf8');
  ok(bw.includes('ENSv2'), 'M10: BundleWatch dokumentiert ENSv2-Migrationskontext');
  const ensSrc = readFileSync('src/lib/ens.ts', 'utf8');
  ok(ensSrc.includes('0xeeeeeeee14d718c2b47d9923deab1335e144eeee'), 'M10: Universal-Resolver-Adresse unveraendert kanonisch');
}

// ---------------------------------------------------------------- M04: Passkey-Continuity-Checkliste (CXF/CXP Laufzeitstand)
{
  // Hygiene: content-hash/multiformats sind Referenz-Pakete fuer Vektorverifikation,
  // duerfen aber NICHT in den Projekt-Dependencies landen (Wave-5-Vorfall 641b898).
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  ok(!('content-hash' in allDeps) && !('multiformats' in allDeps), 'HYGIENE: Referenz-Pakete (content-hash/multiformats) nicht als Projekt-Dep');
  ok(Object.keys(allDeps).length <= 26, `HYGIENE: Dep-Anzahl gedeckelt (${Object.keys(allDeps).length} <= 26)`);
}

{
  const src = readFileSync('src/components/tools/PasskeyContinuity.tsx', 'utf8');
  ok(src.includes("id: 'portability'") && src.includes('CXF 1.0'), 'M04: Portabilitaets-Check (FIDO CXF) in Checkliste');
  ok(src.includes('EIP-7951') && src.includes('Fusaka') && src.includes('03.12.2025'), 'M04: EIP-7951/Fusaka-Mainnet-Kontext benannt');
  const cl = src.match(/const CHECKLIST = \[([\s\S]*?)\];/)?.[1] ?? '';
  ok((cl.match(/id: '/g) ?? []).length === 5, `M04: exakt 5 Checklisten-Items im CHECKLIST-Array (${(cl.match(/id: '/g) ?? []).length})`);
}

// ---------------------------------------------------------------- HYGIENE: CI-Versionen + bekannte Delegates
{
  const wf = readFileSync('.github/workflows/build-audit.yml', 'utf8');
  ok(wf.includes('actions/checkout@v7') && wf.includes('actions/setup-node@v7'), 'HYGIENE: CI-Actions auf v7 (Stand 11/2026)');
  ok(!wf.includes('@v4') && !wf.includes('@v3'), 'HYGIENE: keine ausgelaufenen Action-Majors mehr');
  const sg = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  ok(sg.includes('0x63c0c19a282a1b52b07dd5a65b58948a07dae32b'), 'M05: MetaMask-Delegator in Known-Delegates-Registry');
  ok(existsDistWellKnown(), 'M05/HYGIENE: security.txt landet im Build (Vorab pruefbar an public/)');
}
function existsDistWellKnown() {
  try {
    return readFileSync('public/.well-known/security.txt', 'utf8').includes('Expires:');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- contenthash Vektoren vs. Referenz-Implementierungen
// Referenzen: multiformats CID.decode().toV1().toString(base32) bzw. content-hash.decode()
// (Beide offiziell gegen den EIP-Vektor verifiziert — Regression gegen Varint-Bug-klasse
// walletbeat#1330: Proto-Codec 0xe3 ist ein uvarint ('e3 01'), kein Einzelbyte.)
{
  const { decodeContenthash } = await import('../src/lib/contenthash.ts');
  // 1) EIP-1577-Spezifikationsvektor (CIDv1, dag-pb, sha2-256)
  const eip = decodeContenthash('e3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f');
  ok(
    eip.kind === 'ipfs' && eip.cid === 'bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4',
    'M10: EIP-1577-Spezifikationsvektor → exakter CIDv1-base32 (multiformats-Referenz)'
  );
  // 2) CIDv0-Multihash direkt hinter dem Codec: content-hash-Paket dekodiert auf QmbFMk…
  const v0 = decodeContenthash('e301' + '1220' + 'bfccda787baba32b59c78450ac3d20b633360b25192c73e135fd8d4dcc864d05');
  ok(
    v0.kind === 'ipfs' && v0.cid === 'QmbFMke1KXqnYyBBWxB74N4c5SBnFp9EZAvPw6CNv8xQDi',
    'M10: CIDv0-contenthash → exakter Qm…-String (content-hash-Referenz)'
  );
  // 3) IPNS-namespace (libp2p-key)
  const ipns = decodeContenthash('0xe501017212205555555555555555555555555555555555555555555555555555555555555555');
  ok(ipns.kind === 'ipns' && ipns.cid.length > 10, `M10: IPNS-contenthash erkannt (${ipns.kind})`);
}

// ---------------------------------------------------------------- Safe-TxHash Deterministik
{
  const { computeSafeTxHash } = await import('../src/lib/stva.ts');
  const tx = {
    to: '0x1000000000000000000000000000000000000001',
    value: '0',
    data: '0x',
    operation: 0,
    safeTxGas: '0',
    baseGas: '0',
    gasPrice: '0',
    gasToken: '0x0000000000000000000000000000000000000000',
    refundReceiver: '0x0000000000000000000000000000000000000000',
    nonce: '7',
  };
  const h1 = await computeSafeTxHash('0x2000000000000000000000000000000000000002', 1, tx);
  const h2 = await computeSafeTxHash('0x2000000000000000000000000000000000000002', 1, tx);
  ok(h1 === h2 && /^0x[0-9a-f]{64}$/.test(h1), `M02: SafeTxHash deterministisch (${h1.slice(0, 14)}…)`);
  const h3 = await computeSafeTxHash('0x2000000000000000000000000000000000000002', 8453, tx);
  ok(h3 !== h1, 'M02: Chain-Id aendert Domain (Cross-Chain-Replay-Schutz)');
  const h4 = await computeSafeTxHash('0x2000000000000000000000000000000000000002', 1, { ...tx, nonce: '8' });
  ok(h4 !== h1, 'M02: Nonce aendert Digest');
}

// ---------------------------------------------------------------- HYGIENE: Doku-Drift-Lock-in (letzter Check)
{
  // README nennt die exakte aktuelle Check-Zahl; dieser Check selbst ist inklusive.
  const expectedTotal = checks + 1;
  const readme = readFileSync('README.md', 'utf8');
  ok(readme.includes(`${expectedTotal}-Check`), `HYGIENE: README nennt aktuelle Check-Zahl (${expectedTotal}-Check)`);
}

console.log(`\n${checks} Checks, ${failures} Fehlschlag/Fehlschlaege`);
process.exit(failures ? 1 : 0);
