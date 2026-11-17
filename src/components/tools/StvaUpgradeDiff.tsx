import { useMemo, useState } from 'react';
import {
  ChainSingleSelect,
  CopyButton,
  DemoButton,
  ErrorNote,
  ExportBar,
  Kpi,
  KpiGrid,
  StatusTile,
  StepSection,
  type StatusLevel,
} from '../react/ui';
import { getBlockByNumber, getCode, getStorageAt } from '../../lib/rpc';
import { chainById } from '../../config/chains';
import { downloadJSON, openPrintableReport } from '../../lib/export';
import { isHexAddress, shortHex } from '../../lib/format';
import { EIP1967, scanBytecodePatterns } from '../../lib/evm-utils';
import {
  calldataFingerprint,
  computeSafeTxHash,
  decodeUpgradeCalldata,
  eip712HashJson,
  lookupSafeSingleton,
  parseSafeExport,
  type DecodedCall,
  type SafeSingleton,
} from '../../lib/stva';

interface ImplInfo {
  address: string;
  codeHash?: string;
  sizeBytes?: number;
  patterns?: { opcode: string; label: string; count: number }[];
  fetchError?: string;
}

interface StvaReport {
  proxy: string;
  chainId: number;
  decoded?: DecodedCall | null;
  fingerprints: { calldataDigest?: string; eip712?: { domainSeparator: string; messageHash: string; digest: string }; safeTxHash?: string };
  oldImpl?: ImplInfo;
  newImpl?: ImplInfo;
  singletonCheck?: SafeSingleton | null;
  snapshot?: { blockNumber: number; blockHash: string };
  diffNotes: string[];
  signingTime: string[];
  executionTime: string[];
  assumptions: string[];
  level: StatusLevel;
  headline: string;
}

const DEMO_CALLDATA =
  '0x4f1ef286000000000000000000000000edd160febbd92e350d4d398fb636302fccd67c7e00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000';
const DEMO_SAFE = JSON.stringify(
  {
    safe: '0x8Ba1f109551bD432803012645Ac136ddd64DBA72',
    chainId: 1,
    safeTxHash: '0x',
    tx: {
      to: '0xD2046C5451980C011A2278DB7cD2A4763d0E4C8d',
      value: '0',
      data: DEMO_CALLDATA,
      operation: 0,
      safeTxGas: '45210',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '42',
    },
  },
  null,
  2,
);

function bytes(hex: string) {
  return (hex.length - 2) / 2;
}

function diffImpls(oldI?: ImplInfo, newI?: ImplInfo): string[] {
  const notes: string[] = [];
  if (!oldI && !newI) return notes;
  if (oldI?.codeHash && newI?.codeHash) {
    if (oldI.codeHash === newI.codeHash) notes.push('Identical bytecode hash: old and new code are the same (no effective upgrade?).');
    else notes.push('Bytecode hash differs — complete replacement of the execution logic.');
  }
  if (oldI?.sizeBytes != null && newI?.sizeBytes != null) {
    notes.push(`Code size: old ${oldI.sizeBytes} B → new ${newI.sizeBytes} B (Δ ${(newI.sizeBytes - oldI.sizeBytes).toLocaleString('en-GB')} B).`);
  }
  const oSet = new Map((oldI?.patterns ?? []).map((p) => [p.opcode, p.count]));
  const nSet = new Map((newI?.patterns ?? []).map((p) => [p.opcode, p.count]));
  const keys = new Set([...oSet.keys(), ...nSet.keys()]);
  keys.forEach((k) => {
    const o = oSet.get(k) ?? 0;
    const n = nSet.get(k) ?? 0;
    if (n > o) notes.push(`Risky pattern new/increased: ${k} (${o} → ${n}).`);
    if (o > 0 && n === 0) notes.push(`Pattern removed: ${k} (${o} → 0).`);
  });
  if (oldI?.fetchError || newI?.fetchError) notes.push('At least one bytecode fetch failed — comparison is based on partial data.');
  return notes;
}

export default function StvaUpgradeDiff() {
  const [chainId, setChainId] = useState(1);
  const [proxy, setProxy] = useState('');
  const [newImpl, setNewImpl] = useState('');
  const [calldata, setCalldata] = useState('');
  const [safeJson, setSafeJson] = useState('');
  const [typedJson, setTypedJson] = useState('');
  const [layoutOld, setLayoutOld] = useState('');
  const [layoutNew, setLayoutNew] = useState('');
  const [verifiedHint, setVerifiedHint] = useState<'unknown' | 'both' | 'new-only' | 'old-only' | 'none'>('unknown');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<StvaReport | null>(null);

  const demo = () => {
    setChainId(1);
    setProxy('0xD2046C5451980C011A2278DB7cD2A4763d0E4C8d');
    setNewImpl('0xEdd160fEBBD92E350D4D398fb636302fccd67C7e');
    setCalldata(DEMO_CALLDATA);
    setSafeJson(DEMO_SAFE);
    setTypedJson('');
    setLayoutOld('0x0: admin (address)\n0x1: paused (bool)');
    setLayoutNew('0x0: admin (address)\n0x1: paused (bool)\n0x2: treasury (address)');
    setVerifiedHint('both');
    setError('');
  };

  const run = async () => {
    setError('');
    setReport(null);
    const cx = calldata.trim() || (parseSafeExport(safeJson)?.safeTx.data ?? '');
    if (!cx || !/^0x([0-9a-fA-F]{2})+$/.test(cx)) {
      setError('Calldata missing: please paste raw calldata or use a Safe export.');
      return;
    }
    setBusy(true);
    try {
      const decoded = await decodeUpgradeCalldata(cx);
      const fingerprints: StvaReport['fingerprints'] = {};
      fingerprints.calldataDigest = await calldataFingerprint(cx);
      if (typedJson.trim()) {
        const h = await eip712HashJson(typedJson.trim());
        if (h) fingerprints.eip712 = h;
        else setError('EIP-712 JSON not decodable — skipping those fingerprints.');
      }
      const safeExp = safeJson.trim() ? parseSafeExport(safeJson) : null;
      if (safeExp && safeExp.safeAddress && isHexAddress(safeExp.safeAddress)) {
        fingerprints.safeTxHash = await computeSafeTxHash(safeExp.safeAddress, safeExp.chainId, safeExp.safeTx);
      }

      const rep: StvaReport = {
        proxy: proxy.trim(),
        chainId,
        decoded,
        fingerprints,
        diffNotes: [],
        signingTime: [],
        executionTime: [],
        assumptions: [],
        level: 'amber',
        headline: 'Review complete — check the assumptions',
      };

      // derive the target implementation from calldata when possible
      const decArgs = decoded?.args as Record<string, unknown> | undefined;
      const implArg =
        (decArgs?.newImplementation as string) ||
        (decArgs?.implementation as string) ||
        (decArgs?.masterCopy as string) ||
        (decArgs?.singleton as string) ||
        newImpl.trim();
      const nestedData = (decArgs?.data as string) || '';

      const fetchImpl = async (addr: string): Promise<ImplInfo> => {
        if (!isHexAddress(addr)) return { address: addr || '(unknown)', fetchError: 'No valid address provided.' };
        try {
          const code = await getCode(chainId, addr);
          const c = code.data ?? '0x';
          if (c === '0x') return { address: addr, fetchError: 'No contract code at this address.' };
          const v = await import('viem');
          return {
            address: addr,
            codeHash: v.keccak256(c as `0x${string}`),
            sizeBytes: bytes(c),
            patterns: scanBytecodePatterns(c),
          };
        } catch (e) {
          return { address: addr, fetchError: (e as Error).message };
        }
      };

      // old implementation from the proxy slot (EIP-1967) when a proxy is given
      if (proxy.trim() && isHexAddress(proxy.trim())) {
        try {
          const slotVal = await getStorageAt(chainId, proxy.trim(), EIP1967.IMPLEMENTATION);
          const raw = slotVal.data ?? '0x';
          const oldAddr = '0x' + raw.slice(-40);
          if (BigInt(raw) === 0n) {
            rep.oldImpl = { address: '(slot empty)', fetchError: 'EIP-1967 implementation slot is empty (unknown proxy type / not a transparent proxy?).' };
          } else {
            rep.oldImpl = await fetchImpl(oldAddr);
          }
          const latest = await getBlockByNumber(chainId, 'latest');
          if (latest.data) {
            rep.snapshot = {
              blockNumber: Number(BigInt(String(latest.data.number))),
              blockHash: String(latest.data.hash),
            };
          }
        } catch (e) {
          rep.assumptions.push('Proxy state not readable: ' + (e as Error).message);
        }
      }

      if (isHexAddress(implArg)) rep.newImpl = await fetchImpl(implArg);
      rep.diffNotes = diffImpls(rep.oldImpl, rep.newImpl);

      // registry check: is the target a canonical Safe singleton?
      rep.singletonCheck = isHexAddress(implArg) ? lookupSafeSingleton(implArg) ?? null : null;
      if (rep.singletonCheck) {
        const sc = rep.singletonCheck;
        rep.diffNotes.push(
          `Registry hit: target is Safe ${sc.variant} v${sc.version} (${sc.deployment}) — canonical address from safe-global/safe-deployments.`,
        );
        if (sc.version !== '1.5.0')
          rep.assumptions.push(
            `Target singleton v${sc.version}: since 09/2026 Safe recommends migrating to v1.5.0 (mandatory module guard, error return on failed transactions, ERC-1271 update).`,
          );
      } else if (isHexAddress(implArg)) {
        rep.assumptions.push(
          'Target implementation is NOT a canonical safe-deployments address — supply-chain risk: verify bytecode and source independently (explorer verification, deterministic deployment proof).',
        );
      }

      // ------ normative STVA three-way split ------
      const target = rep.proxy || implArg;
      rep.signingTime.push(
        decoded?.functionName
          ? `The signature authorizes the call ${decoded.functionName}(${Object.entries(decArgs ?? {})
              .map(([k, val]) => `${k}=${String(val).slice(0, 42)}`)
              .join(', ')}) on ${target || '(target unknown)'}.`
          : `The calldata (selector ${decoded?.selector ?? 'unknown'}) could not be resolved against the known descriptors — signature intent NOT clear.`,
      );
      if (decoded?.descriptor) {
        rep.signingTime.push(`Clear-signing descriptor: “${decoded.descriptor.label}”.`);
        if (decoded.descriptor.riskNote) rep.signingTime.push(`Risk note: ${decoded.descriptor.riskNote}`);
      } else {
        rep.signingTime.push(
          'No ERC-7730 descriptor registered: signer wallets may show only raw hex data. Since 05/2026 descriptors come from the EF-hosted registry (clearsigning.org); ERC-8176 defines the associated audit attestations. Check there whether a descriptor exists for target+selector.',
        );
      }
      rep.signingTime.push(
        `Calldata digest (cryptographic fingerprint): ${fingerprints.calldataDigest} — matches the ERC-8213 calldata-digest fallback: exactly these bytes can be cross-checked on the signer.`,
      );
      if (fingerprints.safeTxHash) rep.signingTime.push(`Safe signing hash (safeTxHash): ${fingerprints.safeTxHash}`);
      if (fingerprints.eip712)
        rep.signingTime.push(`EIP-712: Domain ${fingerprints.eip712.domainSeparator} · Message ${fingerprints.eip712.messageHash}`);

      if (decoded?.functionName === 'upgradeTo') {
        rep.executionTime.push('Guaranteed EXCLUSIVELY: overwriting the implementation slot (EIP-1967) with the new address. No further execution effects from this calldata.');
      } else if (decoded?.functionName === 'upgradeToAndCall' || decoded?.functionName === 'upgradeAndCall') {
        rep.executionTime.push('Guaranteed: overwriting the implementation slot AND immediate execution of the supplied initialization calldata in the proxy context.');
        if (nestedData && nestedData !== '0x') {
          const nested = await decodeUpgradeCalldata(nestedData);
          rep.executionTime.push(
            nested?.functionName
              ? `Nested call decoded: ${nested.functionName}(${Object.keys((nested.args as object) ?? {}).join(', ')}).`
              : `Nested calldata (${nestedData.slice(0, 10)}…) matches NO known pattern — content not guaranteed to be recognizable.`,
          );
        } else {
          rep.executionTime.push('Initialization calldata is empty.');
        }
      } else if (decoded?.functionName === 'execTransaction') {
        rep.executionTime.push('Guaranteed: execution of the nested multisig transaction (to/value/data) — see the intent level; DelegateCall operation = 1 would be critical (here: ' + String(decArgs?.operation ?? '?') + ').');
      } else {
        rep.executionTime.push('No guaranteed effect derivable: without decoding it is NOT provable which state changes the execution causes at minimum.');
      }

      rep.assumptions.push(
        `Assumption: no malicious logic in the new bytecode — not provable from calldata. ${
          rep.newImpl?.codeHash ? `Pinned code hash: ${rep.newImpl.codeHash}` : 'Code hash could not be pinned.'
        }`,
      );
      rep.assumptions.push(
        `Assumption: no storage collision between the old and new implementation — ${
          layoutOld.trim() || layoutNew.trim() ? 'see the layout comparison below.' : 'no layouts pasted → NOT checked.'
        }`,
      );
      if (rep.snapshot) {
        rep.assumptions.push(`All statements bound to block ${rep.snapshot.blockNumber} (${rep.snapshot.blockHash}).`);
        rep.assumptions.push('Assumption: no state change between review and execution (implementation slot as in the snapshot).');
      } else {
        rep.assumptions.push('No block snapshot available — temporal binding of the assumptions NOT given.');
      }
      rep.assumptions.push(
        `Verification status (explorer): ${ { unknown: 'unknown — not confirmed by the user', both: 'old & new marked as verified by the user', 'new-only': 'only new marked as verified', 'old-only': 'only old marked as verified', none: 'neither verified' }[verifiedHint] }.`,
      );

      // Layout-Diff
      const lo = new Set(
        layoutOld
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => (l.split(/[:=,;|]/)[0] ?? '').trim()),
      );
      const ln = new Set(
        layoutNew
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => (l.split(/[:=,;|]/)[0] ?? '').trim()),
      );
      const added = [...ln].filter((s) => !lo.has(s));
      const removed = [...lo].filter((s) => !ln.has(s));
      if ((layoutOld.trim() || layoutNew.trim()) && (added.length || removed.length)) {
        rep.diffNotes.push(`Storage layout diff: ${added.length} new slots (${added.join(', ') || '–'}), ${removed.length} removed (${removed.join(', ') || '–'}).`);
        rep.assumptions.push('Assumption: new layout slots sit above the old allocation — run 7702 SlotGuard to factually check for account collisions.');
      }

      const red =
        !decoded?.functionName ||
        (rep.newImpl?.fetchError && isHexAddress(implArg)) ||
        rep.diffNotes.some((n) => n.includes('Risky pattern new/increased'));
      const green =
        decoded?.functionName && !rep.diffNotes.some((n) => n.includes('Risky pattern new/increased')) && rep.snapshot && verifiedHint === 'both';
      rep.level = red ? 'red' : green ? 'green' : 'amber';
      rep.headline =
        rep.level === 'green'
          ? 'Intent & effect consistent — assumptions documented'
          : rep.level === 'red'
            ? 'Resolve critical points before signing'
            : 'Signing possible — mind the assumption level';

      setReport(rep);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reportJson = useMemo(() => ({ tool: 'stva-upgradediff', generatedAt: new Date().toISOString(), report }), [report]);

  const markdownProtocol = () => {
    if (!report) return '';
    const lines = [
      `# STVA review report`,
      ``,
      `Date: ${new Date().toISOString()}`,
      `Proxy: ${report.proxy || '-'} · ChainId: ${report.chainId}`,
      report.snapshot ? `Snapshot: block ${report.snapshot.blockNumber} (${report.snapshot.blockHash})` : `Snapshot: not available`,
      ``,
      `## 1. Verified signature intent (signing time)`,
      ...report.signingTime.map((s) => `- ${s}`),
      ``,
      `## 2. Enforced execution effect (execution time)`,
      ...report.executionTime.map((s) => `- ${s}`),
      ``,
      `## 3. Unchecked execution assumptions (simulation time)`,
      ...report.assumptions.map((s) => `- ${s}`),
      ``,
      `## Old vs. new implementation comparison`,
      ...report.diffNotes.map((s) => `- ${s}`),
      ``,
      `Overall status: ${report.level.toUpperCase()} — ${report.headline}`,
      ``,
      `Generated locally by AndrexTheDev STVA-UpgradeDiff.`,
    ];
    return lines.join('\n');
  };

  return (
    <div className="space-y-5">
      <StepSection
        n={1}
        title="Enter upgrade data"
        hint="Proxy, new implementation and the calldata to be signed — or a Safe transaction export (JSON). Optional: EIP-712 typed data for complete fingerprints."
      >
        <div className="flex flex-wrap gap-2 items-center">
          <DemoButton onClick={demo} />
          <span className="text-xs text-dim">Demo: upgradeToAndCall payload with Safe export</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="label" htmlFor="sd-net">Network</label>
            <ChainSingleSelect value={chainId} onChange={setChainId} />
          </div>
          <div>
            <label className="label" htmlFor="sd-proxy">Proxy address (optional)</label>
            <input id="sd-proxy" className="input mono" placeholder="0x…" value={proxy} onChange={(e) => setProxy(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sd-new">New implementation (optional, if not from calldata)</label>
            <input id="sd-new" className="input mono" placeholder="0x…" value={newImpl} onChange={(e) => setNewImpl(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="sd-cd">Raw calldata</label>
          <textarea id="sd-cd" className="textarea mono" placeholder="0x4f1ef286…" value={calldata} onChange={(e) => setCalldata(e.target.value)} />
        </div>
        <details className="acc">
          <summary>Safe export / EIP-712 / layouts (optional)</summary>
          <div className="acc-body space-y-4">
            <div>
              <label className="label" htmlFor="sd-safe">Safe transaction export (JSON)</label>
              <textarea id="sd-safe" className="textarea mono" rows={4} placeholder='{"safe":"0x…","chainId":1,"tx":{…}}' value={safeJson} onChange={(e) => setSafeJson(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="sd-td">EIP-712 typed data (JSON, optional)</label>
              <textarea id="sd-td" className="textarea mono" rows={3} placeholder='{"domain":{…},"types":{…},"primaryType":"…","message":{…}}' value={typedJson} onChange={(e) => setTypedJson(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="sd-lo">Storage layout old</label>
                <textarea id="sd-lo" className="textarea mono" rows={3} placeholder={'0x0: admin\n0x1: paused'} value={layoutOld} onChange={(e) => setLayoutOld(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="sd-ln">Storage layout new</label>
                <textarea id="sd-ln" className="textarea mono" rows={3} placeholder={'0x0: admin\n0x1: paused\n0x2: treasury'} value={layoutNew} onChange={(e) => setLayoutNew(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="sd-ver">Verification status (confirmed by the user)</label>
              <select id="sd-ver" className="select" value={verifiedHint} onChange={(e) => setVerifiedHint(e.target.value as typeof verifiedHint)}>
                <option value="unknown">unknown</option>
                <option value="both">old &amp; new verified</option>
                <option value="new-only">only new verified</option>
                <option value="old-only">only old verified</option>
                <option value="none">neither verified</option>
              </select>
            </div>
          </div>
        </details>
      </StepSection>

      <StepSection n={2} title="Start three-level verification">
        <p className="text-sm">
          Decodes the calldata, computes cryptographic fingerprints (calldata digest, EIP-712 hashes, Safe
          safeTxHash), compares the old and new implementation via bytecode hash and pattern scan — and forces the
          result into the three STVA categories instead of a blanket statement.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Analyzing…' : 'Analyze'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {report && (
        <StepSection n={3} title="STVA review report">
          <StatusTile level={report.level} headline={report.headline} detail={report.snapshot ? `Snapshot: block ${report.snapshot.blockNumber} on ${chainById(report.chainId)?.name}.` : 'No chain snapshot — assumptions not bound in time.'} />
          <KpiGrid>
            <Kpi label="Decoded" value={report.decoded?.functionName ?? 'no'} tone={report.decoded?.functionName ? 'green' : 'red'} />
            <Kpi label="Descriptor" value={report.decoded?.descriptor ? 'found' : 'missing'} tone={report.decoded?.descriptor ? 'green' : 'amber'} />
            <Kpi label="Patterns old" value={report.oldImpl?.patterns?.length ?? 0} />
            <Kpi label="Patterns new" value={report.newImpl?.patterns?.length ?? 0} tone={(report.newImpl?.patterns?.length ?? 0) > (report.oldImpl?.patterns?.length ?? 0) ? 'red' : 'default'} />
          </KpiGrid>

          <div className="grid gap-3">
            <details className="acc" open>
              <summary><span className="text-prime-hi">1 — Verified signature intent (signing time)</span></summary>
              <div className="acc-body">
                <ul className="list-disc ml-5 space-y-1">
                  {report.signingTime.map((s, i) => (
                    <li key={i} className="break-all">{s}</li>
                  ))}
                </ul>
              </div>
            </details>
            <details className="acc" open>
              <summary><span className="text-prime-hi">2 — Enforced execution effect (execution time)</span></summary>
              <div className="acc-body">
                <ul className="list-disc ml-5 space-y-1">
                  {report.executionTime.map((s, i) => (
                    <li key={i} className="break-all">{s}</li>
                  ))}
                </ul>
              </div>
            </details>
            <details className="acc" open>
              <summary><span className="text-gold-hi">3 — Unchecked execution assumptions (simulation time)</span></summary>
              <div className="acc-body">
                <ul className="list-disc ml-5 space-y-1">
                  {report.assumptions.map((s, i) => (
                    <li key={i} className="break-all">{s}</li>
                  ))}
                </ul>
              </div>
            </details>
            <details className="acc">
              <summary>Implementation comparison</summary>
              <div className="acc-body space-y-2">
                <table className="table-x">
                  <thead>
                    <tr><th></th><th>Old</th><th>New</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Address</td><td className="mono text-xs break-all">{shortHex(report.oldImpl?.address ?? '—', 12, 8)}</td><td className="mono text-xs break-all">{shortHex(report.newImpl?.address ?? '—', 12, 8)}</td></tr>
                    {report.singletonCheck !== undefined && (
                      <tr>
                        <td>Registry</td>
                        <td>—</td>
                        <td>
                          {report.singletonCheck ? (
                            <span className="badge badge-green">
                              Safe {report.singletonCheck.variant} v{report.singletonCheck.version} · {report.singletonCheck.deployment}
                            </span>
                          ) : (
                            <span className="badge badge-amber">not a canonical singleton</span>
                          )}
                        </td>
                      </tr>
                    )}
                    <tr><td>Code-Hash</td><td className="mono text-xs break-all">{shortHex(report.oldImpl?.codeHash ?? '—', 12, 8)}</td><td className="mono text-xs break-all">{shortHex(report.newImpl?.codeHash ?? '—', 12, 8)}</td></tr>
                    <tr><td>Size</td><td>{report.oldImpl?.sizeBytes ?? '—'} B</td><td>{report.newImpl?.sizeBytes ?? '—'} B</td></tr>
                    <tr>
                      <td>Patterns</td>
                      <td>{(report.oldImpl?.patterns ?? []).map((p) => `${p.opcode.split(' ')[0]}×${p.count}`).join(', ') || 'none'}</td>
                      <td>{(report.newImpl?.patterns ?? []).map((p) => `${p.opcode.split(' ')[0]}×${p.count}`).join(', ') || 'none'}</td>
                    </tr>
                  </tbody>
                </table>
                <ul className="list-disc ml-5 space-y-1 text-sm">
                  {report.diffNotes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                  {(report.oldImpl?.fetchError || report.newImpl?.fetchError) && (
                    <li className="text-gold-hi">{report.oldImpl?.fetchError ?? ''} {report.newImpl?.fetchError ?? ''}</li>
                  )}
                </ul>
              </div>
            </details>
          </div>

          <ExportBar
            onJson={() => downloadJSON(reportJson, 'stva-upgradediff-report.json')}
            onPrint={() =>
              openPrintableReport({
                title: 'STVA-UpgradeDiff Review Report',
                subtitle: `Proxy ${report.proxy || '-'} · Chain ${report.chainId} · ${new Date().toLocaleString('en-GB')}`,
                status: { level: report.level, headline: report.headline, detail: report.snapshot ? `Block ${report.snapshot.blockNumber} (${report.snapshot.blockHash})` : undefined },
                sections: [
                  { heading: '1. Signature intent', body: '<ul>' + report.signingTime.map((s) => `<li>${s}</li>`).join('') + '</ul>' },
                  { heading: '2. Execution effect', body: '<ul>' + report.executionTime.map((s) => `<li>${s}</li>`).join('') + '</ul>' },
                  { heading: '3. Execution assumptions', body: '<ul>' + report.assumptions.map((s) => `<li>${s}</li>`).join('') + '</ul>' },
                  { heading: 'Implementation diff', body: '<ul>' + report.diffNotes.map((s) => `<li>${s}</li>`).join('') + '</ul>' },
                ],
              })
            }
            onHtml={() => {
              const blob = new Blob([markdownProtocol()], { type: 'text/markdown' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'stva-review-report.md';
              a.click();
            }}
            extra={<CopyButton text={markdownProtocol()} label="Copy Markdown" compact />}
          />
        </StepSection>
      )}
    </div>
  );
}
