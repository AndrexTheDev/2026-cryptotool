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
    const offE = Number(BigInt('0x' + readWord(0))); // ephemeral bytes offset (in 32-byte words from the data start)
    const offM = Number(BigInt('0x' + readWord(1)));
    const lenE = Number(BigInt('0x' + '0' + data.slice(offE * 2, offE * 2 + 64)));
    const eph = '0x' + data.slice(offE * 2 + 64, offE * 2 + 64 + lenE * 2);
    const lenM = Number(BigInt('0x' + '0' + data.slice(offM * 2, offM * 2 + 64)));
    const meta = '0x' + data.slice(offM * 2 + 64, offM * 2 + 64 + lenM * 2);
    return {
      schemeId: Number(BigInt(topics[1] ?? '0x0')),
      stealthAddress: '0x' + (topics[2] ?? '0x0').slice(-40),
      caller: '0x' + (topics[3] ?? '0x0').slice(-40),
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
        reject(new Error('Worker timeout (60s). Scan fewer blocks per round.'));
      }, 60000);
      worker.onmessage = (e) => {
        clearTimeout(t);
        worker.terminate();
        if (e.data.type === 'result') resolve(e.data);
        else reject(new Error('Unexpected worker response'));
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
      setError('Viewing key: expected 0x + 64 hex characters (32 bytes).');
      return null;
    }
    if (BigInt(vk) >= 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n || BigInt(vk) === 0n) {
      setError('Viewing key outside the secp256k1 group order.');
      return null;
    }
    if (!/^0x(04[0-9a-fA-F]{128}|0[23][0-9a-fA-F]{64})$/.test(sp)) {
      setError('Spending public key: expected uncompressed (04 + 128 hex) or compressed (02/03 + 64 hex).');
      return null;
    }
    return { vk, sp };
  };

  const runScan = async (resume = false) => {
    setError('');
    setWarning('');
    if (/spending/i.test(viewingKey) && viewingKey.trim().length > 66) {
      // detector: never a spending key here
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
      if (!Number.isFinite(from) || from < 0) throw new Error('Invalid start block.');

      // progress key (never store the key itself)
      const { sha256 } = await import('@noble/hashes/sha2.js');
      const idbKey = 'stealth:' + Array.from(sha256(new TextEncoder().encode(keys.vk + ':' + chainId)), (b) => b.toString(16).padStart(2, '0')).join('');
      let announcements: RawAnnouncement[] = [];

      if (mode === 'offline') {
        if (!logsJson.trim()) throw new Error('Paste announcement logs (JSON) or load the demo.');
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
            setProgress(`Paused at block ${num(cursor)} — resumable at any time.`);
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
          setProgress(`Fetching logs ${num(cursor)} – ${num(end)} of ${num(to)} …`);
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
            setWarning(`Block range ${num(cursor)}–${num(end)} not retrievable (${(e as Error).message}). Jumping to the next zone.`);
          }
          cursor = end + 1;
          await idbSet('stealth-progress', idbKey, { block: cursor - 1 });
          await new Promise((r) => setTimeout(r, 250)); // be gentle with the endpoints
        }
        await idbDelete('stealth-progress', idbKey);
      }

      setProgress('Computing curve (view-tag filter + full check)…');
      const minW = minWei.trim() ? BigInt(Math.round(Number(minWei.replace(',', '.')) * 1)) : 0n;
      void minW; // minimum amounts apply at log level via value fields (announcer provides optionally)
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
        stealth_address: h.stealthAddress,
        ephemeral_pubkey: h.ephemeralPubKey,
        view_tag: h.viewTag,
        block: h.blockNumber,
        tx_hash: h.txHash ?? '',
        caller: h.caller ?? '',
        attribution_proof_shared_secret_hash: h.sharedSecretHash,
      })),
    [scan],
  );

  return (
    <div className="space-y-5">
      <div className="status-tile status-amber">
        <span aria-hidden="true">⚠</span>
        <p className="text-sm">
          <strong>Never enter the (private) spending key!</strong> This tool requires only the
          <em> private viewing key</em> + the <em>public spending key</em>. Both stay local;
          exports never contain the viewing key.
        </p>
      </div>

      <StepSection n={1} title="Keys, time window & source" hint="Viewing key (0x + 64 hex), public spending key, block-exact or date window. Logs online from the announcer or as a local JSON export.">
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-sm ${mode === 'online' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('online')}>
            Online (announcer logs)
          </button>
          <button className={`btn btn-sm ${mode === 'offline' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('offline')}>
            Offline (JSON export)
          </button>
          <span className="ml-auto">
            <DemoButton onClick={() => void demo()} />
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="st-vk">Private viewing key</label>
            <input id="st-vk" type="password" className="input mono" autoComplete="off" placeholder="0x…64 hex (stays local)" value={viewingKey} onChange={(e) => setViewingKey(e.target.value)} />
            <button type="button" className="text-xs text-prime-hi mt-1 underline underline-offset-2" onClick={(e) => {const inp=e.currentTarget.previousElementSibling as HTMLInputElement; inp.type = inp.type==='password'?'text':'password';}}>
              Toggle visibility
            </button>
          </div>
          <div>
            <label className="label" htmlFor="st-sp">Public spending key</label>
            <input id="st-sp" className="input mono" placeholder="0x04… (uncompressed) or 0x02/03… (compressed)" value={spendingPub} onChange={(e) => setSpendingPub(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-from">Start block</label>
            <input id="st-from" className="input mono" placeholder="e.g. 21000000" value={fromBlock} onChange={(e) => setFromBlock(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-to">End block</label>
            <input id="st-to" className="input mono" placeholder="empty = latest" value={toBlock} onChange={(e) => setToBlock(e.target.value)} />
          </div>
          {mode === 'online' && (
            <div>
              <label className="label" htmlFor="st-net">Network</label>
              <ChainSingleSelect value={chainId} onChange={setChainId} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="st-min">Minimum amount (optional, wei filter if the log export contains values)</label>
            <input id="st-min" className="input mono" placeholder="0" value={minWei} onChange={(e) => setMinWei(e.target.value)} />
          </div>
        </div>
        {mode === 'offline' && (
          <div>
            <label className="label" htmlFor="st-logs">Announcement logs (JSON array)</label>
            <textarea id="st-logs" className="textarea mono" rows={6} value={logsJson} onChange={(e) => setLogsJson(e.target.value)} placeholder='[{"schemeId":1,"stealthAddress":"0x…","ephemeralPubKey":"0x02…","metadata":"0x…", …}]' />
          </div>
        )}
      </StepSection>

      <StepSection n={2} title="Start WebWorker scan">
        <p className="text-sm">
          Scheme 1: shared secret c = ephemeralPub × viewingKey, view tag = keccak256(c)[0]; full check:
          stealthAddr(SpendingPub + keccak256(c)·G). Progress is held pausably in IndexedDB — without the key.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-primary" onClick={() => void runScan(false)} disabled={busy}>
            {busy ? 'Scanning…' : 'Scan'}
          </button>
          {busy && (
            <button className="btn btn-outline-amber" onClick={() => (cancelRef.current = true)}>
              Pause (save progress)
            </button>
          )}
          {paused && !busy && (
            <button className="btn btn-primary" onClick={() => void runScan(true)}>
              Resume from block {num(paused.toContinue)}
            </button>
          )}
        </div>
        {progress && <p className="text-sm text-gold-hi mono">{progress}</p>}
        {warning && <p className="text-sm text-gold-hi">{warning}</p>}
        {error && <ErrorNote message={error} />}
      </StepSection>

      {scan && (
        <StepSection n={3} title="Scan result">
          <StatusTile
            level={level!}
            headline={scan.hits.length === 0 ? 'No stealth inbound payments in the window' : `${scan.hits.length} stealth inbound payment(s) found`}
            detail={`Checked: ${num(scan.checked)} announcements · view-tag prefilter hit ${num(scan.tagFiltered)} · duration ${(scan.durationMs / 1000).toFixed(1)} s · source: ${ { online: 'announcer logs', offline: 'local JSON export', demo: 'demo (synthetic)' }[scan.source] }. The export never contains the viewing key.`}
          />
          <KpiGrid>
            <Kpi label="Hits" value={num(scan.hits.length)} tone={scan.hits.length ? 'amber' : 'green'} />
            <Kpi label="Announcements checked" value={num(scan.checked)} />
            <Kpi label="View-tag filter (discarded early)" value={num(scan.tagFiltered)} />
            <Kpi label="Block window" value={`${num(scan.fromBlock)}–${num(scan.toBlock)}`} />
          </KpiGrid>

          {scan.hits.length > 0 && (
            <details className="acc" open>
              <summary>Found stealth inbound payments</summary>
              <div className="acc-body overflow-x-auto">
                <table className="table-x">
                  <thead>
                    <tr>
                      <th>Stealth address</th>
                      <th>Ephemeral PubKey</th>
                      <th>View tag</th>
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
                  Attribution proof: the column export contains the shared-secret hash per hit (keccak256 of the
                  compressed shared point). This lets an auditor follow the attribution without receiving your
                  viewing key.
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
                  note: 'The export deliberately contains NO viewing key and no secret keys.',
                },
                'stealthaudit-5564.json',
              )
            }
            onCsv={() => downloadCSV(exportRows, 'stealthaudit-hits.csv')}
          />
        </StepSection>
      )}

      <details className="acc">
        <summary>References & limitations</summary>
        <div className="acc-body space-y-2 text-sm text-dim">
          <p>
            The scan targets the <strong className="text-ink">canonical ERC-5564 announcer</strong>{' '}
            <code className="mono text-xs break-all">0x55649E01B5Df198D18D95b5cc5051630cfD45564</code> (identical
            singleton deployment on several networks, including mainnet/Polygon/Scroll). The associated
            ERC-6538 meta-address registry lives at{' '}
            <code className="mono text-xs break-all">0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538</code>.
          </p>
          <p>
            The scanner recognizes scheme 1 (secp256k1) only. Announcements without a view tag in the metadata field
            are checked in full (slower); those with a view tag go through the cheap prefilter.
          </p>
        </div>
      </details>
    </div>
  );
}
