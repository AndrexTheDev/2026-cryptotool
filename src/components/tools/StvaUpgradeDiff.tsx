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
  parseSafeExport,
  type DecodedCall,
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
  snapshot?: { blockNumber: number; blockHash: string };
  diffNotes: string[];
  signingTime: string[];
  executionTime: string[];
  assumptions: string[];
  level: StatusLevel;
  headline: string;
}

const DEMO_CALLDATA =
  '0x4f1ef2860000000000000000000000008ba1f109551bd432803012645ac136ddd64dba7200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000';
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
    if (oldI.codeHash === newI.codeHash) notes.push('Identischer Bytecode-Hash: alter und neuer Code sind gleich (kein effektives Upgrade?).');
    else notes.push('Bytecode-Hash unterscheidet sich — kompletter Austausch der Ausfuehrungslogik.');
  }
  if (oldI?.sizeBytes != null && newI?.sizeBytes != null) {
    notes.push(`Code-Groesse: alt ${oldI.sizeBytes} B → neu ${newI.sizeBytes} B (Δ ${(newI.sizeBytes - oldI.sizeBytes).toLocaleString('de-DE')} B).`);
  }
  const oSet = new Map((oldI?.patterns ?? []).map((p) => [p.opcode, p.count]));
  const nSet = new Map((newI?.patterns ?? []).map((p) => [p.opcode, p.count]));
  const keys = new Set([...oSet.keys(), ...nSet.keys()]);
  keys.forEach((k) => {
    const o = oSet.get(k) ?? 0;
    const n = nSet.get(k) ?? 0;
    if (n > o) notes.push(`Riskantes Muster neu/vermehrt: ${k} (${o} → ${n}).`);
    if (o > 0 && n === 0) notes.push(`Muster entfernt: ${k} (${o} → 0).`);
  });
  if (oldI?.fetchError || newI?.fetchError) notes.push('Mindestens ein Bytecode-Abruf schlug fehl — Vergleich basiert auf Teildaten.');
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
    setNewImpl('0x8ba1f109551bD432803012645Ac136ddd64DBA72');
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
      setError('Calldata fehlt: bitte Roh-Calldata einfuegen oder einen Safe-Export verwenden.');
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
        else setError('EIP-712-JSON nicht dekodierbar — Fingerprints dafuer entfallen.');
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
        headline: 'Prüfung abgeschlossen — Annahmen prüfen',
      };

      // Ziel-Implementierung aus Calldata ableiten, wenn moeglich
      const decArgs = decoded?.args as Record<string, unknown> | undefined;
      const implArg = (decArgs?.newImplementation as string) || newImpl.trim();
      const nestedData = (decArgs?.data as string) || '';

      const fetchImpl = async (addr: string): Promise<ImplInfo> => {
        if (!isHexAddress(addr)) return { address: addr || '(unbekannt)', fetchError: 'Keine gueltige Adresse angegeben.' };
        try {
          const code = await getCode(chainId, addr);
          const c = code.data ?? '0x';
          if (c === '0x') return { address: addr, fetchError: 'Kein Contract-Code unter dieser Adresse.' };
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

      // Alte Implementierung aus Proxy-Slot (EIP-1967), wenn Proxy angegeben
      if (proxy.trim() && isHexAddress(proxy.trim())) {
        try {
          const slotVal = await getStorageAt(chainId, proxy.trim(), EIP1967.IMPLEMENTATION);
          const raw = slotVal.data ?? '0x';
          const oldAddr = '0x' + raw.slice(-40);
          if (BigInt(raw) === 0n) {
            rep.oldImpl = { address: '(Slot leer)', fetchError: 'EIP-1967-Implementierungs-Slot ist leer (Proxy-Typ unbekannt / kein Transparent-Proxy?).' };
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
          rep.assumptions.push('Proxy-Status nicht lesbar: ' + (e as Error).message);
        }
      }

      if (isHexAddress(implArg)) rep.newImpl = await fetchImpl(implArg);
      rep.diffNotes = diffImpls(rep.oldImpl, rep.newImpl);

      // ------ Normative STVA-Dreiteilung ------
      const target = rep.proxy || implArg;
      rep.signingTime.push(
        decoded?.functionName
          ? `Die Signatur autorisiert den Aufruf ${decoded.functionName}(${Object.entries(decArgs ?? {})
              .map(([k, val]) => `${k}=${String(val).slice(0, 42)}`)
              .join(', ')}) an ${target || '(Ziel unbekannt)'}.`
          : `Die Calldata (Selektor ${decoded?.selector ?? 'unbekannt'}) konnte nicht gegen die bekannten Deskriptoren aufgeloest werden — Signatur-Absicht NICHT klar.`,
      );
      if (decoded?.descriptor) {
        rep.signingTime.push(`Clear-Signing-Deskriptor: „${decoded.descriptor.label}".`);
        if (decoded.descriptor.riskNote) rep.signingTime.push(`Risiko-Hinweis: ${decoded.descriptor.riskNote}`);
      } else {
        rep.signingTime.push('Kein ERC-7730-Deskriptor hinterlegt: Anzeige auf Signer-Wallets zeigt ggf. nur rohe Hex-Daten.');
      }
      rep.signingTime.push(`Calldata-Digest (kryptografischer Fingerprint): ${fingerprints.calldataDigest}`);
      if (fingerprints.safeTxHash) rep.signingTime.push(`Safe Signing Hash (safeTxHash): ${fingerprints.safeTxHash}`);
      if (fingerprints.eip712)
        rep.signingTime.push(`EIP-712: Domain ${fingerprints.eip712.domainSeparator} · Message ${fingerprints.eip712.messageHash}`);

      if (decoded?.functionName === 'upgradeTo') {
        rep.executionTime.push('Garantiert wird AUSSCHLIESSLICH: Ueberschreiben des Implementierungs-Slots (EIP-1967) auf die neue Adresse. Keine weiteren Ausfuehrungseffekte aus dieser Calldata.');
      } else if (decoded?.functionName === 'upgradeToAndCall' || decoded?.functionName === 'upgradeAndCall') {
        rep.executionTime.push('Garantiert: Ueberschreiben des Implementierungs-Slots UND sofortige Ausfuehrung der mitgegebenen Initialisierungs-Calldata im Proxy-Kontext.');
        if (nestedData && nestedData !== '0x') {
          const nested = await decodeUpgradeCalldata(nested);
          rep.executionTime.push(
            nested?.functionName
              ? `Verschachtelter Aufruf dekodiert: ${nested.functionName}(${Object.keys((nested.args as object) ?? {}).join(', ')}).`
              : `Verschachtelte Calldata (${nestedData.slice(0, 10)}…) ist KEIN bekanntes Muster — Inhalt nicht garantiert erkennbar.`,
          );
        } else {
          rep.executionTime.push('Initialisierungs-Calldata ist leer.');
        }
      } else if (decoded?.functionName === 'execTransaction') {
        rep.executionTime.push('Garantiert: Ausfuehrung der verschachtelten Multisig-Transaktion (to/value/data) — siehe Absichtsebene; DelegateCall-Operation = 1 waere kritisch (hier: ' + String(decArgs?.operation ?? '?') + ').');
      } else {
        rep.executionTime.push('Kein garantierbarer Effekt ableitbar: Aufgrund fehlender Dekodierung ist NICHT beweisbar, welche Zustandsaenderungen die Ausfuehrung mindestens verursacht.');
      }

      rep.assumptions.push(
        `Annahme: Keine Schadlogik im neuen Bytecode — nicht beweisbar aus Calldata. ${
          rep.newImpl?.codeHash ? `Festgehaltener Code-Hash: ${rep.newImpl.codeHash}` : 'Code-Hash konnte nicht festgehalten werden.'
        }`,
      );
      rep.assumptions.push(
        `Annahme: Keine Storage-Kollision zwischen alter und neuer Implementierung — ${
          layoutOld.trim() || layoutNew.trim() ? 'Layout-Vergleich siehe unten.' : 'keine Layouts eingefuegt → NICHT geprueft.'
        }`,
      );
      if (rep.snapshot) {
        rep.assumptions.push(`Alle Aussagen gebunden an Block ${rep.snapshot.blockNumber} (${rep.snapshot.blockHash}).`);
        rep.assumptions.push('Annahme: Zwischen Pruefung und Ausfuehrung keine Zustandsaenderung (Implementierungs-Slot wie im Snapshot).');
      } else {
        rep.assumptions.push('Kein Block-Snapshot verfuegbar — zeitliche Bindung der Annahmen NICHT gegeben.');
      }
      rep.assumptions.push(
        `Verifizierungsstatus (Explorer): ${ { unknown: 'unbekannt — vom Nutzer nicht bestaetigt', both: 'alt & neu vom Nutzer als verifiziert markiert', 'new-only': 'nur neu als verifiziert markiert', 'old-only': 'nur alt als verifiziert markiert', none: 'keins verifiziert' }[verifiedHint] }.`,
      );

      // Layout-Diff
      const lo = new Set(
        layoutOld
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => l.split(/[:=,;|]/)[0].trim()),
      );
      const ln = new Set(
        layoutNew
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => l.split(/[:=,;|]/)[0].trim()),
      );
      const added = [...ln].filter((s) => !lo.has(s));
      const removed = [...lo].filter((s) => !ln.has(s));
      if ((layoutOld.trim() || layoutNew.trim()) && (added.length || removed.length)) {
        rep.diffNotes.push(`Storage-Layout-Diff: ${added.length} neue Slots (${added.join(', ') || '–'}), ${removed.length} entfernte (${removed.join(', ') || '–'}).`);
        rep.assumptions.push('Annahme: Neue Layout-Slots liegen oberhalb der alten Belegung — fuehren Sie 7702-SlotGuard aus, um Account-Kollisionen faktisch zu pruefen.');
      }

      const red =
        !decoded?.functionName ||
        (rep.newImpl?.fetchError && isHexAddress(implArg)) ||
        rep.diffNotes.some((n) => n.includes('Riskantes Muster neu/vermehrt'));
      const green =
        decoded?.functionName && !rep.diffNotes.some((n) => n.includes('Riskantes Muster neu/vermehrt')) && rep.snapshot && verifiedHint === 'both';
      rep.level = red ? 'red' : green ? 'green' : 'amber';
      rep.headline =
        rep.level === 'green'
          ? 'Absicht & Effekt konsistent — Annahmen dokumentiert'
          : rep.level === 'red'
            ? 'Kritische Punkte vor der Signatur klaeren'
            : 'Signatur moeglich — Annahmeebene beachten';

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
      `# STVA-Pruefprotokoll`,
      ``,
      `Datum: ${new Date().toISOString()}`,
      `Proxy: ${report.proxy || '-'} · ChainId: ${report.chainId}`,
      report.snapshot ? `Snapshot: Block ${report.snapshot.blockNumber} (${report.snapshot.blockHash})` : `Snapshot: nicht verfuegbar`,
      ``,
      `## 1. Verifizierte Signatur-Absicht (Signing-Time)`,
      ...report.signingTime.map((s) => `- ${s}`),
      ``,
      `## 2. Erzwungener Ausfuehrungs-Effekt (Execution-Time)`,
      ...report.executionTime.map((s) => `- ${s}`),
      ``,
      `## 3. Ungepruefte Ausfuehrungsannahmen (Simulation-Time)`,
      ...report.assumptions.map((s) => `- ${s}`),
      ``,
      `## Vergleich alter vs. neuer Implementierung`,
      ...report.diffNotes.map((s) => `- ${s}`),
      ``,
      `Gesamtstatus: ${report.level.toUpperCase()} — ${report.headline}`,
      ``,
      `Erzeugt lokal durch AndrexTheDev STVA-UpgradeDiff.`,
    ];
    return lines.join('\n');
  };

  return (
    <div className="space-y-5">
      <StepSection
        n={1}
        title="Upgrade-Daten eingeben"
        hint="Proxy, neue Implementierung und die zu signierende Calldata — oder ein Safe-Transaktions-Export (JSON). Optional: EIP-712-Typed-Data fuer vollstaendige Fingerprints."
      >
        <div className="flex flex-wrap gap-2 items-center">
          <DemoButton onClick={demo} />
          <span className="text-xs text-dim">Demo: upgradeToAndCall-Payload mit Safe-Export</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="label" htmlFor="sd-net">Netzwerk</label>
            <ChainSingleSelect value={chainId} onChange={setChainId} />
          </div>
          <div>
            <label className="label" htmlFor="sd-proxy">Proxy-Adresse (optional)</label>
            <input id="sd-proxy" className="input mono" placeholder="0x…" value={proxy} onChange={(e) => setProxy(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sd-new">Neue Implementierung (optional, falls nicht aus Calldata)</label>
            <input id="sd-new" className="input mono" placeholder="0x…" value={newImpl} onChange={(e) => setNewImpl(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="sd-cd">Roh-Calldata</label>
          <textarea id="sd-cd" className="textarea mono" placeholder="0x4f1ef286…" value={calldata} onChange={(e) => setCalldata(e.target.value)} />
        </div>
        <details className="acc">
          <summary>Safe-Export / EIP-712 / Layouts (optional)</summary>
          <div className="acc-body space-y-4">
            <div>
              <label className="label" htmlFor="sd-safe">Safe-Transaktions-Export (JSON)</label>
              <textarea id="sd-safe" className="textarea mono" rows={4} placeholder='{"safe":"0x…","chainId":1,"tx":{…}}' value={safeJson} onChange={(e) => setSafeJson(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="sd-td">EIP-712 Typed Data (JSON, optional)</label>
              <textarea id="sd-td" className="textarea mono" rows={3} placeholder='{"domain":{…},"types":{…},"primaryType":"…","message":{…}}' value={typedJson} onChange={(e) => setTypedJson(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="sd-lo">Storage-Layout alt</label>
                <textarea id="sd-lo" className="textarea mono" rows={3} placeholder={'0x0: admin\n0x1: paused'} value={layoutOld} onChange={(e) => setLayoutOld(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="sd-ln">Storage-Layout neu</label>
                <textarea id="sd-ln" className="textarea mono" rows={3} placeholder={'0x0: admin\n0x1: paused\n0x2: treasury'} value={layoutNew} onChange={(e) => setLayoutNew(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="sd-ver">Verifizierungsstatus (vom Nutzer bestaetigt)</label>
              <select id="sd-ver" className="select" value={verifiedHint} onChange={(e) => setVerifiedHint(e.target.value as typeof verifiedHint)}>
                <option value="unknown">unbekannt</option>
                <option value="both">alt &amp; neu verifiziert</option>
                <option value="new-only">nur neu verifiziert</option>
                <option value="old-only">nur alt verifiziert</option>
                <option value="none">keins verifiziert</option>
              </select>
            </div>
          </div>
        </details>
      </StepSection>

      <StepSection n={2} title="Drei-Ebenen-Verifizierung starten">
        <p className="text-sm">
          Dekodiert die Calldata, berechnet kryptografische Fingerprints (Calldata-Digest, EIP-712-Hashes, Safe
          safeTxHash), vergleicht alte und neue Implementierung per Bytecode-Hash und Muster-Scan — und zwingt das
          Ergebnis in die drei STVA-Kategorien statt in eine Pauschalaussage.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Analyse laeuft…' : 'Analysieren'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {report && (
        <StepSection n={3} title="STVA-Prüfbericht">
          <StatusTile level={report.level} headline={report.headline} detail={report.snapshot ? `Snapshot: Block ${report.snapshot.blockNumber} auf ${chainById(report.chainId)?.name}.` : 'Kein Chain-Snapshot — Annahmen zeitlich ungebunden.'} />
          <KpiGrid>
            <Kpi label="Dekodiert" value={report.decoded?.functionName ?? 'nein'} tone={report.decoded?.functionName ? 'green' : 'red'} />
            <Kpi label="Deskriptor" value={report.decoded?.descriptor ? 'gefunden' : 'fehlt'} tone={report.decoded?.descriptor ? 'green' : 'amber'} />
            <Kpi label="Muster alt" value={report.oldImpl?.patterns?.length ?? 0} />
            <Kpi label="Muster neu" value={report.newImpl?.patterns?.length ?? 0} tone={(report.newImpl?.patterns?.length ?? 0) > (report.oldImpl?.patterns?.length ?? 0) ? 'red' : 'default'} />
          </KpiGrid>

          <div className="grid gap-3">
            <details className="acc" open>
              <summary><span className="text-prime-hi">1 — Verifizierte Signatur-Absicht (Signing-Time)</span></summary>
              <div className="acc-body">
                <ul className="list-disc ml-5 space-y-1">
                  {report.signingTime.map((s, i) => (
                    <li key={i} className="break-all">{s}</li>
                  ))}
                </ul>
              </div>
            </details>
            <details className="acc" open>
              <summary><span className="text-prime-hi">2 — Erzwungener Ausfuehrungs-Effekt (Execution-Time)</span></summary>
              <div className="acc-body">
                <ul className="list-disc ml-5 space-y-1">
                  {report.executionTime.map((s, i) => (
                    <li key={i} className="break-all">{s}</li>
                  ))}
                </ul>
              </div>
            </details>
            <details className="acc" open>
              <summary><span className="text-gold-hi">3 — Ungepruefte Ausfuehrungsannahmen (Simulation-Time)</span></summary>
              <div className="acc-body">
                <ul className="list-disc ml-5 space-y-1">
                  {report.assumptions.map((s, i) => (
                    <li key={i} className="break-all">{s}</li>
                  ))}
                </ul>
              </div>
            </details>
            <details className="acc">
              <summary>Implementierungs-Vergleich</summary>
              <div className="acc-body space-y-2">
                <table className="table-x">
                  <thead>
                    <tr><th></th><th>Alt</th><th>Neu</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Adresse</td><td className="mono text-xs break-all">{shortHex(report.oldImpl?.address ?? '—', 12, 8)}</td><td className="mono text-xs break-all">{shortHex(report.newImpl?.address ?? '—', 12, 8)}</td></tr>
                    <tr><td>Code-Hash</td><td className="mono text-xs break-all">{shortHex(report.oldImpl?.codeHash ?? '—', 12, 8)}</td><td className="mono text-xs break-all">{shortHex(report.newImpl?.codeHash ?? '—', 12, 8)}</td></tr>
                    <tr><td>Groesse</td><td>{report.oldImpl?.sizeBytes ?? '—'} B</td><td>{report.newImpl?.sizeBytes ?? '—'} B</td></tr>
                    <tr>
                      <td>Muster</td>
                      <td>{(report.oldImpl?.patterns ?? []).map((p) => `${p.opcode.split(' ')[0]}×${p.count}`).join(', ') || 'keine'}</td>
                      <td>{(report.newImpl?.patterns ?? []).map((p) => `${p.opcode.split(' ')[0]}×${p.count}`).join(', ') || 'keine'}</td>
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
            onJson={() => downloadJSON(reportJson, 'stva-upgradediff-protokoll.json')}
            onPrint={() =>
              openPrintableReport({
                title: 'STVA-UpgradeDiff Review-Protokoll',
                subtitle: `Proxy ${report.proxy || '-'} · Chain ${report.chainId} · ${new Date().toLocaleString('de-DE')}`,
                status: { level: report.level, headline: report.headline, detail: report.snapshot ? `Block ${report.snapshot.blockNumber} (${report.snapshot.blockHash})` : undefined },
                sections: [
                  { heading: '1. Signatur-Absicht', body: '<ul>' + report.signingTime.map((s) => `<li>${s}</li>`).join('') + '</ul>' },
                  { heading: '2. Ausfuehrungs-Effekt', body: '<ul>' + report.executionTime.map((s) => `<li>${s}</li>`).join('') + '</ul>' },
                  { heading: '3. Ausfuehrungsannahmen', body: '<ul>' + report.assumptions.map((s) => `<li>${s}</li>`).join('') + '</ul>' },
                  { heading: 'Implementierungs-Diff', body: '<ul>' + report.diffNotes.map((s) => `<li>${s}</li>`).join('') + '</ul>' },
                ],
              })
            }
            onHtml={() => {
              const blob = new Blob([markdownProtocol()], { type: 'text/markdown' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'stva-review-protokoll.md';
              a.click();
            }}
            extra={<CopyButton text={markdownProtocol()} label="Markdown kopieren" compact />}
          />
        </StepSection>
      )}
    </div>
  );
}
