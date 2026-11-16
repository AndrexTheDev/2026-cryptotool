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

// Demo: GaslessCrossChainOrder (EIP-712-JSON, Across-aehnliches orderData-Schema)
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
        if (!o) throw new Error('JSON nicht als GaslessCrossChainOrder interpretierbar.');
      } else if (mode === 'calldata') {
        if (!/^0x[0-9a-fA-F]+$/.test(calldata.trim())) throw new Error('Roh-Calldata als Hex (0x…) einfuegen.');
        o = await decodeOpenCalldata(calldata);
      } else {
        if (!isTxHash(txhash.trim())) throw new Error('Gueltigen Ursprungs-Transaktionshash angeben (0x + 64 Hex).');
        const tx = await getTx(chainId, txhash.trim());
        if (!tx.data) throw new Error('Transaktion nicht gefunden (anderes Ursprungs-Netzwerk waehlen?).');
        o = await decodeOpenCalldata(String(tx.data.input));
        o.originSettler = o.originSettler ?? String((tx.data as Record<string, unknown>).to ?? '');
      }
      setOrder(o);

      // Zeitstatus: Header der Ziel-Chain oder manuell
      if (manualNow.trim()) {
        setNowTs(Math.floor(Date.parse(manualNow.trim()) / 1000));
        setChainNote('Zeitbasis: manuell.');
      } else {
        try {
          const blk = await getBlockByNumber(destChainId, 'latest');
          if (blk.data) {
            setNowTs(Number(BigInt(String(blk.data.timestamp))));
            setChainNote(`Zeitbasis: letzter Block der Ziel-Chain ${destChainId}.`);
          }
        } catch {
          setNowTs(Math.floor(Date.now() / 1000));
          setChainNote('Zeitbasis: lokale Uhr (Ziel-Chain nicht erreichbar — Annahme markieren).');
        }
      }

      // Refund-Calldata (nur moeglich bei vollstaendiger Order)
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

  const fmtDate = (ts: number) => new Date(ts * 1000).toLocaleString('de-DE');

  return (
    <div className="space-y-5">
      <StepSection n={1} title="Order-Daten eingeben" hint="Signierte GaslessCrossChainOrder (EIP-712 JSON), Roh-Calldata von open()/openFor() oder Ursprungs-Transaktionshash + Chains.">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['json', 'EIP-712 JSON'],
              ['calldata', 'Roh-Calldata'],
              ['txhash', 'TX-Hash (online)'],
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
            <label className="label" htmlFor="il-json">Signierte GaslessCrossChainOrder (EIP-712 JSON)</label>
            <textarea id="il-json" className="textarea mono" rows={7} value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"message":{"originSettler":"0x…","user":"0x…","nonce":"42","originChainId":"1", …}}' />
          </div>
        )}
        {mode === 'calldata' && (
          <div>
            <label className="label" htmlFor="il-cd">Roh-Calldata (open / openFor)</label>
            <textarea id="il-cd" className="textarea mono" rows={6} value={calldata} onChange={(e) => setCalldata(e.target.value)} placeholder="0x5c4b72ef…" />
          </div>
        )}
        {mode === 'txhash' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="il-tx">Ursprungs-Transaktionshash</label>
              <input id="il-tx" className="input mono" placeholder="0x…" value={txhash} onChange={(e) => setTxhash(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="il-oc">Ursprungs-Chain</label>
              <ChainSingleSelect value={chainId} onChange={setChainId} />
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="label" htmlFor="il-dc">Ziel-Chain</label>
            <ChainSingleSelect value={destChainId} onChange={setDestChainId} />
          </div>
          <div>
            <label className="label" htmlFor="il-ra">refundAddress (optional)</label>
            <input id="il-ra" className="input mono" placeholder="0x…" value={refundAddr} onChange={(e) => setRefundAddr(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="il-rc">recipient (optional)</label>
            <input id="il-rc" className="input mono" placeholder="0x…" value={recipientAddr} onChange={(e) => setRecipientAddr(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="il-mt">Manuelle Zeitbasis (offline, ISO, optional)</label>
          <input id="il-mt" className="input mono" placeholder="2026-11-15T12:00:00Z" value={manualNow} onChange={(e) => setManualNow(e.target.value)} />
        </div>
      </StepSection>

      <StepSection n={2} title="Intent dekodieren">
        <p className="text-sm">
          Dekodiert OriginSettler, Deadlines, Betraege und gängige orderData-Schemata herstellerunabhaengig, berechnet
          den maximalen impliziten Solver-Spread und prueft den Deadline-Status auf der Ziel-Chain.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Dekodiere…' : 'Dekodieren'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {order && (
        <StepSection n={3} title="Order-Anatomie">
          <StatusTile
            level={level!}
            headline={
              deadline?.passed
                ? 'Deadline abgelaufen — Fill pruefen, Refund vorbereiten'
                : spread && spread.spreadPct > 3
                  ? 'Hoher impliziter Solver-Spread'
                  : 'Order dekodiert — Spread & Annahmen unten'
            }
            detail={chainNote}
          />
          <KpiGrid>
            <Kpi label="Dekodierung" value={order.decodeConfidence} tone={order.decodeConfidence === 'roh' ? 'red' : order.decodeConfidence === 'teilweise' ? 'amber' : 'green'} />
            <Kpi label="Spread (implizit)" value={spread ? spread.spreadPct.toFixed(3) + ' %' : 'n/a'} tone={spread && spread.spreadPct > 3 ? 'amber' : 'default'} />
            <Kpi label="fillDeadline" value={order.fillDeadline ? fmtDate(order.fillDeadline) : '—'} />
            <Kpi label="Deadline-Status (Ziel-Chain)" value={deadline ? (deadline.passed ? 'abgelaufen' : 'offen') : 'unbekannt'} tone={deadline?.passed ? 'amber' : 'green'} />
          </KpiGrid>

          <details className="acc" open>
            <summary>Dekodierte Felder</summary>
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
                      <th>orderData-Feld</th>
                      <th>Wert</th>
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
              <summary>Spread-Rechner</summary>
              <div className="acc-body space-y-1 text-sm">
                <p>
                  Input: <span className="mono text-ink">{spread.inputAmount.toString()}</span> · garantiertes minReceived:{' '}
                  <span className="mono text-ink">{spread.minReceived.toString()}</span>
                </p>
                <p>
                  Maximaler impliziter Solver-Spread:{' '}
                  <span className={`mono font-bold ${spread.spreadPct > 3 ? 'text-gold-hi' : 'text-prime-hi'}`}>
                    {spread.spreadAbs.toString()} raw ({spread.spreadPct.toFixed(3)} %)
                  </span>
                </p>
                <p className="text-xs text-dim">{spread.sameTokenNote}</p>
              </div>
            </details>
          )}

          <details className="acc" open={!!deadline?.passed}>
            <summary>Refund-Analyse (nach fillDeadline)</summary>
            <div className="acc-body space-y-3 text-sm">
              <p>
                Empfaenger-Priorisierung (refundAddress → recipient → depositor):{' '}
                <span className="mono text-ink break-all">{refundInfo.address ?? 'nicht aufloesbar'}</span>{' '}
                <span className="badge badge-amber">{refundInfo.source}</span>
              </p>
              {deadline?.passed && refundCalldata ? (
                <>
                  <p>
                    Pruefbares Refund-Identifikations-Call (ERC-7683 <code>resolveFor</code>, view-only) an den OriginSettler — selbst absenden bzw. im Block-Explorer-Simulator ausfuehren:
                  </p>
                  <pre className="mono text-xs whitespace-pre-wrap break-all bg-obsidian border border-line rounded-lg p-3">{refundCalldata}</pre>
                  <div className="flex gap-2 flex-wrap">
                    <CopyButton text={refundCalldata} label="Calldata kopieren" compact />
                    <CopyButton text={order.originSettler ?? ''} label="OriginSettler-Adresse kopieren" compact />
                  </div>
                  <p className="text-xs text-dim">
                    Hinweis: Die tatsaechliche Rueckfuehrungs-Funktion ist settler-spezifisch (z. B. refundOnOrigin beim
                    jeweiligen Protokoll). resolveFor liefert die normierte Order-Sicht mit refundAddress-Aufloesung.
                  </p>
                </>
              ) : (
                <p>Refund-Calldata steht bereit, sobald die Deadline abgelaufen ist UND die Order vollstaendig dekodiert wurde (GaslessCrossChainOrder mit allen Feldern).</p>
              )}
            </div>
          </details>

          <details className="acc">
            <summary>Versteckte Ausfuehrungsannahmen</summary>
            <div className="acc-body">
              <ul className="list-disc ml-5 text-sm space-y-1">
                <li>Annahme: Der Solver nutzt das dekodierte Messaging/Calls-Schema der beteiligten Protokolle — Callbacks und Messaging-Trust sind aus den Rohdaten nicht beweisbar.</li>
                <li>Annahme: Fill-Status auf der Ziel-Chain wurde zum Abfrage-Zeitpunkt korrekt gespiegelt ({chainNote}).</li>
                <li>Annahme: Token-Dezimalstellen und Cross-Asset-Kurse sind bei Spread-Vergleichen extern zu bewerten.</li>
                <li>
                  Referenzrahmen (Oekosystem, finaler Standard): ERC-7683-kompatible Orders werden 2026 v. a. von den
                  Filler-Netzwerken Across, Eco, LI.FI, UniswapX und Symbiosis settled — herstellerunabhaengiges
                  Dee-Referenz-Dekodieren bleibt trotzdem Schema-heuristisch (keine Garantie auf Vollstaendigkeit).
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
                title: 'IntentLens-7683 Order-Bericht',
                subtitle: `${new Date().toLocaleString('de-DE')} · Ursprung Chain ${order.originChainId ?? '-'} → Ziel ${destChainId}`,
                status: { level: level!, headline: deadline?.passed ? 'Deadline abgelaufen' : 'Order offen', detail: spread ? `Spread ${spread.spreadPct.toFixed(3)} %` : undefined },
                sections: [
                  { heading: 'Felder', body: '<pre>' + JSON.stringify({ originSettler: order.originSettler, user: order.user, nonce: order.nonce, originChainId: order.originChainId, openDeadline: order.openDeadline, fillDeadline: order.fillDeadline, orderDataType: order.orderDataType }, null, 2) + '</pre>' },
                  { heading: 'Spread', body: spread ? `<p>${spread.spreadAbs.toString()} raw (${spread.spreadPct.toFixed(3)} %)</p>` : '<p>n/a</p>' },
                  { heading: 'Refund-Empfaenger', body: `<p>${refundInfo.address ?? '-'} (${refundInfo.source})</p>` },
                ],
              })
            }
          />
        </StepSection>
      )}
    </div>
  );
}
