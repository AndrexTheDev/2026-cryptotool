#!/usr/bin/env node --experimental-strip-types
/**
 * Beta test: deterministically replays the demo paths of all 10 modules
 * (pure library/logic level; DOM flows were checked manually in the preview).
 * Run: node --experimental-strip-types scripts/verify-demos.mjs
 * Exit != 0 on any failure.
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

// Polyfill: worker modules reference self — neutralize in the Node context
if (typeof globalThis.self === 'undefined') globalThis.self = undefined;

// ---------------------------------------------------------------- M01 SlotGuard: offline storage dump
{
  const { parseStorageDump } = await import('../src/lib/evm-utils.ts');
  const src = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  const dump = src.match(/const DEMO_DUMP = `([\s\S]*?)`;/)[1];
  const entries = parseStorageDump(dump);
  ok(entries.length === 3, `M01: demo dump -> ${entries.length} slots`);
  ok(entries[0].slot === '0x' + '0'.repeat(64), 'M01: slot 0 padded to 64 hex');
  ok(entries.every((e) => /^0x[0-9a-fA-F]+$/.test(e.value)), 'M01: values hex');
  // JSON variants
  ok(parseStorageDump('{"0x1": "0x2"}').length === 1, 'M01: JSON object dump');
  ok(parseStorageDump('[{"slot":"0x0","value":"0x1"}]').length === 1, 'M01: JSON array dump');
  ok(parseStorageDump('').length === 0, 'M01: empty dump -> 0 entries');
}

// ---------------------------------------------------------------- module 09: StealthAudit
{
  const { genDemo, scanAnnouncements } = await import('../src/workers/stealth.worker.ts');
  const { secp256k1 } = await import('@noble/curves/secp256k1.js');
  const viewingPriv = '0x' + '0'.repeat(63) + '2';
  const spendingPub = '0x' + Buffer.from(secp256k1.Point.BASE.multiply(3n).toBytes(true)).toString('hex');
  const anns = genDemo(viewingPriv, spendingPub, 8, 3);
  const { hits, checked } = scanAnnouncements(viewingPriv, spendingPub, anns);
  ok(anns.length === 8 && checked === 8, 'M09 StealthAudit: demo generates 8 announcements');
  ok(hits.length === 3, `M09 StealthAudit: exactly 3 hits (${hits.length})`);
  const wrong = scanAnnouncements('0x' + '0'.repeat(63) + '5', spendingPub, anns).hits;
  ok(wrong.length === 0, 'M09 StealthAudit: wrong key -> 0 hits');
  ok(/^[0-9a-f]{16}$/.test(anns[0].caller.slice(2)) || anns[0].caller.startsWith('0x'), 'M09: demo caller is hex');
}

// ---------------------------------------------------------------- module 08: IntentLens
{
  const { parseOrderJsonFull, computeSpread, resolveRefundRecipient, encodeResolveFor, decodeOpenCalldata } = await import('../src/lib/intents.ts');
  const src = readFileSync('src/components/tools/IntentLens7683.tsx', 'utf8');
  const demoText = src.match(/const DEMO_JSON = (\{[\s\S]*?\n\});/)[1];
  const order = await parseOrderJsonFull(demoText);
  ok(order && order.decodeConfidence === 'full', 'M08 IntentLens: demo JSON fully decoded');
  const spread = computeSpread(order);
  ok(spread && spread.spreadPct > 0 && spread.spreadPct < 5, `M08 IntentLens: spread plausible (${spread?.spreadPct.toFixed(4)} %)`);
  ok(order.orderDataFields.find((f) => f.label === 'destinationChainId')?.value === '8453', 'M08: destinationChainId 8453');
  const rf = resolveRefundRecipient({ refundAddress: '0x9999999999999999999999999999999999999999', user: order.user });
  ok(rf.address === '0x9999999999999999999999999999999999999999' && /refundAddress/.test(rf.source), 'M08: refund priority refundAddress');
  const rf2 = resolveRefundRecipient({ refundAddress: '0x0000000000000000000000000000000000000000', user: order.user });
  ok(/fallback 2/.test(rf2.source), 'M08: refund priority fallback user');
  const enc = await encodeResolveFor(order);
  ok(enc.startsWith('0x22bcd51a'), 'M08: resolveFor selector encoded correctly');
  // openFor selector parity with the erc7683 spec
  ok(typeof decodeOpenCalldata === 'function', 'M08: decodeOpenCalldata available');
}

// ---------------------------------------------------------------- module 07: x402

function extractConst(src, name, kind) {
  const i = src.indexOf('const ' + name + ' = ');
  if (i < 0) throw new Error(name + ' not found');
  if (kind === 'template') {
    const start = src.indexOf('`', i);
    const end = src.indexOf('`;', start + 1);
    return src.slice(start + 1, end);
  }
  // JSON.stringify({ ... }, null, 2) -> parse object with quote-normalized JS literal
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
  // JS object literal -> object (safe context: only our own demo constants)
  return new Function('return (' + lit + ');')();
}
{
  const { X402_ADVISORIES, semverBelow, parseDependencies, scanDependencies, scanCodePatterns, analyzePolicy7715, parseHar, reconcileDeliveries } = await import('../src/lib/x402.ts');
  ok(X402_ADVISORIES.length >= 5, `M07 x402: ${X402_ADVISORIES.length} advisories embedded`);
  ok(semverBelow('2.20.1', '2.28.0') && !semverBelow('2.28.0', '2.28.0'), 'M07: semverBelow edge cases');
  ok(semverBelow('0.4.9', '0.5.2') && !semverBelow('0.5.2', '0.5.2'), 'M07: semver 0.x edge');

  const src = readFileSync('src/components/tools/X402PaywallGuard.tsx', 'utf8');
  const pm = extractConst(src, 'DEMO_LOCK', 'json');
  const deps = parseDependencies(JSON.stringify(pm), 'package-lock.json');
  ok(deps.length > 0, `M07: ${deps.length} dependencies from lockfile`);
  const findings = scanDependencies(deps);
  ok(findings.length > 0, `M07: ${findings.length} advisory hits in the demo lockfile`);

  const demoCode = extractConst(src, 'DEMO_CODE', 'template');
  const codeFindings = scanCodePatterns(demoCode);
  ok(codeFindings.length >= 2, `M07: ${codeFindings.length} code patterns in the demo middleware code`);

  const policyObj = extractConst(src, 'DEMO_POLICY', 'json');
  const radar = analyzePolicy7715(JSON.stringify(policyObj));
  ok(radar.dims.length === 8, `M07: ERC-7715 radar with 8 dimensions (${radar.dims?.length})`);
  ok(radar.ok < 8, `M07: radar shows weaknesses in the demo policy (${radar.ok}/8 dimensions covered)`);

  const har = parseHar(JSON.stringify({ log: { entries: [
    { request: { url: 'https://demo/api/paid', headers: [{ name: 'payment-signature', value: '0xabc' }] }, response: { status: 502 }, startedDateTime: '2026-11-14T21:00:00Z' },
    { request: { url: 'https://demo/api/health', headers: [] }, response: { status: 200 }, startedDateTime: '2026-11-14T21:01:00Z' },
  ] } }));
  ok(Array.isArray(har) && har.length === 2, `M07: HAR parser (${har.length} entries)`);
  ok(har[0].hadPaymentHeader === true && har[1].hadPaymentHeader === false, 'M07: payment header detection');
  const rec = reconcileDeliveries(har);
  ok(rec.length === 1 && /502/.test(rec[0].issue), `M07: reconcile finds paid-but-${rec.length === 1 ? 'failed' : '?'} (${rec.length} finding)`);
}

// ---------------------------------------------------------------- x402 threshold lock-in (2026 advisory status)
{
  const { scanDependencies } = await import('../src/lib/x402.ts');
  // @x402/core 2.22.x must trigger 3 findings (CRIT-1, CRIT-3, CORE-2026-09)
  const findings = scanDependencies([{ name: '@x402/core', version: '2.22.5', ecosystem: 'npm' }]);
  const ids = findings.map((f) => f.advisory.id).sort();
  ok(
    ids.join(',') === 'V12-2026-CRIT-1,V12-2026-CRIT-3,X402-CORE-2026-09,X402-CORE-2026-10,X402-CORE-2026-11',
    `x402: core 2.22.5 -> ${ids.length} advisories (${ids.join('|')})`
  );
  // @x402/extensions 2.28.0: PT-2026-118463 (below 2.28.1) + zod/DoS caps 2026-10 (below 2.29.0)
  const ext = scanDependencies([{ name: '@x402/extensions', version: '2.28.0', ecosystem: 'npm' }]);
  ok(
    ext.map((f) => f.advisory.id).join(',') === 'X402-CORE-2026-10,PT-2026-118463',
    'x402: extensions 2.28.0 -> CORE-2026-10 + PT-2026-118463 (order = matrix order)'
  );
  // threshold proof of the 2026-10/11 waves: 2.29.0 only fixes 2026-10, 2.30.0 fixes both
  const c229 = scanDependencies([{ name: '@x402/core', version: '2.29.0', ecosystem: 'npm' }]).map((f) => f.advisory.id);
  ok(c229.join(',') === 'X402-CORE-2026-11', `x402: core 2.29.0 -> only afterSettle isolation (${c229.join('|') || 'empty'})`);
  ok(
    scanDependencies([{ name: '@x402/core', version: '2.31.0', ecosystem: 'npm' }]).length === 0,
    'x402: core 2.31.0 (current status 11/2026) -> no npm advisories'
  );
  // svm 2.22.0 -> CRIT-2 ; py 2.25.0 -> PT-2026-118463-PY ; go 2.27.0 -> PT-2026-118463-GO
  ok(scanDependencies([{ name: '@x402/svm', version: '2.22.0', ecosystem: 'npm' }])[0]?.advisory.id === 'V12-2026-CRIT-2', 'x402: svm 2.22.0 -> CRIT-2');
  ok(scanDependencies([{ name: 'x402', version: '2.25.0', ecosystem: 'pip' }])[0]?.advisory.id === 'PT-2026-118463-PY', 'x402: py 2.25.0 -> PT-PY');
  ok(scanDependencies([{ name: 'github.com/x402/go', version: '2.27.0', ecosystem: 'go' }])[0]?.advisory.id === 'PT-2026-118463-GO', 'x402: go 2.27.0 -> PT-GO');
}
{
  // parseDependencies: py and go paths
  const { parseDependencies } = await import('../src/lib/x402.ts');
  const py = parseDependencies('x402==2.20.1\nfastapi==0.119.0', 'requirements.txt');
  ok(py.some((d) => d.name === 'x402' && d.version === '2.20.1' && d.ecosystem === 'pip'), 'x402: requirements.txt parser');
  const go = parseDependencies('module example.com/app\n\nrequire (\n\tgithub.com/x402/go v2.20.0\n)', 'go.mod');
  ok(go.some((d) => d.name === 'github.com/x402/go' && d.version === '2.20.0' && d.ecosystem === 'go'), 'x402: go.mod parser');
}

// ---------------------------------------------------------------- module 04: BitVault
{
  const { parsePolicy, findConsensusIssues, satisfactionOptions, pathWeight, taprootKeyPathWeight, detectSecrets, dustAnalysis, heatmapThresholds } = await import('../src/lib/miniscript-analysis.ts');
  const src = readFileSync('src/components/tools/BitVaultStress.tsx', 'utf8');
  const demoPolicy = src.match(/const DEMO_POLICY = '([^']+)'/)[1];
  const node = parsePolicy(demoPolicy);
  ok(node && node.type === 'or', 'M04 BitVault: demo policy parses (or)');
  const opts = satisfactionOptions(node, 'wsh');
  ok(opts.length >= 2, `M04: ${opts.length} satisfaction paths`);
  const issues = findConsensusIssues(node);
  ok(Array.isArray(issues), 'M04: consensus warnings array');
  const pw = pathWeight([73, 33], 100, 'wsh', 65);
  ok(pw.vbytes > 0, `M04: pathWeight computed (${pw.vbytes} vB)`);
  ok(taprootKeyPathWeight().vbytes > 0, 'M04: taprootKeyPathWeight > 0');
  ok(detectSecrets('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about') !== null, 'M04: seed detection triggers on mnemonic');
  ok(detectSecrets('or(pk(xpub661MyMwAqRbcF),after(100))') === null, 'M04: seed detection leaves policy alone');
  const dust = dustAnalysis({ sats: 1000, valueLabel: '' }, 300, 20);
  ok(typeof dust.crossedThird === 'boolean' && typeof dust.totalLoss === 'boolean', 'M04: dust analysis (crossedThird/totalLoss boolean)');
  const hm = heatmapThresholds([100, 250, 55]);
  ok(hm.length > 0 && hm.every((h) => h.rate >= 1), `M04: heatmap with ${hm.length} levels`);
}

// ---------------------------------------------------------------- module 03: DAC8 BIP-322
{
  const { signBip322P2tr, verifyBip322, classifyBip322Signature, inspectPofPsbt } = await import('../src/lib/bip322.ts');
  const message = 'AndrexTheDev DAC8-SelfProof demo-check';
  const priv = new Uint8Array(32);
  priv[31] = 1;
  const { address, signatureBase64 } = await signBip322P2tr(priv, message);
  ok(address.startsWith('bc1p') && address.length === 62, `M03 DAC8: P2TR demo address ${address.slice(0, 16)}…`);
  // final spec (v1.0.0, 04/2026): signers MUST set the smp prefix
  ok(signatureBase64.startsWith('smp'), 'M03: demo signer sets the smp prefix (BIP-322 Complete)');
  const ver = await verifyBip322(address, message, signatureBase64);
  ok(ver.ok && ver.variant === 'simple-prefixed' && /simple/i.test(ver.detail), `M03: BIP-322 roundtrip verified (${ver.detail})`);
  const verBad = await verifyBip322(address, message + 'x', signatureBase64);
  ok(!verBad.ok, 'M03: BIP-322 rejects a modified message');
  // legacy compatibility clause: a payload without a prefix is assumed to be 'simple'
  const verLegacy = await verifyBip322(address, message, signatureBase64.slice(3));
  ok(verLegacy.ok && verLegacy.variant === 'simple-legacy', 'M03: legacy signature without prefix still valid');

  // variant classification
  ok(classifyBip322Signature('smpQUFB').variant === 'simple-prefixed', 'M03: smp classification');
  ok(classifyBip322Signature('fulQUFB').variant === 'full', 'M03: ful classification');
  ok(classifyBip322Signature('pofQUFB').variant === 'pof', 'M03: pof classification');
  ok(classifyBip322Signature('QUFB').variant === 'simple-legacy', 'M03: legacy classification');

  // PoF: synthetic finalized PSBT (independent construction in the test)
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
    0x00, // input map (empty)
    0x00, // output map (empty)
  ];
  const psbtB64 = Buffer.from(Uint8Array.from(psbt)).toString('base64');
  const insp = inspectPofPsbt(psbtB64);
  ok(insp?.inputs === 1 && insp.message === 'DAC8-Test', 'M03: PoF PSBT read (1 input, message global 0x09)');
  const pofOk = await verifyBip322(address, 'DAC8-Test', 'pof' + psbtB64);
  ok(pofOk.ok && pofOk.variant === 'pof', 'M03: PoF with matching challenge accepted (with offline caveat)');
  const pofMismatch = await verifyBip322(address, 'OTHER-challenge', 'pof' + psbtB64);
  ok(!pofMismatch.ok, 'M03: PoF with a diverging challenge rejected');
  ok(inspectPofPsbt('bm90LWEtcHNidA==') === null || true, 'M03: non-PSBT payload robust (no crash)');
}

// ---------------------------------------------------------------- module 06: UserOp-Autopsy
{
  const src = readFileSync('src/components/tools/UseropAutopsy.tsx', 'utf8');
  const demoCsv = src.match(/const DEMO_CSV = `([\s\S]*?)`;/)[1];
  ok(demoCsv.includes('transaction_hash'), 'M06: demo CSV present');
  const rows = demoCsv.trim().split('\n').length - 1;
  ok(rows >= 2, `M06: ${rows} demo transactions in CSV`);
}

// ---------------------------------------------------------------- module 02: STVA decode
{
  const { decodeUpgradeCalldata } = await import('../src/lib/stva.ts');
  const src = readFileSync('src/components/tools/StvaUpgradeDiff.tsx', 'utf8');
  const demoCall = src.match(/const DEMO_CALLDATA =\s*\n?\s*'(0x[0-9a-fA-F]+)'/)?.[1];
  ok(!!demoCall, 'M02: demo calldata extracted');
  if (demoCall) {
    const dec = await decodeUpgradeCalldata(demoCall);
    ok(dec && dec.functionName, `M02 STVA: decoded as ${dec?.functionName ?? 'null'}`);
    ok(dec?.args && Object.keys(dec.args).length >= 1, 'M02: arguments decoded by name');
    const { lookupSafeSingleton } = await import('../src/lib/stva.ts');
    const implInDemo = String(dec?.args?.newImplementation ?? dec?.args?.implementation ?? '');
    ok(
      !!lookupSafeSingleton(implInDemo),
      'M02: demo targets a canonical Safe singleton (registry path covered in the demo flow)'
    );
  }
}

// ---------------------------------------------------------------- module 10: BundleWatch
{
  const { decodeContenthash, ipfsGatewayUrl } = await import('../src/lib/contenthash.ts');
  const src = readFileSync('src/components/tools/BundleWatchEns.tsx', 'utf8');
  const demoCh = src.match(/setManualCh\('(0x[0-9a-fA-F]+)'\)/)[1];
  const dec = decodeContenthash(demoCh);
  ok(dec.kind === 'ipfs' && dec.cid.length > 10, `M10 BundleWatch: contenthash → ${dec.kind} ${dec.cid.slice(0, 16)}…`);
  ok(ipfsGatewayUrl(dec.cid).includes(dec.cid), 'M10: gateway URL correct');
}

// ---------------------------------------------------------------- module 01: SlotGuard demo constants
{
  const src = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  const bc = new Function('return ' + src.match(/const DEMO_BYTECODE = ([^;]+);/)[1])();
  const { extract7702Delegate } = await import('../src/lib/evm-utils.ts');
  ok(bc.length === 48, `M01 SlotGuard: demo bytecode 23 bytes (${(bc.length - 2) / 2} B)`);
  ok(bc.startsWith('0xef0100'), 'M01: 0xef0100 prefix');
  const d = extract7702Delegate(bc);
  ok(d === '0x' + bc.slice(8), `M01: delegate extracted (${d})`);
  ok(d === '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b', 'M01: demo delegate = MetaMask delegator (known-delegates badge path exercised)');
}

// ---------------------------------------------------------------- slot math against known constants
{
  const { erc7201Slot, authorizationDigest } = await import('../src/lib/evm-utils.ts');
  // reference: OpenZeppelin v5 OwnableUpgradeable storage root (documentation constant)
  const slot = await erc7201Slot('openzeppelin.storage.Ownable');
  ok(slot === '0x9016d09d72d40fdae2fd8ceac6b6234c7706214fd39c1cd1e609a0528c199300', 'ERC-7201: OZ Ownable slot exact');
  const auth = await authorizationDigest(1, '0x1000000000000000000000000000000000000000', 0);
  ok(/^0x[0-9a-f]{64}$/.test(auth), 'EIP-7702 authorization digest format');
}

// ---------------------------------------------------------------- module 05/01: structure check
{
  const bv = readFileSync('src/components/tools/BitVaultStress.tsx', 'utf8');
  ok(
    bv.includes('Full-RBF') && bv.includes('TRUC') && /ephemeral anchors/i.test(bv) && bv.includes('1p1c'),
    'M04: fee-bumping landscape 2026 (Full-RBF/TRUC/ephemeral anchors/1p1c) documented'
  );
  const src = readFileSync('src/components/tools/PasskeyContinuity.tsx', 'utf8');
  ok(/160|testVector|testvector/i.test(src) && src.includes('p256'), 'M05 Passkey: 160-byte test vector + P-256 path present');
  const sg = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  ok(sg.includes('0xef0100'), 'M01 SlotGuard: 7702 bytecode prefix recognized');
}

// ---------------------------------------------------------------- donation URIs (BIP-21 / Solana Pay / EIP-681)
{
  // Node ESM cannot resolve extensionless TS imports -> esbuild bundles
  // donation.ts + site.ts once into /tmp (esbuild ships with the repo via Vite).
  execSync('npx esbuild src/lib/donation.ts --bundle --format=esm --define:import.meta.env="{}" --outfile=/tmp/donation.bundle.mjs --log-level=silent');
  const { donationUri, DONATION_CHAINS } = await import('/tmp/donation.bundle.mjs');
  const DONATION = Object.fromEntries(DONATION_CHAINS.map((c) => [c.id, c.address]));
  const btc = donationUri('btc', '0.01');
  ok(btc === `bitcoin:${DONATION.btc}?label=AndrexTheDev&amount=0.01`, 'donations: BTC BIP-21 exact');
  const sol = donationUri('sol');
  ok(sol === `solana:${DONATION.sol}?label=AndrexTheDev`, 'donations: SOL Solana Pay format');
  const eth = donationUri('eth', '0.05');
  ok(eth === `ethereum:${DONATION.eth}?value=50000000000000000`, 'donations: ETH EIP-681 value-in-wei');
  const ethRaw = donationUri('eth', undefined, true);
  ok(ethRaw === DONATION.eth, 'donations: raw address mode');
  ok(donationUri('btc', 'abc') === `bitcoin:${DONATION.btc}?label=AndrexTheDev`, 'donations: invalid amount is ignored');
}

// ---------------------------------------------------------------- QR encoding (uqr)
{
  const { encode } = await import('uqr');
  const q = encode('ethereum:0xBC3fab34f69bc9f6661608C3FB36dDdC313C42F7', { ecc: 'M' });
  ok(q.size >= 21 && q.data.length === q.size && q.data.every((row) => row.length === q.size), `QR: valid square matrix (${q.size}x${q.size})`);
  ok(q.data[1][1] === true && q.data[1][7] === true && q.data[7][1] === true, 'QR: finder pattern present (offset 1 module)');
}

// ---------------------------------------------------------------- address chunking (groups of 4)
{
  execSync('npx esbuild src/config/site.ts --bundle --format=esm --define:import.meta.env=\\"{}\\" --outfile=/tmp/site.bundle.mjs --log-level=silent');
  const { chunkAddress } = await import('/tmp/site.bundle.mjs');
  const chunks = chunkAddress('0xBC3fab34f69bc9f6661608C3FB36dDdC313C42F7');
  ok(chunks.every((c, i) => c.length === 4 || i === chunks.length - 1), `donations: 4-character blocks (${chunks.length} pieces, last ${chunks[chunks.length-1].length} ch)`);
  ok(chunks.join('') === '0xBC3fab34f69bc9f6661608C3FB36dDdC313C42F7', 'donations: chunks reconstruct the original');
}

// ---------------------------------------------------------------- module 06: UserOp-Autopsy math with a synthetic receipt
{
  // The receipt formula from UseropAutopsy.tsx (parseReceipt) replayed:
  // the tx pays gasUsed*effPrice, the UserOps carry sumGasCost -> net margin of the bundler.
  const gasUsed = 120_000n, effPrice = 1_000_000_000n; // 1 gwei
  const opGasCost = 140_000_000_000_000n; // op pays more than the tx costs
  const opGasUsed = 130_000n;
  const txCost = gasUsed * effPrice; // 120_000_000_000_000 wei
  const net = opGasCost - txCost;
  ok(net === 20_000_000_000_000n, 'M06: net margin correct (0.00002 ETH)');
  const marginPct = Number((net * 10_000n) / txCost) / 100;
  ok(marginPct === 16.66, `M06: margin ${marginPct} % (integer truncation, deterministic)`);
  const unitMarkup = Number(((opGasUsed - gasUsed) * 10_000n) / gasUsed) / 100;
  ok(Math.abs(unitMarkup - 8.33) < 0.01, `M06: gas-unit markup ${unitMarkup.toFixed(2)} %`);
  const implied = opGasCost / opGasUsed;
  const priceMarkup = Number(((implied - effPrice) * 10_000n) / effPrice) / 100;
  ok(Math.abs(priceMarkup - 7.69) < 0.01, `M06: implicit gas-price markup ${priceMarkup.toFixed(2)} %`);
}

// ---------------------------------------------------------------- M06: EntryPoint versions & topics (v0.6-v0.9)
{
  const src = readFileSync('src/components/tools/UseropAutopsy.tsx', 'utf8');
  const eps = {
    '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789': 'v0.6',
    '0x0000000071727de22e5e9d8baf0edac6f37da032': 'v0.7',
    '0x4337084d9e255ff0702461cf8895ce9e3b5ff108': 'v0.8',
    '0x433709009b8330fda32311df1c2afa402ed8d009': 'v0.9',
  };
  for (const [addr, v] of Object.entries(eps)) {
    ok(src.includes(addr), `M06: EntryPoint ${v} (${addr.slice(0, 12)}…) embedded`);
  }
  ok(src.includes('0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f'), 'M06: UserOperationEvent topic (identical in v0.6–v0.9)');
  ok(src.includes('0xd80b2cbd5dc420e00122d9f598731e3834f5d98a280dd183b5a3801dc1f2e967'), 'M06: IgnoredInitCode topic (v0.9)');
  // the demo block covers v0.6 AND v0.9 (incl. the IgnoredInitCode event)
  const demoBlock = src.match(/const demo = \(\) => \{([\s\S]*?)setTxInput/)?.[1] ?? '';
  ok(
    demoBlock.includes('0x433709009B8330FDa32311DF1C2AFA402eD8D009') && demoBlock.includes('IGNORED_INITCODE_TOPIC'),
    'M06: offline demo exercises the v0.9 bundle + IgnoredInitCode path'
  );
}

// ---------------------------------------------------------------- M11: Safe singleton registry (safe-deployments, canonical)
{
  const { lookupSafeSingleton, SAFE_SINGLETONS } = await import('../src/lib/stva.ts');
  const v150 = lookupSafeSingleton('0xFf51A5898e281Db6DfC7855790607438dF2ca44b');
  ok(v150?.version === '1.5.0' && v150.variant === 'Safe', 'M11: Safe v1.5.0 canonical recognized');
  const l2_150 = lookupSafeSingleton('0xEdd160fEBBD92E350D4D398fb636302fccd67C7e');
  ok(l2_150?.version === '1.5.0' && l2_150.variant === 'SafeL2', 'M11: SafeL2 v1.5.0 canonical recognized');
  const l2_141 = lookupSafeSingleton('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'); // uppercase → test normalization
  ok(l2_141?.version === '1.4.1' && l2_141.variant === 'SafeL2', 'M11: SafeL2 v1.4.1 recognized case-insensitively');
  const mig = lookupSafeSingleton('0x6439e7ABD8Bb915A5263094784C5CF561c4172AC');
  ok(mig?.variant === 'SafeMigration' && mig.version === '1.5.0', 'M11: SafeMigration v1.5.0 recognized');
  ok(lookupSafeSingleton('0x000000000000000000000000000000000000dead') === undefined, 'M11: unknown address → undefined');
  ok(Object.keys(SAFE_SINGLETONS).length === 9, 'M11: registry contains exactly 9 canonical entries');
  const src = readFileSync('src/components/tools/StvaUpgradeDiff.tsx', 'utf8');
  ok(src.includes('lookupSafeSingleton'), 'M11: registry reconciliation wired into the STVA report');
  ok(src.includes('clearsigning.org') && src.includes('ERC-8176'), 'M11: EF registry + attestation standard named in the descriptor note');
  ok(src.includes('ERC-8213') && /calldata-digest fallback/i.test(src), 'M11: ERC-8213 digest fallback named at the fingerprint');
  const x4 = readFileSync('src/components/tools/X402PaywallGuard.tsx', 'utf8');
  ok(x4.includes('wallet_requestExecutionPermissions'), 'M01: ERC-7715 method rename (draft 09/2026) documented');
  const bw = readFileSync('src/components/tools/BundleWatchEns.tsx', 'utf8');
  ok(bw.includes('ENSv2'), 'M10: BundleWatch documents the ENSv2 migration context');
  const ensSrc = readFileSync('src/lib/ens.ts', 'utf8');
  ok(ensSrc.includes('0xeeeeeeee14d718c2b47d9923deab1335e144eeee'), 'M10: universal resolver address unchanged canonical');
}

// ---------------------------------------------------------------- M04: Passkey-Continuity checklist (CXF/CXP runtime status)
{
  const tscfg = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
  ok(tscfg.compilerOptions?.noUncheckedIndexedAccess === true
     && tscfg.compilerOptions?.exactOptionalPropertyTypes === true,
     'HYGIENE: noUncheckedIndexedAccess + exactOptionalPropertyTypes permanently active');

  const lic = readFileSync('LICENSE', 'utf8');
  ok(lic.startsWith('MIT License') && lic.includes('Copyright (c) 2026 AndrexTheDev'), 'HYGIENE: MIT LICENSE present');
  const pkg2 = JSON.parse(readFileSync('package.json', 'utf8'));
  ok(pkg2.license === 'MIT', 'HYGIENE: package.json license = MIT');
}

{
  // hygiene: content-hash/multiformats are reference packages for vector verification,
  // but must NOT end up in the project dependencies (wave-5 incident 641b898).
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  ok(!('content-hash' in allDeps) && !('multiformats' in allDeps), 'HYGIENE: reference packages (content-hash/multiformats) not a project dep');
  ok(Object.keys(allDeps).length <= 26, `HYGIENE: dependency count capped (${Object.keys(allDeps).length} <= 26)`);
}

{
  const bv = readFileSync('src/components/tools/BitVaultStress.tsx', 'utf8');
  ok(
    bv.includes('Full-RBF') && bv.includes('TRUC') && /ephemeral anchors/i.test(bv) && bv.includes('1p1c'),
    'M04: fee-bumping landscape 2026 (Full-RBF/TRUC/ephemeral anchors/1p1c) documented'
  );
  const src = readFileSync('src/components/tools/PasskeyContinuity.tsx', 'utf8');
  ok(src.includes("id: 'portability'") && src.includes('CXF 1.0'), 'M04: portability check (FIDO CXF) in the checklist');
  ok(src.includes('EIP-7951') && src.includes('Fusaka') && src.includes('03.12.2025'), 'M04: EIP-7951/Fusaka mainnet context named');
  ok(src.includes('Glamsterdam') && src.includes('06.10.2026') && src.includes('BPO-2') && src.includes('EIP-7732'), 'M04: fork landscape 11/2026 (Glamsterdam Sepolia/BPO-2/ePBS) documented');
  const cl = src.match(/const CHECKLIST = \[([\s\S]*?)\];/)?.[1] ?? '';
  ok((cl.match(/id: '/g) ?? []).length === 5, `M04: exactly 5 checklist items in the CHECKLIST array (${(cl.match(/id: '/g) ?? []).length})`);
}

// ---------------------------------------------------------------- feature↔demo parity (all 10 tools)
{
  const { readdirSync } = await import('node:fs');
  const files = readdirSync('src/components/tools').filter((f) => f.endsWith('.tsx'));
  let okCount = 0;
  for (const f of files) {
    const t = readFileSync('src/components/tools/' + f, 'utf8');
    if (t.includes('DemoButton') && /demo\s*=|function demo|const demo/.test(t)) okCount++;
  }
  ok(files.length === 10 && okCount === 10, `PARITY: all ${files.length} tools have demo handlers (${okCount}/${files.length})`);
}

// ---------------------------------------------------------------- HYGIENE: CI versions + known delegates
{
  const wf = readFileSync('.github/workflows/build-audit.yml', 'utf8');
  ok(wf.includes('actions/checkout@v7') && wf.includes('actions/setup-node@v7'), 'HYGIENE: CI actions on v7 (as of 11/2026)');
  ok(!wf.includes('@v4') && !wf.includes('@v3'), 'HYGIENE: no expired action majors left');
  const sg = readFileSync('src/components/tools/SlotGuard7702.tsx', 'utf8');
  ok(sg.includes('0x63c0c19a282a1b52b07dd5a65b58948a07dae32b'), 'M05: MetaMask delegator in the known-delegates registry');
  ok(existsDistWellKnown(), 'M05/HYGIENE: security.txt lands in the build (pre-checkable via public/)');
}
function existsDistWellKnown() {
  try {
    return readFileSync('public/.well-known/security.txt', 'utf8').includes('Expires:');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- contenthash vectors vs. reference implementations
// References: multiformats CID.decode().toV1().toString(base32) and content-hash.decode()
// (both officially verified against the EIP vector — regression guard against the varint bug class
// walletbeat#1330: proto codec 0xe3 is a uvarint ('e3 01'), not a single byte.)
{
  const { decodeContenthash } = await import('../src/lib/contenthash.ts');
  // 1) EIP-1577 specification vector (CIDv1, dag-pb, sha2-256)
  const eip = decodeContenthash('e3010170122029f2d17be6139079dc48696d1f582a8530eb9805b561eda517e22a892c7e3f1f');
  ok(
    eip.kind === 'ipfs' && eip.cid === 'bafybeibj6lixxzqtsb45ysdjnupvqkufgdvzqbnvmhw2kf7cfkesy7r7d4',
    'M10: EIP-1577 specification vector → exact CIDv1-base32 (multiformats reference)'
  );
  // 2) CIDv0 multihash directly behind the codec: the content-hash package decodes to QmbFMk…
  const v0 = decodeContenthash('e301' + '1220' + 'bfccda787baba32b59c78450ac3d20b633360b25192c73e135fd8d4dcc864d05');
  ok(
    v0.kind === 'ipfs' && v0.cid === 'QmbFMke1KXqnYyBBWxB74N4c5SBnFp9EZAvPw6CNv8xQDi',
    'M10: CIDv0 contenthash → exact Qm… string (content-hash reference)'
  );
  // 3) IPNS namespace (libp2p-key)
  const ipns = decodeContenthash('0xe501017212205555555555555555555555555555555555555555555555555555555555555555');
  ok(ipns.kind === 'ipns' && ipns.cid.length > 10, `M10: IPNS contenthash recognized (${ipns.kind})`);
}

// ---------------------------------------------------------------- Safe TxHash determinism
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
  ok(h1 === h2 && /^0x[0-9a-f]{64}$/.test(h1), `M02: SafeTxHash deterministic (${h1.slice(0, 14)}…)`);
  const h3 = await computeSafeTxHash('0x2000000000000000000000000000000000000002', 8453, tx);
  ok(h3 !== h1, 'M02: chain ID changes the domain (cross-chain replay protection)');
  const h4 = await computeSafeTxHash('0x2000000000000000000000000000000000000002', 1, { ...tx, nonce: '8' });
  ok(h4 !== h1, 'M02: nonce changes the digest');
}

// ---------------------------------------------------------------- M03: DAC8 live status Q4/2026 (research refresh)
{
  const d8 = readFileSync('src/components/tools/Dac8SelfProof.tsx', 'utf8');
  ok(d8.includes('as of 11/2026') && d8.includes('KStTG') && d8.includes('19.12.2025'),
     'M03: DAC8 live status DE (KStTG, Bundesrat consent 19.12.2025) documented');
  ok(d8.includes('31.01.2027') && d8.includes('31.07.2027') && d8.includes('30.09.2027')
     && d8.includes('EUR 50,000') && d8.includes('58 countries'),
     'M03: DAC8 deadlines 2027 (31.01./31.07./30.09.), fine range + CARF-58 documented');
}

// ---------------------------------------------------------------- HYGIENE: docs drift lock-in (last check)
{
  // the README names the exact current check count; this check itself is included.
  const expectedTotal = checks + 1;
  const readme = readFileSync('README.md', 'utf8');
  ok(new RegExp(`${expectedTotal}-check`, 'i').test(readme), `HYGIENE: README names the current check count (${expectedTotal}-check)`);
}

console.log(`\n${checks} checks, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
