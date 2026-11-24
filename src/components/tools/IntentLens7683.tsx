import { useMemo, useState } from 'react';
import {
  ChainSingleSelect,
  CopyButton,
  DemoButton,
  ErrorNote,
  ExportBar,
  Kpi,
  KpiGrid,
  SourceBadge,
  StatusTile,
  StepSection,
  type StatusLevel,
} from '../react/ui';
import { getBlockByNumber, getTx } from '../../lib/rpc';
import { downloadJSON, openPrintableReport } from '../../lib/export';
import { isTxHash, shortHex } from '../../lib/format';
import {
  computeSpread,
  decodeOpenCalldata,
  encodeResolveFor,
  parseOrderJsonFull,
  resolveRefundRecipient,
  type DecodedOrder,
} from '../../lib/intents';

// demo: GaslessCrossChainOrder (EIP-712 JSON, Across-like orderData schema)
const DEMO_JSON = {
  "message": {
    "originSettler": "0x5c1ed95e70c9CF4b1f0Ae0e0c000000000000000",
    "user": "0x7777777777777777777777777777777777777777",
    "nonce": "42",
    "originChainId": "1",
    "openDeadline": 1763737200,
    "fillDeadline": 1763740800,
    "orderDataType": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "orderData": "0x000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000004ff4c0000000000000000000000000420000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000004f1528000000000000000000000000000000000000000000000000000000000000210500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000069208c8000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000"
  }
};
export default function IntentLens7683() {
  const [mode, setMode] = useState<'json' | 'calldata' | 'txhash'>('json');
  const [json, setJson] = useState('');
  const [calldata, setCalldata] = useState('');
  const [txhash, setTxhash] = useState('');
  const [chainId, setChainId] = useState(1);
  const [destChainId, setDestChainId] = useState(8453);
  const [refundAddr, setRefundAddr] = useState('');
  const [recipientAddr, setRecipientAddr] = useState('');
  const [manualNow, setManualNow] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState<DecodedOrder | null>(null);
  const [nowTs, setNowTs] = useState<number | null>(null);
  const [chainNote, setChainNote] = useState('');
  const [liveSrc, setLiveSrc] = useState<{ source: 'user' | 'wallet' | 'public' | 'cache'; at: number } | null>(null);
  const [refundCalldata, setRefundCalldata] = useState('');

  const demo = () => {
    setMode('json');
    setChainId(1);
    setDestChainId(8453);
    setJson(JSON.stringify(DEMO_JSON, null, 2));
    setCalldata('');
    setTxhash('');
    setRefundAddr('0x9999999999999999999999999999999999999999');
    setRecipientAddr('');
    setError('');
  };

  const run = async () => {
    setError('');
    setOrder(null);
    setRefundCalldata('');
    setBusy(true);
    try {
      let o: DecodedOrder | null = null;
      if (mode === 'json') {
        o = await parseOrderJsonFull(json);
        if (!o) throw new Error('JSON not interpretable as a GaslessCrossChainOrder.');
      } else if (mode === 'calldata') {
        if (!/^0x[0-9a-fA-F]+$/.test(calldata.trim())) throw new Error('Paste raw calldata as hex (0x…).');
        o = await decodeOpenCalldata(calldata);
      } else {
        if (!isTxHash(txhash.trim())) throw new Error('Provide a valid origin transaction hash (0x + 64 hex).');
        const tx = await getTx(chainId, txhash.trim());
        if (!tx.data) throw new Error('Transaction not found (choose a different origin network?).');
        setLiveSrc({ source: tx.source, at: tx.at });
        o = await decodeOpenCalldata(String(tx.data.input));
        o.originSettler = o.originSettler ?? String((tx.data as Record<string, unknown>).to ?? '');
      }
      setOrder(o);

      // time status: destination chain header or manual
      if (manualNow.trim()) {
        setNowTs(Math.floor(Date.parse(manualNow.trim()) / 1000));
        setChainNote('Time base: manual.');
      } else {
        try {
          const blk = await getBlockByNumber(destChainId, 'latest');
          if (blk.data) {
            setNowTs(Number(BigInt(String(blk.data.timestamp))));
            setChainNote(`Time base: latest block of destination chain ${destChainId}.`);
            setLiveSrc((prev) => prev ?? { source: blk.source, at: blk.at });
          }
        } catch {
          setNowTs(Math.floor(Date.now() / 1000));
          setChainNote('Time base: local clock (destination chain unreachable — mark as assumption).');
        }
      }

      // refund calldata (only possible with a fully decoded order)
      if (o.originSettler && o.user && o.nonce != null && o.originChainId != null && o.openDeadline != null && o.fillDeadline != null && o.orderDataType && o.orderData) {
        const cd = await encodeResolveFor({
          originSettler: o.originSettler,
          user: o.user,
          nonce: o.nonce,
          originChainId: o.originChainId,
          openDeadline: o.openDeadline,
          fillDeadline: o.fillDeadline,
          orderDataType: o.orderDataType,
          orderData: o.orderData,
        });
        setRefundCalldata(cd);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const spread = useMemo(() => (order ? computeSpread(order) : null), [order]);

  const deadline = useMemo(() => {
    if (!order?.fillDeadline || !nowTs) return null;
    const passed = nowTs >= order.fillDeadline;
    return { passed, delta: nowTs - order.fillDeadline };
  }, [order, nowTs]);

  const refundInfo = useMemo(() => {
    return resolveRefundRecipient({
      refundAddress: refundAddr.trim() || undefined,
      recipient: recipientAddr.trim() || undefined,
      depositor: order?.user,
    });
  }, [refundAddr, recipientAddr, order]);

  const level: StatusLevel | null = order
    ? deadline?.passed && refundCalldata
      ? 'amber'
      : spread && spread.spreadPct > 3
        ? 'amber'
        : 'green'
    : null;

  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleString('en-GB');

  return (
    <div className="space-y-5">
      <StepSection n={1} title="Paste your cross-chain swap order" hint="Paste a signed swap order (EIP-712 JSON), raw swap calldata, or the origin transaction hash. Tip: click “Load demo scenario” to see an Ethereum-to-Base swap example.">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['json', 'Order JSON (EIP-712)'],
              ['calldata', 'Raw calldata'],
              ['txhash', 'TX hash (online)'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} className={`btn btn-sm ${mode === m ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
          <span className="ml-auto">
            <DemoButton onClick={demo} />
          </span>
        </div>
        {mode === 'json' && (
          <div>
            <label className="label" htmlFor="il-json">Cross-chain order (EIP-712 JSON)</label>
            <textarea id="il-json" className="textarea mono" rows={7} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"message":{"originSettler":"0x…","user":"0x…","nonce":"42","originChainId":"1", …}}' />
          </div>
        )}
        {mode === 'calldata' && (
          <div>
            <label className="label" htmlFor="il-cd">Raw calldata (open / openFor)</label>
            <textarea id="il-cd" className="textarea mono" rows={6} value={calldata} onChange={(e) => setCalldata(e.target.value)} placeholder="0x5c4b72ef…" />
          </div>
        )}
        {mode === 'txhash' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="il-tx">Transaction hash on the starting chain</label>
              <input id="il-tx" className="input mono" placeholder="0x…" value={txhash} onChange={(e) => setTxhash(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="il-oc">Starting network</label>
              <ChainSingleSelect value={chainId} onChange={setChainId} />
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="label" htmlFor="il-dc">Destination network</label>
            <ChainSingleSelect value={destChainId} onChange={setDestChainId} />
          </div>
          <div>
            <label className="label" htmlFor="il-ra">Refund address (optional)</label>
            <input id="il-ra" className="input mono" placeholder="0x…" value={refundAddr} onChange={(e) => setRefundAddr(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="il-rc">Recipient address (optional)</label>
            <input id="il-rc" className="input mono" placeholder="0x…" value={recipientAddr} onChange={(e) => setRecipientAddr(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="il-mt">Manual check time (offline ISO timestamp, optional)</label>
          <input id="il-mt" className="input mono" placeholder="2026-11-15T12:00:00Z" value={manualNow} onChange={(e) => setManualNow(e.target.value)} />
        </div>
      </StepSection>

      <StepSection n={2} title="Decode swap &amp; check deadline">
        <p className="text-sm">
          Translates the ERC-7683 swap fields into plain numbers, calculates the hidden fee gap ("solver spread")
          between what you send and the minimum you receive, and checks on the destination network whether the swap
          deadline has passed.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Decoding…' : 'Decode swap'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {order && (
        <StepSection n={3} title="Swap breakdown &amp; refund status">
          <StatusTile
            level={level!}
            headline={
              deadline?.passed
                ? 'Deadline passed — check if filled, or use the refund data below'
                : spread && spread.spreadPct > 3
                  ? 'High hidden fee spread (over 3%)'
                  : 'Order decoded — fee spread and deadline look clear'
            }
            detail={chainNote}
          />
          {liveSrc && (
            <p className="text-xs text-dim -mt-2 mb-2">
              Live data source: <SourceBadge source={liveSrc.source} at={liveSrc.at} />
            </p>
          )}
          <KpiGrid>
            <Kpi label="Decoded" value={order.decodeConfidence} tone={order.decodeConfidence === 'raw' ? 'red' : order.decodeConfidence === 'partial' ? 'amber' : 'green'} />
            <Kpi label="Solver fee spread" value={spread ? spread.spreadPct.toFixed(3) + ' %' : 'n/a'} tone={spread && spread.spreadPct > 3 ? 'amber' : 'default'} />
            <Kpi label="Fill deadline" value={order.fillDeadline ? fmtDate(order.fillDeadline) : '—'} />
            <Kpi label="Deadline status" value={deadline ? (deadline.passed ? 'expired' : 'still open') : 'unknown'} tone={deadline?.passed ? 'amber' : 'green'} />
          </KpiGrid>

          <details className="acc" open>
            <summary>Decoded fields</summary>
            <div className="acc-body">
              <table className="table-x">
                <tbody>
                  {(
                    [
                      ['originSettler', order.originSettler],
                      ['user', order.user],
                      ['nonce', order.nonce],
                      ['originChainId', order.originChainId],
                      ['openDeadline', order.openDeadline ? fmtDate(order.openDeadline) : undefined],
                      ['fillDeadline', order.fillDeadline ? fmtDate(order.fillDeadline) : undefined],
                      ['orderDataType', order.orderDataType],
                    ] as [string, string | undefined][]
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <tr key={k}>
                        <td className="mono text-xs w-44">{k}</td>
                        <td className="mono text-xs break-all">{v}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {order.orderDataFields && order.orderDataFields.length > 0 ? (
                <table className="table-x mt-3">
                  <thead>
                    <tr>
                      <th>orderData field</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.orderDataFields.map((f) => (
                      <tr key={f.label}>
                        <td className="mono text-xs">{f.label}</td>
                        <td className="mono text-xs break-all">{f.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                order.orderData && <pre className="mono text-xs whitespace-pre-wrap break-all mt-2 bg-obsidian p-3 rounded-lg border border-line">{shortHex(order.orderData, 80, 20)}</pre>
              )}
            </div>
          </details>

          {spread && (
            <details className="acc" open>
              <summary>Spread calculator</summary>
              <div className="acc-body space-y-1 text-sm">
                <p>
                  Input: <span className="mono text-ink">{spread.inputAmount.toString()}</span> · guaranteed minReceived:{' '}
                  <span className="mono text-ink">{spread.minReceived.toString()}</span>
                </p>
                <p>
                  Maximum implicit solver spread:{' '}
                  <span className={`mono font-bold ${spread.spreadPct > 3 ? 'text-gold-hi' : 'text-prime-hi'}`}>
                    {spread.spreadAbs.toString()} raw ({spread.spreadPct.toFixed(3)} %)
                  </span>
                </p>
                <p className="text-xs text-dim">{spread.sameTokenNote}</p>
              </div>
            </details>
          )}

          <details className="acc" open={!!deadline?.passed}>
            <summary>Refund analysis (after fillDeadline)</summary>
            <div className="acc-body space-y-3 text-sm">
              <p>
                Recipient prioritization (refundAddress → recipient → depositor):{' '}
                <span className="mono text-ink break-all">{refundInfo.address ?? 'not resolvable'}</span>{' '}
                <span className="badge badge-amber">{refundInfo.source}</span>
              </p>
              {deadline?.passed && refundCalldata ? (
                <>
                  <p>
                    Verifiable refund identification call (ERC-7683 <code>resolveFor</code>, view-only) to the originSettler — submit it yourself or run it in a block explorer simulator:
                  </p>
                  <pre className="mono text-xs whitespace-pre-wrap break-all bg-obsidian border border-line rounded-lg p-3">{refundCalldata}</pre>
                  <div className="flex gap-2 flex-wrap">
                    <CopyButton text={refundCalldata} label="Copy calldata" compact />
                    <CopyButton text={order.originSettler ?? ''} label="Copy originSettler address" compact />
                  </div>
                  <p className="text-xs text-dim">
                    Note: the actual refund function is settler-specific (e.g. refundOnOrigin on the
                    respective protocol). resolveFor provides the normalized order view with refundAddress resolution.
                  </p>
                </>
              ) : (
                <p>Refund calldata becomes available once the deadline has expired AND the order was fully decoded (GaslessCrossChainOrder with all fields).</p>
              )}
            </div>
          </details>

          <details className="acc">
            <summary>Hidden execution assumptions</summary>
            <div className="acc-body">
              <ul className="list-disc ml-5 text-sm space-y-1">
                <li>Assumption: the solver uses the decoded messaging/calls schema of the protocols involved — callbacks and messaging trust are not provable from the raw data.</li>
                <li>Assumption: the fill status on the destination chain was mirrored correctly at query time ({chainNote}).</li>
                <li>Assumption: token decimals and cross-asset prices must be evaluated externally when comparing spreads.</li>
                <li>
                  Reference frame (ecosystem, final standard): in 2026, ERC-7683-compatible orders are settled primarily by the
                  filler networks Across, Eco, LI.FI, UniswapX and Symbiosis — vendor-independent
                  reference decoding nevertheless remains schema-heuristic (no guarantee of completeness).
                </li>
              </ul>
            </div>
          </details>

          <ExportBar
            onJson={() =>
              downloadJSON(
                { tool: 'intentlens-7683', generatedAt: new Date().toISOString(), order, spread: spread ? { spreadAbs: spread.spreadAbs.toString(), spreadPct: spread.spreadPct, inputAmount: spread.inputAmount.toString(), minReceived: spread.minReceived.toString() } : null, deadline, refundInfo, refundCalldata },
                'intentlens-7683.json',
              )
            }
            onPrint={() =>
              openPrintableReport({
                title: 'IntentLens-7683 order report',
                subtitle: `${new Date().toLocaleString('en-GB')} · origin chain ${order.originChainId ?? '-'} → destination ${destChainId}`,
                status: { level: level!, headline: deadline?.passed ? 'Deadline expired' : 'Order open', detail: spread ? `Spread ${spread.spreadPct.toFixed(3)} %` : undefined },
                sections: [
                  { heading: 'Fields', body: '<pre>' + JSON.stringify({ originSettler: order.originSettler, user: order.user, nonce: order.nonce, originChainId: order.originChainId, openDeadline: order.openDeadline, fillDeadline: order.fillDeadline, orderDataType: order.orderDataType }, null, 2) + '</pre>' },
                  { heading: 'Spread', body: spread ? `<p>${spread.spreadAbs.toString()} raw (${spread.spreadPct.toFixed(3)} %)</p>` : '<p>n/a</p>' },
                  { heading: 'Refund recipient', body: `<p>${refundInfo.address ?? '-'} (${refundInfo.source})</p>` },
                ],
              })
            }
          />
        </StepSection>
      )}
    </div>
  );
}
