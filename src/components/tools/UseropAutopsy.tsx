import { useMemo, useState } from 'react';
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
import { getTxReceipt } from '../../lib/rpc';
import { chainById } from '../../config/chains';
import { downloadCSV, downloadJSON } from '../../lib/export';
import { isTxHash, num, shortHex } from '../../lib/format';

// UserOperationEvent ist ABI-kompatibel ueber v0.6/v0.7/v0.8/v0.9:
// event UserOperationEvent(bytes32,address sender,address paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)
const USEROP_EVENT_TOPIC = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// v0.9: IgnoredInitCode(bytes32 userOpHash, address sender) — initCode wird still ignoriert,
// wenn der Sender schon existiert (observability neuer Codepfad).
const IGNORED_INITCODE_TOPIC = '0xd80b2cbd5dc420e00122d9f598731e3834f5d98a280dd183b5a3801dc1f2e967'; // keccak256("IgnoredInitCode(bytes32,address)")

// Kanonische EntryPoint-Singletons (eth-infinitism, multi-chain identisch)
const ENTRYPOINTS: Record<string, string> = {
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789': 'v0.6',
  '0x0000000071727de22e5e9d8baf0edac6f37da032': 'v0.7',
  '0x4337084d9e255ff0702461cf8895ce9e3b5ff108': 'v0.8 (7702-native)',
  '0x433709009b8330fda32311df1c2afa402ed8d009': 'v0.9',
};

interface UserOpEvent {
  sender: string;
  paymaster: string;
  nonce: bigint;
  success: boolean;
  actualGasCost: bigint;
  actualGasUsed: bigint;
}

interface TokenCharge {
  token: string;
  from: string;
  to: string;
  amount: bigint;
}

interface TxAutopsy {
  hash: string;
  entryPointVersion?: string;
  ignoredInitCode?: number;
  bundler: string;
  txGasUsed: bigint;
  effGasPrice: bigint;
  txCostWei: bigint;
  userOps: UserOpEvent[];
  sumGasCost: bigint;
  sumGasUsed: bigint;
  netMarginWei: bigint;
  marginPct: number;
  gasUnitMarkupPct: number;
  gasPriceMarkupPct: number;
  tokenCharges: TokenCharge[];
  blockNumber: number;
  error?: string;
}

function hexAddr(topic: string): string {
  return '0x' + topic.slice(-40);
}

function decBig(hex: string): bigint {
  return BigInt(hex);
}

function parseReceipt(hash: string, r: Record<string, unknown>): TxAutopsy {
  const logs = (r.logs as { address: string; topics: string[]; data: string }[]) ?? [];
  const userOps: UserOpEvent[] = [];
  const tokenCharges: TokenCharge[] = [];
  const paymasters = new Set<string>();
  let entryPointVersion: string | undefined;
  let ignoredInitCode = 0;
  for (const log of logs) {
    const t0 = (log.topics?.[0] ?? '').toLowerCase();
    const epLabel = ENTRYPOINTS[String(log.address).toLowerCase()];
    if (epLabel && t0 === USEROP_EVENT_TOPIC) entryPointVersion = epLabel;
    if (epLabel && t0 === IGNORED_INITCODE_TOPIC) ignoredInitCode++;
    if (t0 === USEROP_EVENT_TOPIC) {
      const data = log.data.slice(2);
      const w0 = '0x' + data.slice(0, 64);
      const w1 = '0x' + data.slice(64, 128);
      const w2 = '0x' + data.slice(128, 192);
      const w3 = '0x' + data.slice(192, 256);
      const topic3 = log.topics[3] ?? '0x0';
      const topic2 = log.topics[2] ?? '0x0';
      const pm = hexAddr(topic3).toLowerCase();
      if (BigInt('0x' + topic3.slice(26)) !== 0n) paymasters.add(pm);
      userOps.push({
        sender: hexAddr(topic2),
        paymaster: pm,
        nonce: decBig(w0),
        success: BigInt(w1) === 1n,
        actualGasCost: decBig(w2),
        actualGasUsed: decBig(w3),
      });
    } else if (t0 === TRANSFER_TOPIC && log.topics.length === 3 && (log.data === '0x' || log.data.length === 66)) {
      const from = hexAddr(log.topics[1] ?? '0x0').toLowerCase();
      const to = hexAddr(log.topics[2] ?? '0x0').toLowerCase();
      tokenCharges.push({ token: log.address.toLowerCase(), from, to, amount: log.data === '0x' ? 0n : BigInt(log.data) });
    }
  }
  const gasUsed = BigInt(String(r.gasUsed ?? '0x0'));
  const effPrice = BigInt(String(r.effectiveGasPrice ?? '0x0'));
  const txCost = gasUsed * effPrice;
  const sumGasCost = userOps.reduce((s, u) => s + u.actualGasCost, 0n);
  const sumGasUsed = userOps.reduce((s, u) => s + u.actualGasUsed, 0n);
  const net = sumGasCost - txCost;
  const marginPct = txCost === 0n ? 0 : Number((net * 10_000n) / txCost) / 100;
  const unitMarkup = gasUsed === 0n ? 0 : Number(((sumGasUsed - gasUsed) * 10_000n) / gasUsed) / 100;
  const impliedPrice = sumGasUsed === 0n ? 0n : sumGasCost / sumGasUsed;
  const priceMarkup = effPrice === 0n ? 0 : Number(((impliedPrice - effPrice) * 10_000n) / effPrice) / 100;
  // Nur Paymaster-bezogene Token-Transfers behalten
  const relevant = tokenCharges.filter((t) => paymasters.has(t.to.toLowerCase()) || paymasters.has(t.from.toLowerCase()));
  return {
    hash,
    bundler: String(r.from ?? ''),
    txGasUsed: gasUsed,
    effGasPrice: effPrice,
    txCostWei: txCost,
    userOps,
    sumGasCost,
    sumGasUsed,
    netMarginWei: net,
    marginPct,
    gasUnitMarkupPct: unitMarkup,
    gasPriceMarkupPct: priceMarkup,
    tokenCharges: relevant,
    entryPointVersion,
    ignoredInitCode,
    blockNumber: Number(BigInt(String(r.blockNumber ?? '0x0'))),
  };
}

const DEMO_CSV = `transaction_hash
0x1111111111111111111111111111111111111111111111111111111111111111
0x2222222222222222222222222222222222222222222222222222222222222222`;

export default function UseropAutopsy() {
  const [chainId, setChainId] = useState(8453);
  const [txInput, setTxInput] = useState('');
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [receiptJson, setReceiptJson] = useState('');
  const [refPrice, setRefPrice] = useState(''); // ETH/EUR oder Token-Referenz (manuell)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<TxAutopsy[]>([]);

  const demo = () => {
    setMode('offline');
    setReceiptJson(
      JSON.stringify(
        [
          {
            transactionHash: '0x53c6…demo',
            from: '0x00000000000000000000000000000000b0b1e5',
            blockNumber: '0x142f2a0',
            gasUsed: '0x3d090',
            effectiveGasPrice: '0xf5c1a0',
            logs: [
              {
                address: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
                topics: [
                  USEROP_EVENT_TOPIC,
                  '0xe7f1c8d1a2b3c4d5e6f70819283240506070819203142536475860718293a4b5c6',
                  '0x000000000000000000000000aa21b1b7ba2b71a22aef1234567890abcdef1234',
                  '0x0000000000000000000000000000000000000000000000000000000000000000',
                ],
                data:
                  '0x' +
                  '00'.padStart(64, '0') +
                  '1'.padStart(64, '0') +
                  (0x3d090n * 0xf5c1a0n * 108n / 100n).toString(16).padStart(64, '0') +
                  (0x3d090n * 104n / 100n).toString(16).padStart(64, '0'),
              },
            ],
          },
          {
            transactionHash: '0xd09a…demo',
            from: '0x00000000000000000000000000000000b670c7',
            blockNumber: '0x1c4b2f0',
            gasUsed: '0x2e1a0',
            effectiveGasPrice: '0x17d7840',
            logs: [
              {
                // v0.9-Bundle: UserOperationEvent auf dem v0.9-EntryPoint-Singleton
                address: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
                topics: [
                  USEROP_EVENT_TOPIC,
                  '0x11aa22bb33cc44dd55ee66ff7788009900112233445566778899a001122334aabbdd',
                  '0x000000000000000000000000bb32c2c8cb3c82b33bf0234567891bcdef123455aa',
                  '0x0000000000000000000000000000000000000000000000000000000000000000',
                ],
                data:
                  '0x' +
                  '00'.padStart(64, '0') +
                  '1'.padStart(64, '0') +
                  (0x2e1a0n * 0x17d7840n * 105n / 100n).toString(16).padStart(64, '0') +
                  (0x2e1a0n * 103n / 100n).toString(16).padStart(64, '0'),
              },
              {
                // v0.9 neu: IgnoredInitCode — initCode still ignoriert (Sender existiert bereits)
                address: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
                topics: [IGNORED_INITCODE_TOPIC, '0x11aa22bb33cc44dd55ee66ff7788009900112233445566778899a001122334aabbdd', '0x000000000000000000000000bb32c2c8cb3c82b33bf0234567891bcdef123455aa'],
                data: '0x',
              },
            ],
          },
        ],
        null,
        2,
      ),
    );
    setTxInput(DEMO_CSV);
    setError('');
  };

  const extractHashes = (): string[] => {
    const t = txInput.trim();
    const found = t.match(/0x[0-9a-fA-F]{64}/g) ?? [];
    return [...new Set(found)].slice(0, 25);
  };

  const run = async () => {
    setError('');
    setResults([]);
    setBusy(true);
    try {
      const out: TxAutopsy[] = [];
      if (mode === 'offline') {
        const parsed = JSON.parse(receiptJson) as Record<string, unknown> | Record<string, unknown>[];
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const r of list) out.push(parseReceipt(String(r.transactionHash ?? '0x'), r));
      } else {
        const hashes = extractHashes();
        if (hashes.length === 0) throw new Error('Keine Transaktionshashes erkannt (bis zu 25, eine pro Zeile oder Explorer-CSV).');
        for (const h of hashes) {
          try {
            const rec = await getTxReceipt(chainId, h);
            if (!rec.data) {
              out.push({ ...emptyTx(h), error: 'Receipt nicht gefunden (anderes Netzwerk? noch nicht bestaetigt?).' });
              continue;
            }
            out.push(parseReceipt(h, rec.data));
          } catch (e) {
            out.push({ ...emptyTx(h), error: (e as Error).message });
          }
        }
      }
      setResults(out);
    } catch (e) {
      setError((e as Error).message + (mode === 'offline' ? ' — Receipt-JSON pruefen (Objekt oder Array).' : ''));
    } finally {
      setBusy(false);
    }
  };

  const stats = useMemo(() => {
    const ok = results.filter((r) => !r.error && r.userOps.length > 0);
    const sumMargin = ok.reduce((s, r) => s + r.netMarginWei, 0n);
    const avgPct = ok.length ? ok.reduce((s, r) => s + r.marginPct, 0) / ok.length : 0;
    const tokens = new Map<string, bigint>();
    for (const r of ok) for (const t of r.tokenCharges) tokens.set(t.token, (tokens.get(t.token) ?? 0n) + t.amount);
    return { ok: ok.length, total: results.length, sumMargin, avgPct, tokens };
  }, [results]);

  const level: StatusLevel | null = results.length === 0 ? null : stats.avgPct > 15 ? 'amber' : 'green';

  const fmtEth = (wei: bigint) => (Number(wei) / 1e18).toLocaleString('de-DE', { maximumFractionDigits: 6 });

  return (
    <div className="space-y-5">
      <StepSection n={1} title="Bundle-Transaktion(en) eingeben" hint="Bis zu 25 Transaktionshashes (eine pro Zeile) oder Explorer-CSV. UserOperation-Hashes bitte ueber die zugehoerige Bundle-TX abbilden; alternativ Receipt-JSON offline einfuegen.">
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-sm ${mode === 'online' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('online')}>
            Online
          </button>
          <button className={`btn btn-sm ${mode === 'offline' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('offline')}>
            Offline (Receipt-JSON)
          </button>
          <span className="ml-auto">
            <DemoButton onClick={demo} />
          </span>
        </div>
        {mode === 'online' ? (
          <div className="grid sm:grid-cols-[1fr_16rem] gap-4">
            <div>
              <label className="label" htmlFor="uo-in">Transaktionshashes / Explorer-CSV</label>
              <textarea id="uo-in" className="textarea mono" rows={6} value={txInput} onChange={(e) => setTxInput(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="uo-net">Netzwerk</label>
              <ChainSingleSelect value={chainId} onChange={setChainId} />
              <label className="label mt-4" htmlFor="uo-price">Referenzkurs (optional, EUR je ETH/Token)</label>
              <input id="uo-price" className="input" inputMode="decimal" placeholder="z. B. 2450,00" value={refPrice} onChange={(e) => setRefPrice(e.target.value)} />
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="uo-json">Transaktions-Receipt (JSON, Objekt oder Array)</label>
            <textarea id="uo-json" className="textarea mono" rows={8} value={receiptJson} onChange={(e) => setReceiptJson(e.target.value)} placeholder='{"gasUsed":"0x…","effectiveGasPrice":"0x…","logs":[…]}' />
          </div>
        )}
      </StepSection>

      <StepSection n={2} title="Autopsy durchführen">
        <p className="text-sm">
          Zerlegt Bundler-Marge in Gaseinheiten-Aufschlag (%) und Gaspreis-Aufschlag (%), netto in WEI bzw. %, und
          erkennt ERC-20-Paymaster-Buchungen (Transfer-Logs) inklusive effektivem Spread gegen den Referenzkurs.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Analysiere…' : 'Analysieren'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {results.length > 0 && (
        <StepSection n={3} title="Gebühren-Forensik">
          <StatusTile
            level={level!}
            headline={
              stats.ok === 0
                ? 'Keine UserOperationEvents in den Receipts gefunden'
                : stats.avgPct > 15
                  ? 'Ueberdurchschnittliche Bundler-Aufschlaegge'
                  : 'Bundler-Margen im ueblichen Korridor'
            }
            detail={
              stats.ok === 0
                ? 'Pruefen Sie, ob die Hashes EntryPoint-Bundles enthalten (v0.6–v0.9, identisches Event-Format) und das richtige Netzwerk gewaehlt ist.'
                : `Durchschnittlicher Netto-Aufschlag ${stats.avgPct.toFixed(2)} % ueber ${stats.ok} Transaktion(en).`
            }
          />
          <KpiGrid>
            <Kpi label="Analysiert (mit UserOps)" value={`${stats.ok}/${stats.total}`} />
            <Kpi label="Ø Netto-Aufschlag" value={stats.avgPct.toFixed(2) + ' %'} tone={stats.avgPct > 15 ? 'amber' : 'green'} />
            <Kpi label="Σ Marge" value={fmtEth(stats.sumMargin) + ' ' + (chainById(chainId)?.nativeSymbol ?? 'ETH')} tone={stats.sumMargin > 0n ? 'amber' : 'default'} />
            <Kpi label="Paymaster-Token" value={stats.tokens.size} tone={stats.tokens.size ? 'amber' : 'default'} />
          </KpiGrid>

          {results.map((r) => (
            <details key={r.hash} className="acc" open={results.length === 1}>
              <summary>
                <span className="mono text-xs">{shortHex(r.hash, 14, 10)}</span>
                {r.error ? <span className="badge badge-red">Fehler</span> : <span className={r.marginPct > 15 ? 'badge badge-amber' : 'badge badge-green'}>{r.marginPct.toFixed(2)} %</span>}
              </summary>
              <div className="acc-body space-y-2">
                {r.error && <p className="text-gold-hi text-sm">{r.error}</p>}
                {!r.error && (
                  <>
                    <table className="table-x">
                      <tbody>
                        <tr>
                          <td>Bundler (from)</td>
                          <td className="mono text-xs break-all">{r.bundler}</td>
                        </tr>
                        <tr>
                          <td>Block</td>
                          <td className="mono">{num(r.blockNumber)}</td>
                        </tr>
                        <tr>
                          <td>EntryPoint</td>
                          <td>
                            {r.entryPointVersion ? (
                              <span className="badge badge-green">{r.entryPointVersion}</span>
                            ) : (
                              <span className="badge badge-amber">unbestimmt</span>
                            )}
                          </td>
                        </tr>
                        {(r.ignoredInitCode ?? 0) > 0 && (
                          <tr>
                            <td>IgnoredInitCode (v0.9)</td>
                            <td className="text-gold-hi">
                              {r.ignoredInitCode} × — initCode ignoriert, da Sender bereits existiert (häufige Fehldiagnose-Quelle, siehe v0.9-Release-Notes)
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td>TX-GasUsed × eff. Gaspreis</td>
                          <td className="mono">
                            {num(Number(r.txGasUsed))} × {num(Number(r.effGasPrice))} wei = {fmtEth(r.txCostWei)} ETH
                          </td>
                        </tr>
                        <tr>
                          <td>Σ actualGasUsed (UserOps)</td>
                          <td className="mono">
                            {num(Number(r.sumGasUsed))} ({r.gasUnitMarkupPct >= 0 ? '+' : ''}
                            {r.gasUnitMarkupPct.toFixed(2)} % Gaseinheiten-Aufschlag)
                          </td>
                        </tr>
                        <tr>
                          <td>Σ actualGasCost (EntryPoint-Ereignisse)</td>
                          <td className="mono">{fmtEth(r.sumGasCost)} ETH</td>
                        </tr>
                        <tr>
                          <td>Impliziter Gaspreis (Σcost/Σused)</td>
                          <td className="mono">
                            {r.sumGasUsed === 0n ? '—' : num(Number(r.sumGasCost / r.sumGasUsed)) + ' wei'} ({r.gasPriceMarkupPct >= 0 ? '+' : ''}
                            {r.gasPriceMarkupPct.toFixed(2)} % Gaspreis-Aufschlag)
                          </td>
                        </tr>
                        <tr>
                          <td className="font-bold text-ink">Netto-Marge</td>
                          <td className={`mono font-bold ${r.netMarginWei > 0n ? 'text-gold-hi' : 'text-prime-hi'}`}>
                            {r.netMarginWei >= 0n ? '+' : ''}
                            {fmtEth(r.netMarginWei)} ETH ({r.marginPct.toFixed(2)} %)
                            {refPrice && Number(refPrice.replace(',', '.')) > 0 && (
                              <span className="text-body">
                                {' '}
                                ≈ {(Number(r.netMarginWei) / 1e18 * Number(refPrice.replace(',', '.'))).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                              </span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    {r.userOps.length > 0 && (
                      <table className="table-x">
                        <thead>
                          <tr>
                            <th>Sender</th>
                            <th>Paymaster</th>
                            <th>ok</th>
                            <th>actualGasUsed</th>
                            <th>actualGasCost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.userOps.map((u, i) => (
                            <tr key={i}>
                              <td className="mono text-xs">{shortHex(u.sender, 10, 6)}</td>
                              <td className="mono text-xs">{u.paymaster === '0x' + '0'.repeat(40) ? '—' : shortHex(u.paymaster, 10, 6)}</td>
                              <td>{u.success ? '✓' : '✕'}</td>
                              <td className="mono">{num(Number(u.actualGasUsed))}</td>
                              <td className="mono">{fmtEth(u.actualGasCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {r.tokenCharges.length > 0 && (
                      <div>
                        <p className="text-xs text-dim mb-1">Token-Abbuchungen durch Paymaster (ERC-20):</p>
                        <table className="table-x">
                          <thead>
                            <tr>
                              <th>Token</th>
                              <th>Von</th>
                              <th>An</th>
                              <th>Menge (raw)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.tokenCharges.map((t, i) => (
                              <tr key={i}>
                                <td className="mono text-xs">{shortHex(t.token, 10, 6)}</td>
                                <td className="mono text-xs">{shortHex(t.from, 10, 6)}</td>
                                <td className="mono text-xs">{shortHex(t.to, 10, 6)}</td>
                                <td className="mono">{t.amount.toString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-xs text-dim mt-1">
                          Effektiver Paymaster-Spread = (Token-Gegenwert zum Referenzkurs − netto ETH-Kosten) / netto ETH-Kosten. Token-Dezimalstellen je Contract beachten.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </details>
          ))}

          <ExportBar
            onJson={() => downloadJSON({ tool: 'userop-autopsy', generatedAt: new Date().toISOString(), chainId, results: results.map((r) => ({ ...r, txGasUsed: r.txGasUsed.toString(), effGasPrice: r.effGasPrice.toString(), txCostWei: r.txCostWei.toString(), sumGasCost: r.sumGasCost.toString(), sumGasUsed: r.sumGasUsed.toString(), netMarginWei: r.netMarginWei.toString(), userOps: r.userOps.map((u) => ({ ...u, nonce: u.nonce.toString(), actualGasCost: u.actualGasCost.toString(), actualGasUsed: u.actualGasUsed.toString() })), tokenCharges: r.tokenCharges.map((t) => ({ ...t, amount: t.amount.toString() })) })) }, 'userop-autopsy.json')}
            onCsv={() =>
              downloadCSV(
                results.map((r) => ({
                  tx_hash: r.hash,
                  bundler: r.bundler,
                  gas_used: r.txGasUsed.toString(),
                  eff_gas_price_wei: r.effGasPrice.toString(),
                  tx_cost_wei: r.txCostWei.toString(),
                  sum_gas_cost_wei: r.sumGasCost.toString(),
                  margin_wei: r.netMarginWei.toString(),
                  margin_pct: r.marginPct.toFixed(2).replace('.', ','),
                  gas_unit_markup_pct: r.gasUnitMarkupPct.toFixed(2).replace('.', ','),
                  gas_price_markup_pct: r.gasPriceMarkupPct.toFixed(2).replace('.', ','),
                  userops: r.userOps.length,
                  fehler: r.error ?? '',
                })),
                'userop-autopsy.csv',
              )
            }
          />
        </StepSection>
      )}
    </div>
  );
}

function emptyTx(hash: string): TxAutopsy {
  return {
    hash,
    bundler: '',
    txGasUsed: 0n,
    effGasPrice: 0n,
    txCostWei: 0n,
    userOps: [],
    sumGasCost: 0n,
    sumGasUsed: 0n,
    netMarginWei: 0n,
    marginPct: 0,
    gasUnitMarkupPct: 0,
    gasPriceMarkupPct: 0,
    tokenCharges: [],
    blockNumber: 0,
  };
}
