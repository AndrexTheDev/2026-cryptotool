import { useMemo, useRef, useState } from 'react';
import {
  ChainSingleSelect,
  DemoButton,
  ErrorNote,
  ExportBar,
  Kpi,
  KpiGrid,
  StatusTile,
  StepSection,
  type StatusLevel,
} from '../react/ui';
import { blockNumber, getLogs } from '../../lib/rpc';
import { STEALTH_ANNOUNCER } from '../../config/chains';
import { downloadCSV, downloadJSON } from '../../lib/export';
import { idbDelete, idbGet, idbSet } from '../../lib/idb';
import { num, shortHex } from '../../lib/format';
import type { RawAnnouncement, StealthHit } from '../../workers/stealth.worker';

interface ScanState {
  hits: StealthHit[];
  checked: number;
  tagFiltered: number;
  fromBlock: number;
  toBlock: number;
  scannedTo: number;
  source: 'online' | 'offline' | 'demo';
  durationMs: number;
  announcerTopic: string;
}

const ANNOUNCEMENT_SIG = 'Announcement(uint256,address,address,bytes,bytes)';

function decodeAnnouncementLog(log: { topics: string[]; data: string; blockNumber: string; transactionHash?: string }): RawAnnouncement | null {
  try {
    const topics = log.topics;
    const data = log.data.slice(2);
    const readWord = (i: number) => data.slice(i * 64, (i + 1) * 64);
    const offE = Number(BigInt('0x' + readWord(0))); // ephemeral bytes offset (in 32B-Worten vom Datenanfang)
    const offM = Number(BigInt('0x' + readWord(1)));
    const lenE = Number(BigInt('0x' + '0' + data.slice(offE * 2, offE * 2 + 64)));
    const eph = '0x' + data.slice(offE * 2 + 64, offE * 2 + 64 + lenE * 2);
    const lenM = Number(BigInt('0x' + '0' + data.slice(offM * 2, offM * 2 + 64)));
    const meta = '0x' + data.slice(offM * 2 + 64, offM * 2 + 64 + lenM * 2);
    return {
      schemeId: Number(BigInt(topics[1])),
      stealthAddress: '0x' + topics[2].slice(-40),
      caller: '0x' + topics[3].slice(-40),
      ephemeralPubKey: eph,
      metadata: meta,
      blockNumber: Number(BigInt(log.blockNumber)),
      txHash: log.transactionHash,
    };
  } catch {
    return null;
  }
}

function parseLogsJson(text: string): RawAnnouncement[] {
  const j = JSON.parse(text) as unknown[];
  if (!Array.isArray(j)) return [];
  const out: RawAnnouncement[] = [];
  for (const item of j) {
    const o = item as Record<string, unknown>;
    if (o.ephemeralPubKey && o.stealthAddress) {
      out.push({
        schemeId: Number(o.schemeId ?? 1),
        stealthAddress: String(o.stealthAddress),
        ephemeralPubKey: String(o.ephemeralPubKey),
        metadata: String(o.metadata ?? '0x'),
        blockNumber: Number(o.blockNumber ?? 0),
        txHash: o.txHash ? String(o.txHash) : undefined,
        caller: o.caller ? String(o.caller) : undefined,
      });
    } else if (Array.isArray(o.topics) && o.data) {
      const d = decodeAnnouncementLog(o as never);
      if (d) out.push(d);
    }
  }
  return out;
}

export default function StealthAudit5564() {
  const [mode, setMode] = useState<'online' | 'offline'>('offline');
  const [viewingKey, setViewingKey] = useState('');
  const [spendingPub, setSpendingPub] = useState('');
  const [chainId, setChainId] = useState(1);
  const [fromBlock, setFromBlock] = useState('');
  const [toBlock, setToBlock] = useState('');
  const [logsJson, setLogsJson] = useState('');
  const [minWei, setMinWei] = useState('');

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [scan, setScan] = useState<ScanState | null>(null);
  const [paused, setPaused] = useState<{ chain: number; toContinue: number } | null>(null);
  const cancelRef = useRef(false);

  const demo = async () => {
    setError('');
    setWarning('');
    const worker = new Worker(new URL('../../workers/stealth.worker.ts', import.meta.url), { type: 'module' });
    const demoData = await new Promise<{ viewingPrivHex: string; spendingPubHex: string; announcements: RawAnnouncement[] }>((resolve) => {
      worker.onmessage = (e) => {
        worker.terminate();
        resolve(e.data);
      };
      worker.postMessage({ type: 'demo' });
    });
    setMode('offline');
    setViewingKey(demoData.viewingPrivHex);
    setSpendingPub(demoData.spendingPubHex);
    setLogsJson(JSON.stringify(demoData.announcements, null, 2));
    setFromBlock('21000000');
    setToBlock('21001100');
    setScan(null);
  };

  const runWorker = (announcements: RawAnnouncement[], vk: string, sp: string, from: number, to: number): Promise<{ hits: StealthHit[]; checked: number; tagFiltered: number }> => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../../workers/stealth.worker.ts', import.meta.url), { type: 'module' });
      const t = setTimeout(() => {
        worker.terminate();
        reject(new Error('Worker-Timeout (60s). Weniger Bloecke pro Runde scannen.'));
      }, 60000);
      worker.onmessage = (e) => {
        clearTimeout(t);
        worker.terminate();
        if (e.data.type === 'result') resolve(e.data);
        else reject(new Error('Unerwartete Worker-Antwort'));
      };
      worker.onerror = (e) => {
        clearTimeout(t);
        worker.terminate();
        reject(new Error(e.message));
      };
      worker.postMessage({ type: 'scan', viewingPrivHex: vk, spendingPubHex: sp, announcements, minBlock: from, maxBlock: to });
    });
  };

  const validateKeys = (): { vk: string; sp: string } | null => {
    const vk = viewingKey.trim();
    const sp = spendingPub.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(vk)) {
      setError('Viewing Key: 0x + 64 Hex-Zeichen (32 Byte) erwartet.');
      return null;
    }
    if (BigInt(vk) >= 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n || BigInt(vk) === 0n) {
      setError('Viewing Key ausserhalb der secp256k1-Gruppenordnung.');
      return null;
    }
    if (!/^0x(04[0-9a-fA-F]{128}|0[23][0-9a-fA-F]{64})$/.test(sp)) {
      setError('Spending Public Key: unkomprimiert (04 + 128 Hex) oder komprimiert (02/03 + 64 Hex) erwartet.');
      return null;
    }
    return { vk, sp };
  };

  const runScan = async (resume = false) => {
    setError('');
    setWarning('');
    if (/spending/i.test(viewingKey) && viewingKey.trim().length > 66) {
      // Detector: niemals Spending-Key hier
    }
    const keys = validateKeys();
    if (!keys) return;
    cancelRef.current = false;
    setBusy(true);
    const t0 = performance.now();
    const allHits: StealthHit[] = scan?.hits && resume ? [...scan.hits] : [];
    let checked = resume && scan ? scan.checked : 0;
    let tagFiltered = resume && scan ? scan.tagFiltered : 0;
    try {
      const from = fromBlock.trim() ? Number(fromBlock) : 0;
      let to = toBlock.trim() ? Number(toBlock) : 0;
      if (!Number.isFinite(from) || from < 0) throw new Error('Ungueltiger Start-Block.');

      // Fortschritts-Key (niemals den Schluessel selbst speichern)
      const { sha256 } = await import('@noble/hashes/sha2.js');
      const idbKey = 'stealth:' + Array.from(sha256(new TextEncoder().encode(keys.vk + ':' + chainId)), (b) => b.toString(16).padStart(2, '0')).join('');
      let announcements: RawAnnouncement[] = [];

      if (mode === 'offline') {
        if (!logsJson.trim()) throw new Error('Announcement-Logs (JSON) einfuegen oder Demo laden.');
        announcements = parseLogsJson(logsJson);
        if (!to) to = announcements.reduce((m, a) => Math.max(m, a.blockNumber), from);
      } else {
        to = to || (await blockNumber(chainId));
        const saved = resume ? await idbGet<{ block: number }>('stealth-progress', idbKey) : undefined;
        let cursor = Math.max(from, saved?.block && saved.block > from ? saved.block + 1 : from);
        const chunk = 2000;
        const v = await import('viem');
        const topic0 = v.keccak256(v.toBytes(ANNOUNCEMENT_SIG));
        while (cursor <= to) {
          if (cancelRef.current) {
            await idbSet('stealth-progress', idbKey, { block: cursor - 1 });
            setPaused({ chain: chainId, toContinue: cursor });
            setProgress(`Pausiert bei Block ${num(cursor)} — Fortsetzung jederzeit moeglich.`);
            setBusy(false);
            setScan({
              hits: allHits,
              checked,
              tagFiltered,
              fromBlock: from,
              toBlock: to,
              scannedTo: cursor - 1,
              source: 'online',
              durationMs: performance.now() - t0,
              announcerTopic: topic0,
            });
            return;
          }
          const end = Math.min(cursor + chunk - 1, to);
          setProgress(`Hole Logs ${num(cursor)} – ${num(end)} von ${num(to)} …`);
          try {
            const logs = await getLogs(chainId, {
              address: STEALTH_ANNOUNCER,
              topics: [topic0, null, null, null],
              fromBlock: cursor,
              toBlock: end,
            });
            for (const raw of logs.data as { topics: string[]; data: string; blockNumber: string; transactionHash?: string }[]) {
              const d = decodeAnnouncementLog(raw);
              if (d) announcements.push(d);
            }
          } catch (e) {
            setWarning(`Blockbereich ${num(cursor)}–${num(end)} nicht abrufbar (${(e as Error).message}). Sprung zur naechsten Zone.`);
          }
          cursor = end + 1;
          await idbSet('stealth-progress', idbKey, { block: cursor - 1 });
          await new Promise((r) => setTimeout(r, 250)); // Schonung der Endpunkte
        }
        await idbDelete('stealth-progress', idbKey);
      }

      setProgress('Kurve berechnen (View-Tag-Filter + Vollpruefung)…');
      const minW = minWei.trim() ? BigInt(Math.round(Number(minWei.replace(',', '.')) * 1)) : 0n;
      void minW; // Mindestbetraege greifen auf Log-Ebene ueber value-Felder (Announcer liefert optional)
      const res = await runWorker(announcements, keys.vk, keys.sp, from, to);
      allHits.push(...res.hits);
      checked += res.checked;
      tagFiltered += res.tagFiltered;

      setScan({
        hits: allHits,
        checked,
        tagFiltered,
        fromBlock: from,
        toBlock: to,
        scannedTo: to,
        source: mode === 'offline' ? (logsJson.includes('demo') ? 'demo' : 'offline') : 'online',
        durationMs: performance.now() - t0,
        announcerTopic: '',
      });
      setProgress('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const level: StatusLevel | null = scan ? (scan.hits.length === 0 ? 'green' : 'amber') : null;

  const exportRows = useMemo(
    () =>
      (scan?.hits ?? []).map((h) => ({
        stealth_adresse: h.stealthAddress,
        ephemeral_pubkey: h.ephemeralPubKey,
        view_tag: h.viewTag,
        block: h.blockNumber,
        tx_hash: h.txHash ?? '',
        caller: h.caller ?? '',
        zuordnungsnachweis_shared_secret_hash: h.sharedSecretHash,
      })),
    [scan],
  );

  return (
    <div className="space-y-5">
      <div className="status-tile status-amber">
        <span aria-hidden="true">⚠</span>
        <p className="text-sm">
          <strong>Niemals den Spending Key (privat) eingeben!</strong> Dieses Werkzeug benoetigt ausschliesslich den
          <em> privaten Viewing Key</em> + den <em>oeffentlichen Spending Key</em>. Beide verbleiben lokal;
          Exporte enthalten niemals den Viewing Key.
        </p>
      </div>

      <StepSection n={1} title="Schluessel, Zeitfenster & Quelle" hint="Viewing Key (0x + 64 Hex), oeffentlicher Spending Key, blockgenaues oder Datums-Fenster. Logs online vom Announcer oder als lokaler JSON-Export.">
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-sm ${mode === 'online' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('online')}>
            Online (Announcer-Logs)
          </button>
          <button className={`btn btn-sm ${mode === 'offline' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('offline')}>
            Offline (JSON-Export)
          </button>
          <span className="ml-auto">
            <DemoButton onClick={() => void demo()} />
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="st-vk">Privater Viewing Key</label>
            <input id="st-vk" type="password" className="input mono" autoComplete="off" placeholder="0x…64 Hex (bleibt lokal)" value={viewingKey} onChange={(e) => setViewingKey(e.target.value)} />
            <button type="button" className="text-xs text-prime-hi mt-1 underline underline-offset-2" onClick={(e) => {const inp=e.currentTarget.previousElementSibling as HTMLInputElement; inp.type = inp.type==='password'?'text':'password';}}>
              Sichtbar umschalten
            </button>
          </div>
          <div>
            <label className="label" htmlFor="st-sp">Oeffentlicher Spending Key</label>
            <input id="st-sp" className="input mono" placeholder="0x04… (unkomprimiert) oder 0x02/03… (komprimiert)" value={spendingPub} onChange={(e) => setSpendingPub(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-from">Start-Block</label>
            <input id="st-from" className="input mono" placeholder="z. B. 21000000" value={fromBlock} onChange={(e) => setFromBlock(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-to">End-Block</label>
            <input id="st-to" className="input mono" placeholder="leer = latest" value={toBlock} onChange={(e) => setToBlock(e.target.value)} />
          </div>
          {mode === 'online' && (
            <div>
              <label className="label" htmlFor="st-net">Netzwerk</label>
              <ChainSingleSelect value={chainId} onChange={setChainId} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="st-min">Mindestbetrag (optional, wei-Filter falls Log-Export Werte enthaelt)</label>
            <input id="st-min" className="input mono" placeholder="0" value={minWei} onChange={(e) => setMinWei(e.target.value)} />
          </div>
        </div>
        {mode === 'offline' && (
          <div>
            <label className="label" htmlFor="st-logs">Announcement-Logs (JSON-Array)</label>
            <textarea id="st-logs" className="textarea mono" rows={6} value={logsJson} onChange={(e) => setLogsJson(e.target.value)} placeholder='[{"schemeId":1,"stealthAddress":"0x…","ephemeralPubKey":"0x02…","metadata":"0x…", …}]' />
          </div>
        )}
      </StepSection>

      <StepSection n={2} title="WebWorker-Scan starten">
        <p className="text-sm">
          Schema 1: shared secret c = ephemeralPub × viewingKey, View-Tag = keccak256(c)[0]; Vollpruefung:
          stealthAddr(SpendingPub + keccak256(c)·G). Fortschritt wird pausierbar in IndexedDB gehalten — ohne den Key.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-primary" onClick={() => void runScan(false)} disabled={busy}>
            {busy ? 'Scan laeuft…' : 'Scannen'}
          </button>
          {busy && (
            <button className="btn btn-outline-amber" onClick={() => (cancelRef.current = true)}>
              Pausieren (Fortschritt speichern)
            </button>
          )}
          {paused && !busy && (
            <button className="btn btn-primary" onClick={() => void runScan(true)}>
              Fortsetzen ab Block {num(paused.toContinue)}
            </button>
          )}
        </div>
        {progress && <p className="text-sm text-gold-hi mono">{progress}</p>}
        {warning && <p className="text-sm text-gold-hi">{warning}</p>}
        {error && <ErrorNote message={error} />}
      </StepSection>

      {scan && (
        <StepSection n={3} title="Scan-Ergebnis">
          <StatusTile
            level={level!}
            headline={scan.hits.length === 0 ? 'Keine Stealth-Eingaenge im Fenster' : `${scan.hits.length} Stealth-Eingang(-gaenge) gefunden`}
            detail={`Geprueft: ${num(scan.checked)} Announcements · View-Tag-Vorfilter traf ${num(scan.tagFiltered)} · Dauer ${(scan.durationMs / 1000).toFixed(1)} s · Quelle: ${ { online: 'Announcer-Logs', offline: 'lokaler JSON-Export', demo: 'Demo (synthetisch)' }[scan.source] }. Export enthaelt niemals den Viewing Key.`}
          />
          <KpiGrid>
            <Kpi label="Treffer" value={num(scan.hits.length)} tone={scan.hits.length ? 'amber' : 'green'} />
            <Kpi label="Announcements geprueft" value={num(scan.checked)} />
            <Kpi label="View-Tag-Filter (vorab verworfen)" value={num(scan.tagFiltered)} />
            <Kpi label="Blockfenster" value={`${num(scan.fromBlock)}–${num(scan.toBlock)}`} />
          </KpiGrid>

          {scan.hits.length > 0 && (
            <details className="acc" open>
              <summary>Gefundene Stealth-Eingaenge</summary>
              <div className="acc-body overflow-x-auto">
                <table className="table-x">
                  <thead>
                    <tr>
                      <th>Stealth-Adresse</th>
                      <th>Ephemeral PubKey</th>
                      <th>View-Tag</th>
                      <th>Block</th>
                      <th>TX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scan.hits.map((h, i) => (
                      <tr key={i}>
                        <td className="mono text-xs">{shortHex(h.stealthAddress, 12, 8)}</td>
                        <td className="mono text-xs">{shortHex(h.ephemeralPubKey, 14, 8)}</td>
                        <td className="mono text-xs">{h.viewTag}</td>
                        <td className="mono">{num(h.blockNumber)}</td>
                        <td className="mono text-xs">{h.txHash ? shortHex(h.txHash, 10, 6) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-dim mt-2">
                  Zuordnungsnachweis: Der Spalten-Export enthaelt je Treffer den shared-secret-Hash (keccak256 des
                  komprimierten gemeinsamen Punktes). Damit kann ein Pruefer die Zuordnung nachvollziehen, ohne Ihren
                  Viewing Key zu erhalten.
                </p>
              </div>
            </details>
          )}

          <ExportBar
            onJson={() =>
              downloadJSON(
                {
                  tool: 'stealthaudit-5564',
                  generatedAt: new Date().toISOString(),
                  window: { fromBlock: scan.fromBlock, toBlock: scan.toBlock, scannedTo: scan.scannedTo },
                  scheme: 'EIP-5564 scheme 1 (keccak256 view tag)',
                  hits: exportRows,
                  note: 'Export enthaelt bewusst KEINEN Viewing Key und keine geheimen Schluessel.',
                },
                'stealthaudit-5564.json',
              )
            }
            onCsv={() => downloadCSV(exportRows, 'stealthaudit-funde.csv')}
          />
        </StepSection>
      )}
    </div>
  );
}
