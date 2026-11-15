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
  issane?: boolean;
  usedCompiler: 'miniscript-policies' | 'interner Parser';
  paths: PathWeight[];
  warnings: { level: 'amber' | 'red'; text: string }[];
  utxos: (DustResult & { rate: number })[];
  rate: number;
  source?: 'public' | 'offline' | 'user' | 'wallet' | 'cache';
  address?: string;
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
      if (parts.length >= 3 && /^\d+$/.test(parts[2])) {
        rows.push({ txid: parts[0], vout: Number(parts[1]), sats: Number(parts[2]) });
      }
    }
    return rows;
  }
}

/** Extrahiert Kontext & Miniscript/Policy-Text aus Deskriptor oder nackter Policy. */
function extractScript(input: string): { ctx: VaultContext; inner: string; kind: Analysis['descriptorKind'] } {
  const t = input.trim().replace(/\s/g, '');
  const wsh = t.match(/^wsh\((.*)\)(?:#[0-9a-z]+)?$/i);
  if (wsh) return { ctx: 'wsh', inner: wsh[1], kind: 'wsh' };
  const tr = t.match(/^tr\((.*?)(?:,(.*))?\)(?:#[0-9a-z]+)?$/i);
  if (tr) return { ctx: 'tr', inner: tr[2] ?? '', kind: 'tr' };
  return { ctx: 'wsh', inner: t, kind: /^(wsh|sh|pkh|wpkh|tr)\(/i.test(t) ? 'unknown' : 'policy' };
}

function buildHeirDrillHtml(a: Analysis): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const worst = [...a.paths].sort((x, y) => y.vbytes - x.vbytes)[0];
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Erben-Uebungsdatei (heir-drill)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;background:#07090d;color:#cbd5e1;max-width:44rem;margin:2rem auto;padding:0 1rem;line-height:1.7}
h1,h2{color:#f8fafc}code,pre{font-family:ui-monospace,Menlo,monospace;font-size:.85rem}
pre{background:#0f141b;border:1px solid #1e293b;border-radius:.6rem;padding:.8rem;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.ok{color:#34d399}.warn{color:#facc15}li{margin:.35rem 0}</style></head><body>
<h1>🧭 Erben-Uebung: Tresor-Wiederherstellung proben</h1>
<p>Diese Datei ist vollstaendig <strong>offline</strong> ausfuehrbar. Sie enthaelt keine Schluessel — nur das oeffentliche
Ausgabemodell und eine Schritt-fuer-Schritt-Uebung mit Testwerten.</p>
<h2>1. Ausgabemodell</h2>
<pre>Kontext:      ${esc(a.context === 'tr' ? 'Taproot (tr)' : 'SegWit v0 (wsh)')}
Definition:   ${esc(a.policySource)}
Compiler:     ${esc(a.usedCompiler)}${a.issane != null ? `, sane=${a.issane}` : ''}
Pfad-Gewichte:${a.paths.map((p) => `\n  - ${esc(p.label)}: ${p.vbytes} vB (Script ${p.scriptBytes} B${p.controlBlockBytes ? `, Control Block ${p.controlBlockBytes} B` : ''})`).join('')}</pre>
<h2>2. Uebungsablauf (trocken, keine echten UTXOs)</h2>
<ol>
<li><strong>Wiederherstellung installieren:</strong> Wallet-Software der Wahl auf einem Offline-Geraet oeffnen, Deskriptor/Policy importieren (Watch-Only). Pruefen: abgeleitete Adressen stimmen mit den Berechtigungsunterlagen ueberein.</li>
<li><strong>Test-PSBT bauen:</strong> Eine Uebungs-Transaktion mit einem fiktiven UTXO (z. B. 100.000 sats) und dem <em>heaviest</em> Ausgabepfad (${worst ? esc(worst.label) + ', ' + worst.vbytes + ' vB' : 'siehe oben'}) erstellen; Gebuehrensatz 5 sat/vB → kalkulatorische Gebuehr: ${worst ? num(Math.ceil(worst.vbytes * 5)) : '—'} sats.</li>
<li><strong>Signatur-Weg proben:</strong> Die Kombination der benoetigten Schluessel/Hardware-Devices einmal komplett durchspielen (Reihenfolge, PINs, Passphrasen dokumentieren).</li>
<li><strong>Timelock-Logik pruefen:</strong> Falls der Pfad <code>after()</code> enthaelt: die notwendige Blockhoehe notieren und verifizieren, dass nLockTime korrekt gesetzt wird, damit der Pfad ueberhaupt gueltig ist.</li>
<li><strong>Notieren &amp; archivieren:</strong> Die Uebungs-PSBT hexadezimal archivieren; Ergebnis dieser Datei beilegen.</li>
</ol>
<h2>3. Checkliste fuer den Ernstfall</h2>
<ul>
<li>Steuer-/Erbfall-Doku: DAC8-SelfProof-Export des letzten bekannten UTXO-Stands beilegen.</li>
<li>Gebuehrenpuffer: UTXOs unterhalb der 1/3-Dust-Klippe rechtzeitig konsolidieren (siehe BitVault-Stress-Bericht).</li>
<li>Mehrfachausfertigung: Diese Datei an mindestens zwei getrennten Orten lagern.</li>
</ul>
<p class="warn">Sicherheit: Niemals Seed-Woerter oder private Schluessel in digitale Uebungsdateien schreiben.</p>
<p style="color:#64748b;font-size:.8rem">Erzeugt lokal durch AndrexTheDev BitVault-Stress. Kein Netzwerkzugriff, keine Schluessel.</p>
</body></html>`;
}

export default function BitVaultStress() {
  const [input, setInput] = useState('');
  const [utxoText, setUtxoText] = useState('');
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
      if (!addr) throw new Error('Bitte eine Bitcoin-Adresse fuer den Abruf angeben (oder UTXOs manuell einfuegen).');
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
          setError('');
          setBusy(false);
          return;
        } catch (e) {
          lastErr = (e as Error).message;
        }
      }
      throw new Error(`UTXO-Abruf fehlgeschlagen (${lastErr}). Bitte UTXOs manuell als CSV/JSON einfuegen.`);
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
        `Eingabe blockiert: ${secret} erkannt. Dieses Werkzeug akzeptiert ausschliesslich xpubs, Deskriptoren, Policies und oeffentliche Daten. Geben Sie NIEMALS Seed-Phrasen oder Privatschluessel ein.`,
      );
      return;
    }
    if (!input.trim()) {
      setError('Bitte eine Policy (z. B. ' + DEMO_POLICY + ') oder einen Deskriptor (wsh/tr) eingeben.');
      return;
    }
    setBusy(true);
    try {
      const { ctx, inner, kind } = extractScript(input);
      let node: PolicyNode;
      let usedCompiler: Analysis['usedCompiler'] = 'interner Parser';
      let issane: boolean | undefined;
      let scriptBytes = 0;
      let controlLeafs = 1;

      // 1) Compiler versuchen (sane-Check + kanonisches ASM)
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
          // Beim Taproot-Compiler: Anzahl Blaetter aus Top-Level-or-Struktur schaetzen
          const topOr = inner.startsWith('or(') ? 2 : 1;
          controlLeafs = topOr;
          usedCompiler = 'miniscript-policies';
          // Script-Bytes ebenfalls ueber Policy->ASM (Segwit-Kontext liefert die gleiche Logik-Sequenz)
          const c2 = MP.compilePolicy(inner);
          scriptBytes = asmToBytes(String(c2.asm)).length;
        }
        node = parsePolicy(inner);
      } catch {
        // 2) Fallback: interner Parser, Script-Groesse heuristisch = ASM des internen Baums
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
        w.label = (ctx === 'tr' ? 'Skriptpfad' : 'P2WSH-Pfad') + ' ' + String.fromCharCode(65 + i) + ' — ' + items.length + ' Witness-Items (' + items.join('+') + ' B)';
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
        source: utxoText.includes('demo') || utxos.length ? (utxoText.includes('demo') ? 'offline' : 'user') : 'offline',
        address: fetchAddress.trim() || undefined,
      });
    } catch (e) {
      setError('Analyse fehlgeschlagen: ' + (e as Error).message + ' — Syntax pruefen (policy/deskriptor).');
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
        `${lost.length} UTXO(s) sind bei ${analysis.rate} sat/vB oekonomisch unausgebbar (Gebuehr ≥ Wert). Gesamtblockiert: ${num(lost.reduce((s, r) => s + r.utxo.sats, 0))} sats.`,
      );
    if (risky.length)
      parts.push(
        `${risky.length} UTXO(s) liegen unter der 1/3-Dust-Klippe (zusammen ${num(sumRisky)} sats). Empfehlung: bei niedriger Gebuehr (≤ ${Math.max(
          1,
          Math.floor(sumRisky / Math.max(1, Math.ceil(worstPath))),
        )} sat/vB) zu einem groesseren UTXO konsolidieren.`,
      );
    if (!risky.length && !lost.length) return 'Alle UTXOs sind beim gewaehlten Gebuehrensatz oekonomisch ausgebbar.';
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
        title="Policy / Deskriptor & UTXOs eingeben"
        hint="Strikt nur oeffentliche Daten: Policy, Deskriptor mit xpubs/Fingerprints, UTXO-Liste. Seed-Phrasen und Privatschluessel werden aktiv erkannt und blockiert."
      >
        <div className="flex flex-wrap gap-2 items-center">
          <DemoButton onClick={demo} />
          <span className="text-xs text-dim">Demo: Erbschafts-Policy mit Timelock-Pfad</span>
        </div>
        <div>
          <label className="label" htmlFor="bv-policy">Miniscript-Policy oder Output-Deskriptor (wsh/tr)</label>
          <textarea
            id="bv-policy"
            className="textarea mono"
            placeholder={DEMO_POLICY + ' oder wsh(and_v(v:pk(…),after(…))) / tr(xpub…,{…})'}
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
            <label className="label" htmlFor="bv-addr">UTXOs per Adresse abrufen (optional)</label>
            <input id="bv-addr" className="input mono" placeholder="bc1q…/bc1p…" value={fetchAddress} onChange={(e) => setFetchAddress(e.target.value)} />
          </div>
          <button className="btn btn-ghost" onClick={() => void fetchUtxos()} disabled={busy}>
            Abrufen
          </button>
        </div>
        <div>
          <label className="label" htmlFor="bv-utxo">UTXO-Liste (CSV „txid;vout;sats" oder JSON)</label>
          <textarea id="bv-utxo" className="textarea mono" rows={5} value={utxoText} onChange={(e) => setUtxoText(e.target.value)} placeholder={'txid;vout;sats\n… '} />
        </div>
        {blocked && (
          <div className="status-tile status-red">
            <span aria-hidden="true">✕</span>
            <p className="text-sm">{blocked}</p>
          </div>
        )}
      </StepSection>

      <StepSection n={2} title="Stress-Test starten">
        <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end">
          <div>
            <label className="label" htmlFor="bv-rate">
              Gebuehrensatz: <span className="text-gold-hi mono">{rate} sat/vB</span>
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
            {busy ? 'Analysiere…' : 'Analysieren'}
          </button>
        </div>
        <p className="text-sm">
          Berechnet exakte vByte-Gewichte je Ausgabepfad und prueft jeden UTXO gegen die 1/3-Dust-Klippe
          (Bitcoin-Core: oekonomisch kritisch bei Gebuehr &gt; Wert/3) und den 100-%-Totalverlust-Punkt.
        </p>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {analysis && (
        <StepSection n={3} title="Stress-Bericht">
          <StatusTile
            level={overallLevel!}
            headline={
              overallLevel === 'red'
                ? 'Kritisch: unausgabbbare Pfade oder Konsens-Konflikte'
                : overallLevel === 'amber'
                  ? 'Vorsicht: Dust-Klippe erreicht oder Konsens-Annahmen pruefen'
                  : 'Tresor bezueglich Dust & Pfade belastbar'
            }
            detail={consolidationAdvice}
          />
          <KpiGrid>
            <Kpi label="Leichtester Pfad" value={bestPath + ' vB'} tone="green" />
            <Kpi label="Schwerster Pfad" value={worstPath + ' vB'} tone={worstPath > 300 ? 'amber' : 'default'} />
            <Kpi label="Dust-Limit @Rate" value={satsFmt(Math.ceil(worstPath * analysis.rate) * 3)} tone="amber" />
            <Kpi
              label="UTXOs unter 1/3-Klippe"
              value={`${analysis.utxos.filter((r) => r.crossedThird).length}/${analysis.utxos.length}`}
              tone={analysis.utxos.some((r) => r.crossedThird) ? 'red' : 'green'}
            />
          </KpiGrid>

          <div className="flex flex-wrap gap-2 items-center text-xs text-dim">
            <span className="badge badge-green">Compiler: {analysis.usedCompiler}</span>
            {analysis.issane != null && <span className={`badge ${analysis.issane ? 'badge-green' : 'badge-red'}`}>sane: {String(analysis.issane)}</span>}
            <SourceBadge source={analysis.source} />
          </div>

          <details className="acc" open>
            <summary>Pfad-Gewichtstabelle</summary>
            <div className="acc-body">
              <table className="table-x">
                <thead>
                  <tr>
                    <th>Ausgabepfad</th>
                    <th>Script</th>
                    <th>Control Block</th>
                    <th>Gewicht</th>
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
              <summary>Bitcoin-Konsens-Fallen ({analysis.warnings.length})</summary>
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
            <summary>Gebuehren-Heatmap (schwerster Pfad: {worstPath} vB)</summary>
            <div className="acc-body overflow-x-auto">
              <table className="table-x">
                <thead>
                  <tr>
                    <th>sats/vB</th>
                    <th>Gebuehr (sats)</th>
                    <th>1/3-Dust-Limit</th>
                    <th>100-%-Verlust bei ≤</th>
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
              <summary>UTXO-Bewertung @ {analysis.rate} sat/vB</summary>
              <div className="acc-body overflow-x-auto">
                <table className="table-x">
                  <thead>
                    <tr>
                      <th>UTXO</th>
                      <th>Wert</th>
                      <th>Gebuehr</th>
                      <th>Anteil</th>
                      <th>Ampel</th>
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
                            {r.totalLoss ? 'Totalverlust' : r.crossedThird ? '1/3-Klippe' : 'ok'}
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
            onJson={() => downloadJSON({ tool: 'bitvault-stress', generatedAt: new Date().toISOString(), analysis }, 'bitvault-stress-bericht.json')}
            onCsv={() =>
              downloadCSV(
                analysis.utxos.map((r) => ({
                  txid: r.utxo.txid,
                  vout: r.utxo.vout,
                  sats: r.utxo.sats,
                  rate_sat_vb: r.rate,
                  fee_sats: r.fee,
                  fee_pct: r.pct.toFixed(2).replace('.', ','),
                  third_dust: r.crossedThird ? 'ja' : 'nein',
                  total_loss: r.totalLoss ? 'ja' : 'nein',
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

/** Approximiertes ASM aus dem internen Policy-Baum (nur Script-Groessen-Schaetzung). */
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
    case 'and':
      return `${policyToApproxAsm(node.children![0])} OP_DROP ${policyToApproxAsm(node.children![1])}`;
    case 'or':
      return `OP_IF ${policyToApproxAsm(node.children![0])} OP_ELSE ${policyToApproxAsm(node.children![1])} OP_ENDIF`;
    case 'multi':
      return `${node.k} ${node.children!.map(() => '<key>').join(' ')} ${node.children!.length} OP_CHECKMULTISIG`;
    case 'thresh':
      return node.children!.map(policyToApproxAsm).join(' OP_SWAP ') + ` ${node.k} OP_CHECKSEQUENCEVERIFY`;
  }
}
