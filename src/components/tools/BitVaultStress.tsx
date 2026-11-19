import { useMemo, useState } from 'react';
import {
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
import { BTC_APIS } from '../../config/chains';
import { downloadCSV, downloadJSON, downloadSelfContainedHtml } from '../../lib/export';
import { num, satsFmt } from '../../lib/format';
import {
  asmToBytes,
  detectSecrets,
  dustAnalysis,
  findConsensusIssues,
  heatmapThresholds,
  parsePolicy,
  pathWeight,
  satisfactionOptions,
  taprootKeyPathWeight,
  type DustResult,
  type PathWeight,
  type PolicyNode,
  type UtxoRow,
  type VaultContext,
} from '../../lib/miniscript-analysis';

interface Analysis {
  context: VaultContext;
  policySource: string;
  descriptorKind: 'policy' | 'wsh' | 'tr' | 'unknown';
  issane?: boolean | undefined;
  usedCompiler: 'miniscript-policies' | 'internal parser';
  paths: PathWeight[];
  warnings: { level: 'amber' | 'red'; text: string }[];
  utxos: (DustResult & { rate: number })[];
  rate: number;
  source?: 'public' | 'offline' | 'user' | 'wallet' | 'cache' | undefined;
  at?: number | undefined;
  address?: string | undefined;
}

const DEMO_POLICY = 'or(pk(owner),and(pk(heir),after(210000)))';
const DEMO_UTXOS = `txid;vout;sats
5f4a...e1;0;420000
9c1b...77;1;58000
demo-c;0;21000
demo-d;2;3400`;

function parseUtxos(text: string): UtxoRow[] {
  const t = text.trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t) as unknown[];
    return (Array.isArray(j) ? j : []).map((r) => {
      const o = r as Record<string, unknown>;
      return { txid: String(o.txid ?? o.tx ?? '?'), vout: Number(o.vout ?? 0), sats: Math.round(Number(o.sats ?? o.value ?? o.amount ?? 0)) };
    });
  } catch {
    const rows: UtxoRow[] = [];
    for (const line of t.split(/\r?\n/)) {
      const parts = line.split(/[;,\t]/).map((p) => p.trim());
      const [txid, vout, sats] = parts;
      if (txid !== undefined && vout !== undefined && sats !== undefined && /^\d+$/.test(sats)) {
        rows.push({ txid, vout: Number(vout), sats: Number(sats) });
      }
    }
    return rows;
  }
}

/** Extracts context & miniscript/policy text from a descriptor or bare policy. */
function extractScript(input: string): { ctx: VaultContext; inner: string; kind: Analysis['descriptorKind'] } {
  const t = input.trim().replace(/\s/g, '');
  const wsh = t.match(/^wsh\((.*)\)(?:#[0-9a-z]+)?$/i);
  if (wsh && wsh[1] !== undefined) return { ctx: 'wsh', inner: wsh[1], kind: 'wsh' };
  const tr = t.match(/^tr\((.*?)(?:,(.*))?\)(?:#[0-9a-z]+)?$/i);
  if (tr) return { ctx: 'tr', inner: tr[2] ?? '', kind: 'tr' };
  return { ctx: 'wsh', inner: t, kind: /^(wsh|sh|pkh|wpkh|tr)\(/i.test(t) ? 'unknown' : 'policy' };
}

function buildHeirDrillHtml(a: Analysis): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const worst = [...a.paths].sort((x, y) => y.vbytes - x.vbytes)[0];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Heir practice file (heir drill)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#07090d;color:#cbd5e1;max-width:44rem;margin:2rem auto;padding:0 1rem;line-height:1.7}
h1,h2{color:#f8fafc}code,pre{font-family:ui-monospace,Menlo,monospace;font-size:.85rem}
pre{background:#0f141b;border:1px solid #1e293b;border-radius:.6rem;padding:.8rem;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.ok{color:#34d399}.warn{color:#facc15}li{margin:.35rem 0}</style></head><body>
<h1>🧭 Heir drill: rehearsing vault recovery</h1>
<p>This file runs fully <strong>offline</strong>. It contains no keys — only the public
spending model and a step-by-step drill with test values.</p>
<h2>1. Spending model</h2>
<pre>Context:      ${esc(a.context === 'tr' ? 'Taproot (tr)' : 'SegWit v0 (wsh)')}
Definition:   ${esc(a.policySource)}
Compiler:     ${esc(a.usedCompiler)}${a.issane != null ? `, sane=${a.issane}` : ''}
Path weights: ${a.paths.map((p) => `\n  - ${esc(p.label)}: ${p.vbytes} vB (script ${p.scriptBytes} B${p.controlBlockBytes ? `, control block ${p.controlBlockBytes} B` : ''})`).join('')}</pre>
<h2>2. Drill procedure (dry run, no real UTXOs)</h2>
<ol>
<li><strong>Set up recovery:</strong> open the wallet software of choice on an offline device, import the descriptor/policy (watch-only). Check: the derived addresses match the entitlement documents.</li>
<li><strong>Build a test PSBT:</strong> create a practice transaction with a fictitious UTXO (e.g. 100,000 sats) and the <em>heaviest</em> spending path (${worst ? esc(worst.label) + ', ' + worst.vbytes + ' vB' : 'see above'}); fee rate 5 sat/vB → calculated fee: ${worst ? num(Math.ceil(worst.vbytes * 5)) : '—'} sats.</li>
<li><strong>Rehearse the signing path:</strong> walk through the required combination of keys/hardware devices once end to end (document order, PINs, passphrases).</li>
<li><strong>Check timelock logic:</strong> if the path contains <code>after()</code>: note the required block height and verify that nLockTime is set correctly so the path is valid at all.</li>
<li><strong>Record &amp; archive:</strong> archive the practice PSBT in hex; attach the result to this file.</li>
</ol>
<h2>3. Emergency checklist</h2>
<ul>
<li>Tax/inheritance docs: attach a DAC8-SelfProof export of the last known UTXO state.</li>
<li>Fee buffer: consolidate UTXOs below the 1/3 dust cliff in good time (see the BitVault Stress report).</li>
<li>Multiple copies: store this file in at least two separate locations.</li>
</ul>
<p class="warn">Security: never write seed words or private keys into digital practice files.</p>
<p style="color:#64748b;font-size:.8rem">Generated locally by StackAutopsy BitVault Stress. No network access, no keys.</p>
</body></html>`;
}

export default function BitVaultStress() {
  const [input, setInput] = useState('');
  const [utxoText, setUtxoText] = useState('');
  const [utxoFetchedAt, setUtxoFetchedAt] = useState<number | null>(null);
  const [fetchAddress, setFetchAddress] = useState('');
  const [rate, setRate] = useState(10);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  const demo = () => {
    setInput(DEMO_POLICY);
    setUtxoText(DEMO_UTXOS);
    setFetchAddress('');
    setRate(10);
    setError('');
    setBlocked('');
  };

  const fetchUtxos = async () => {
    setBusy(true);
    setError('');
    try {
      const addr = fetchAddress.trim();
      if (!addr) throw new Error('Please provide a Bitcoin address to fetch (or paste UTXOs manually).');
      let lastErr = '';
      for (const api of BTC_APIS) {
        try {
          const res = await fetch(`${api}/address/${addr}/utxo`);
          if (!res.ok) {
            lastErr = `HTTP ${res.status}`;
            continue;
          }
          const list = (await res.json()) as { txid: string; vout: number; value: number }[];
          const text = list.map((u) => `${u.txid};${u.vout};${u.value}`).join('\n');
          setUtxoText(`txid;vout;sats\n${text}`);
          setUtxoFetchedAt(Date.now());
          setError('');
          setBusy(false);
          return;
        } catch (e) {
          lastErr = (e as Error).message;
        }
      }
      throw new Error(`UTXO fetch failed (${lastErr}). Please paste UTXOs manually as CSV/JSON.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const analyze = async () => {
    setError('');
    setBlocked('');
    const secret = detectSecrets(input) || detectSecrets(utxoText);
    if (secret) {
      setBlocked(
        `Input blocked: ${secret} detected. This tool accepts only xpubs, descriptors, policies and public data. NEVER enter seed phrases or private keys.`,
      );
      return;
    }
    if (!input.trim()) {
      setError('Please enter a policy (e.g. ' + DEMO_POLICY + ') or a descriptor (wsh/tr).');
      return;
    }
    setBusy(true);
    try {
      const { ctx, inner, kind } = extractScript(input);
      let node: PolicyNode;
      let usedCompiler: Analysis['usedCompiler'] = 'internal parser';
      let issane: boolean | undefined;
      let scriptBytes = 0;
      let controlLeafs = 1;

      // 1) try the compiler (sane check + canonical ASM)
      try {
        const MP = await import('@bitcoinerlab/miniscript-policies');
        if (MP.ready) await MP.ready;
        if (ctx === 'wsh') {
          const c = MP.compilePolicy(inner);
          issane = !!c.issane;
          scriptBytes = asmToBytes(String(c.asm)).length;
          usedCompiler = 'miniscript-policies';
        } else {
          const c = MP.compilePolicyTaproot(inner);
          issane = !!c.issane;
          // with the Taproot compiler: estimate leaf count from the top-level or-structure
          const topOr = inner.startsWith('or(') ? 2 : 1;
          controlLeafs = topOr;
          usedCompiler = 'miniscript-policies';
          // script bytes likewise via policy->ASM (SegWit context yields the same logic sequence)
          const c2 = MP.compilePolicy(inner);
          scriptBytes = asmToBytes(String(c2.asm)).length;
        }
        node = parsePolicy(inner);
      } catch {
        // 2) fallback: internal parser, script size heuristic = ASM of the internal tree
        node = parsePolicy(inner);
        const estAsm = policyToApproxAsm(node);
        scriptBytes = asmToBytes(estAsm).length;
        issane = undefined;
      }

      const options = satisfactionOptions(node, ctx);
      const depth = ctx === 'tr' ? Math.max(0, Math.ceil(Math.log2(Math.max(1, controlLeafs)))) : 0;
      const cb = 33 + 32 * depth;
      const paths: PathWeight[] = options.map((items, i) => {
        const w = pathWeight(items, scriptBytes, ctx, cb);
        w.label = (ctx === 'tr' ? 'Script path' : 'P2WSH path') + ' ' + String.fromCharCode(65 + i) + ' — ' + items.length + ' witness items (' + items.join('+') + ' B)';
        return w;
      });
      if (ctx === 'tr') paths.unshift(taprootKeyPathWeight());

      const warnings = [...findConsensusIssues(node)];
      const dedup = new Set<string>();
      const uniq = warnings.filter((w) => (dedup.has(w.text) ? false : (dedup.add(w.text), true)));

      const utxos = parseUtxos(utxoText);
      const results = utxos.flatMap((u) => {
        const worst = Math.max(...paths.map((p) => p.vbytes));
        return [{ ...dustAnalysis(u, worst, rate), rate }];
      });

      setAnalysis({
        context: ctx,
        policySource: input.trim(),
        descriptorKind: kind,
        usedCompiler,
        issane,
        paths,
        warnings: uniq,
        utxos: results,
        rate,
        source: utxoText.includes('demo') ? 'offline' : utxoFetchedAt ? 'public' : utxos.length ? 'user' : 'offline',
        at: utxoFetchedAt ?? undefined,
        address: fetchAddress.trim() || undefined,
      });
    } catch (e) {
      setError('Analysis failed: ' + (e as Error).message + ' — check the syntax (policy/descriptor).');
    } finally {
      setBusy(false);
    }
  };

  const worstPath = useMemo(() => (analysis ? Math.max(...analysis.paths.map((p) => p.vbytes)) : 0), [analysis]);
  const bestPath = useMemo(() => (analysis ? Math.min(...analysis.paths.map((p) => p.vbytes)) : 0), [analysis]);
  const heat = useMemo(() => (analysis ? heatmapThresholds([worstPath, bestPath]) : []), [analysis, worstPath, bestPath]);

  const consolidationAdvice = useMemo(() => {
    if (!analysis || analysis.utxos.length === 0) return '';
    const risky = analysis.utxos.filter((r) => r.crossedThird && !r.totalLoss);
    const lost = analysis.utxos.filter((r) => r.totalLoss);
    const sumRisky = risky.reduce((s, r) => s + r.utxo.sats, 0);
    const parts: string[] = [];
    if (lost.length)
      parts.push(
        `${lost.length} UTXO(s) are economically unspendable at ${analysis.rate} sat/vB (fee ≥ value). Total locked: ${num(lost.reduce((s, r) => s + r.utxo.sats, 0))} sats.`,
      );
    if (risky.length)
      parts.push(
        `${risky.length} UTXO(s) sit below the 1/3 dust cliff (totalling ${num(sumRisky)} sats). Recommendation: consolidate into a larger UTXO at a low fee (≤ ${Math.max(
          1,
          Math.floor(sumRisky / Math.max(1, Math.ceil(worstPath))),
        )} sat/vB).`,
      );
    if (!risky.length && !lost.length) return 'All UTXOs are economically spendable at the chosen fee rate.';
    return parts.join(' ');
  }, [analysis, worstPath]);

  const overallLevel: StatusLevel | null = analysis
    ? analysis.utxos.some((r) => r.totalLoss) || analysis.warnings.some((w) => w.level === 'red')
      ? 'red'
      : analysis.utxos.some((r) => r.crossedThird) || analysis.warnings.length
        ? 'amber'
        : 'green'
    : null;

  return (
    <div className="space-y-5">
      <StepSection
        n={1}
        title="Enter policy / descriptor & UTXOs"
        hint="Strictly public data only: policy, descriptor with xpubs/fingerprints, UTXO list. Seed phrases and private keys are actively detected and blocked."
      >
        <div className="flex flex-wrap gap-2 items-center">
          <DemoButton onClick={demo} />
          <span className="text-xs text-dim">Demo: inheritance policy with timelock path</span>
        </div>
        <div>
          <label className="label" htmlFor="bv-policy">Miniscript policy or output descriptor (wsh/tr)</label>
          <textarea
            id="bv-policy"
            className="textarea mono"
            placeholder={DEMO_POLICY + ' or wsh(and_v(v:pk(…),after(…))) / tr(xpub…,{…})'}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setBlocked('');
            }}
            spellCheck={false}
          />
        </div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label" htmlFor="bv-addr">Fetch UTXOs by address (optional)</label>
            <input id="bv-addr" className="input mono" placeholder="bc1q…/bc1p…" value={fetchAddress} onChange={(e) => setFetchAddress(e.target.value)} />
          </div>
          <button className="btn btn-ghost" onClick={() => void fetchUtxos()} disabled={busy}>
            Fetch
          </button>
        </div>
        <div>
          <label className="label" htmlFor="bv-utxo">UTXO list (CSV "txid;vout;sats" or JSON)</label>
          <textarea id="bv-utxo" className="textarea mono" rows={5} value={utxoText} onChange={(e) => { setUtxoText(e.target.value); setUtxoFetchedAt(null); }} placeholder={'txid;vout;sats\n… '} />
        </div>
        {blocked && (
          <div className="status-tile status-red">
            <span aria-hidden="true">✕</span>
            <p className="text-sm">{blocked}</p>
          </div>
        )}
      </StepSection>

      <StepSection n={2} title="Start the stress test">
        <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <label className="label" htmlFor="bv-rate">
              Fee rate: <span className="text-gold-hi mono">{rate} sat/vB</span>
            </label>
            <input
              id="bv-rate"
              type="range"
              min={1}
              max={1000}
              step={1}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-dim mono">
              <span>1</span>
              <span>100</span>
              <span>500</span>
              <span>1000 sat/vB</span>
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => void analyze()} disabled={busy}>
            {busy ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        <p className="text-sm">
          Computes exact vByte weights per spending path and checks each UTXO against the 1/3 dust cliff
          (Bitcoin Core: economically critical at fee &gt; value/3) and the 100 % total-loss point.
        </p>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {analysis && (
        <StepSection n={3} title="Stress report">
          <StatusTile
            level={overallLevel!}
            headline={
              overallLevel === 'red'
                ? 'Critical: unspendable paths or consensus conflicts'
                : overallLevel === 'amber'
                  ? 'Caution: dust cliff reached or check consensus assumptions'
                  : 'Vault resilient regarding dust & paths'
            }
            detail={consolidationAdvice}
          />
          <KpiGrid>
            <Kpi label="Lightest path" value={bestPath + ' vB'} tone="green" />
            <Kpi label="Heaviest path" value={worstPath + ' vB'} tone={worstPath > 300 ? 'amber' : 'default'} />
            <Kpi label="Dust limit @rate" value={satsFmt(Math.ceil(worstPath * analysis.rate) * 3)} tone="amber" />
            <Kpi
              label="UTXOs below 1/3 cliff"
              value={`${analysis.utxos.filter((r) => r.crossedThird).length}/${analysis.utxos.length}`}
              tone={analysis.utxos.some((r) => r.crossedThird) ? 'red' : 'green'}
            />
          </KpiGrid>

          <div className="flex flex-wrap gap-2 items-center text-xs text-dim">
            <span className="badge badge-green">Compiler: {analysis.usedCompiler}</span>
            {analysis.issane != null && <span className={`badge ${analysis.issane ? 'badge-green' : 'badge-red'}`}>sane: {String(analysis.issane)}</span>}
            <SourceBadge source={analysis.source} at={analysis.at} />
          </div>

          <details className="acc">
            <summary>Fee-bumping landscape 2026 (pre-signed recovery TXs)</summary>
            <div className="acc-body space-y-2 text-sm">
              <p>
                Pre-signed vault transactions carry a <strong>fixed fee</strong> — whether it is competitive
                at broadcast depends on the network relay policy:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Full-RBF is standard:</strong> on by default since Bitcoin Core 28.0 (10/2024), mandatory since
                  29.0 (04/2025) — every unconfirmed transaction is replaceable, whether or not it signals BIP-125.
                  A recovery TX can therefore be fee-bumped later, as long as a signed replacement fee tier exists.
                </li>
                <li>
                  <strong>CPFP via ephemeral anchors (P2A):</strong> standard-relayable since Core 28.0
                  (<code>OP_1 0x4e73</code>, dust-free, anyone can spend). This lets the fee be set entirely
                  at broadcast time — suitable for zero-fee commitment transactions in vault designs.
                </li>
                <li>
                  <strong>TRUC (v3 transactions):</strong> limit pinning risk (size limit 10,000 vB, one
                  unconfirmed ancestor per package, incentive-compatible replacements) and have been relayed since Core 28.0.
                </li>
                <li>
                  <strong>1p1c package relay:</strong> an underpaid parent can be submitted as a package with a
                  well-paid child (Core 28.0+) — a practical rescue path for too tightly priced pre-signed TXs.
                </li>
              </ul>
              <p className="text-dim text-xs">
                Bottom line: the dust/fee analysis above stays worst-case oriented (fixed tiers!). Whether your vault policy
                benefits from anchor outputs/TRUC depends on the construction (Liana-style designs partly rely on TRUC).
              </p>
            </div>
          </details>

          <details className="acc" open>
            <summary>Path weight table</summary>
            <div className="acc-body">
              <table className="table-x">
                <thead>
                  <tr>
                    <th>Spending path</th>
                    <th>Script</th>
                    <th>Control Block</th>
                    <th>Weight</th>
                    <th>vBytes</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.paths.map((p) => (
                    <tr key={p.label}>
                      <td>{p.label}</td>
                      <td className="mono">{p.scriptBytes} B</td>
                      <td className="mono">{p.controlBlockBytes ? p.controlBlockBytes + ' B' : '—'}</td>
                      <td className="mono">{num(p.weightWU)} WU</td>
                      <td className="mono font-bold text-ink">{p.vbytes} vB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {analysis.warnings.length > 0 && (
            <details className="acc" open>
              <summary>Bitcoin consensus pitfalls ({analysis.warnings.length})</summary>
              <div className="acc-body">
                <ul className="space-y-2">
                  {analysis.warnings.map((w, i) => (
                    <li key={i} className={`badge ${w.level === 'red' ? 'badge-red' : 'badge-amber'} whitespace-normal text-left`}>
                      {w.text}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}

          <details className="acc" open>
            <summary>Fee heatmap (heaviest path: {worstPath} vB)</summary>
            <div className="acc-body overflow-x-auto">
              <table className="table-x">
                <thead>
                  <tr>
                    <th>sats/vB</th>
                    <th>Fee (sats)</th>
                    <th>1/3 dust limit</th>
                    <th>100% loss at ≤</th>
                  </tr>
                </thead>
                <tbody>
                  {heat.map((h) => (
                    <tr key={h.rate} className={h.rate === analysis.rate ? 'bg-gold-soft' : ''}>
                      <td className="mono">{h.rate}</td>
                      <td className="mono">{num(h.lossLimit)}</td>
                      <td className={`mono ${h.rate >= 20 ? 'text-gold-hi' : ''}`}>{num(h.dustLimit)}</td>
                      <td className={`mono ${h.rate >= 60 ? 'text-danger' : ''}`}>{num(h.lossLimit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {analysis.utxos.length > 0 && (
            <details className="acc" open>
              <summary>UTXO assessment @ {analysis.rate} sat/vB</summary>
              <div className="acc-body overflow-x-auto">
                <table className="table-x">
                  <thead>
                    <tr>
                      <th>UTXO</th>
                      <th>Value</th>
                      <th>Fee</th>
                      <th>Share</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.utxos.map((r, i) => (
                      <tr key={i}>
                        <td className="mono text-xs">{r.utxo.txid.slice(0, 12)}…:{r.utxo.vout}</td>
                        <td className="mono">{num(r.utxo.sats)}</td>
                        <td className="mono">{num(r.fee)}</td>
                        <td className="mono">{r.pct.toFixed(1)} %</td>
                        <td>
                          <span className={`badge ${r.totalLoss ? 'badge-red' : r.crossedThird ? 'badge-amber' : 'badge-green'}`}>
                            {r.totalLoss ? 'total loss' : r.crossedThird ? '1/3 cliff' : 'ok'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <ExportBar
            onJson={() => downloadJSON({ tool: 'bitvault-stress', generatedAt: new Date().toISOString(), analysis }, 'bitvault-stress-report.json')}
            onCsv={() =>
              downloadCSV(
                analysis.utxos.map((r) => ({
                  txid: r.utxo.txid,
                  vout: r.utxo.vout,
                  sats: r.utxo.sats,
                  rate_sat_vb: r.rate,
                  fee_sats: r.fee,
                  fee_pct: r.pct.toFixed(2),
                  third_dust: r.crossedThird ? 'yes' : 'no',
                  total_loss: r.totalLoss ? 'yes' : 'no',
                })),
                'bitvault-stress-utxos.csv',
              )
            }
            onHtml={() => downloadSelfContainedHtml(buildHeirDrillHtml(analysis), 'heir-drill.html')}
          />
        </StepSection>
      )}
    </div>
  );
}

/** Approximate ASM from the internal policy tree (script size estimation only). */
function policyToApproxAsm(node: PolicyNode): string {
  switch (node.type) {
    case 'pk':
      return `<${node.key ?? 'key'}> OP_CHECKSIG`;
    case 'after':
      return `<${node.n}> OP_CHECKLOCKTIMEVERIFY`;
    case 'older':
      return `<${node.n}> OP_CHECKSEQUENCEVERIFY`;
    case 'hash':
      return `OP_SHA256 <ff> OP_EQUAL`;
    case 'and': {
      const [c0, c1] = node.children ?? [];
      return `${c0 ? policyToApproxAsm(c0) : '<?> '} OP_DROP ${c1 ? policyToApproxAsm(c1) : '<?> '}`;
    }
    case 'or': {
      const [c0, c1] = node.children ?? [];
      return `OP_IF ${c0 ? policyToApproxAsm(c0) : '<?> '} OP_ELSE ${c1 ? policyToApproxAsm(c1) : '<?> '} OP_ENDIF`;
    }
    case 'multi':
      return `${node.k} ${node.children!.map(() => '<key>').join(' ')} ${node.children!.length} OP_CHECKMULTISIG`;
    case 'thresh':
      return node.children!.map(policyToApproxAsm).join(' OP_SWAP ') + ` ${node.k} OP_CHECKSEQUENCEVERIFY`;
  }
}
