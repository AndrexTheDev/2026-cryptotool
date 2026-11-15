import { useMemo, useState } from 'react';
import {
  CopyButton,
  DemoButton,
  ErrorNote,
  ExportBar,
  FileDrop,
  Kpi,
  KpiGrid,
  StatusTile,
  StepSection,
  type StatusLevel,
} from '../react/ui';
import { downloadCSV, downloadJSON } from '../../lib/export';
import {
  analyzePolicy7715,
  parseDependencies,
  parseHar,
  reconcileDeliveries,
  scanCodePatterns,
  scanDependencies,
  type DeliveryFinding,
} from '../../lib/x402';

const DEMO_LOCK = JSON.stringify(
  {
    name: 'agent-shop',
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { x402: '^2.19.1', '@x402/core': '^2.21.0' } },
      'node_modules/x402': { version: '2.19.5' },
      'node_modules/@x402/core': { version: '2.21.0' },
      'node_modules/@x402/fetch': { version: '2.25.0' },
    },
  },
  null,
  2,
);

const DEMO_CODE = `import { verify } from 'x402/verify';
import { SiwxMessage } from 'x402/siwx';

// Login-Handler
export async function login(sig, msg) {
  const ok = await verify(sig, msg);          // Zwei-Argument-Verify
  return ok;
}

// Solana SPL-Abbuchung
const ix = createTransferInstruction(src, dst, owner, amount); // kein transferChecked

// Agent-Budget-Approval
const tx = await usdc.methods.approve(agent, '999999999000000').send();`;

const DEMO_POLICY = JSON.stringify(
  {
    method: 'wallet_grantPermissions',
    params: {
      permissions: [
        {
          type: 'erc20-token-periodic',
          data: { erc20: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', allowance: '5000000', period: 'daily' },
        },
      ],
      expiry: 1735689600,
    },
  },
  null,
  2,
);

const FIX_SNIPPET = `// Generische Open-Source-Middleware (Skizze, TypeScript, Express-aehnlich)
// Kernidee: Zahlung erst NACH erfolgreicher Lieferung als final markieren.
app.use(async (req, res, next) => {
  if (!req.headers['payment-signature']) {
    // 402 + requirements aus eigener Order-Config (niemals vom Client uebernommen)
    return res.status(402).set('PAYMENT-REQUIRED', buildRequirements(req)).send('Payment Required');
  }
  try {
    const result = await verifyWithRequirements(req.headers['payment-signature'], serverSideRequirements);
    res.set('PAYMENT-RESPONSE', JSON.stringify(result));
    return next(); // Lieferung
  } catch (e) {
    // Zahlungsversuch NICHT als geliefert markieren -> Reconciliation moeglich
    return res.status(402).json({ error: 'payment-invalid', retryable: true });
  }
});`;

function SEVERITY_BADGE(s: string) {
  return s === 'critical' ? 'badge-red' : s === 'high' ? 'badge-amber' : 'badge';
}

export default function X402PaywallGuard() {
  const [lockText, setLockText] = useState('');
  const [code, setCode] = useState('');
  const [policy, setPolicy] = useState('');
  const [harText, setHarText] = useState('');
  const [ran, setRan] = useState(false);
  const [error, setError] = useState('');

  const [report, setReport] = useState<{
    deps: ReturnType<typeof scanDependencies>;
    depsParsed: number;
    codeFindings: ReturnType<typeof scanCodePatterns>;
    policy: ReturnType<typeof analyzePolicy7715>;
    delivery: DeliveryFinding[];
    harEntries: number;
  } | null>(null);

  const demo = () => {
    setLockText(DEMO_LOCK);
    setCode(DEMO_CODE);
    setPolicy(DEMO_POLICY);
    setHarText(
      JSON.stringify({
        log: {
          entries: [
            { request: { url: 'https://api.demo.example/oracle', headers: [{ name: 'PAYMENT-SIGNATURE', value: '0xabc' }] }, response: { status: 200 }, startedDateTime: '2026-11-10T10:01:00Z' },
            { request: { url: 'https://api.demo.example/prices', headers: [{ name: 'PAYMENT-SIGNATURE', value: '0xdef' }] }, response: { status: 502 }, startedDateTime: '2026-11-10T10:02:00Z' },
            { request: { url: 'https://api.demo.example/quote', headers: [] }, response: { status: 402 }, startedDateTime: '2026-11-10T10:03:00Z' },
          ],
        },
      }),
    );
    setError('');
  };

  const run = () => {
    setError('');
    if (!lockText.trim() && !code.trim() && !policy.trim() && !harText.trim()) {
      setError('Mindestens Eingabe: Lockfile/Manifest, Code-Schnipsel, ERC-7715-JSON oder HAR-Log.');
      return;
    }
    const deps = lockText.trim() ? parseDependencies(lockText, 'package-lock.json') : [];
    const depFindings = scanDependencies(deps);
    const codeFindings = code.trim() ? scanCodePatterns(code) : [];
    const pol = policy.trim() ? analyzePolicy7715(policy) : analyzePolicy7715('{}');
    const entries = harText.trim() ? parseHar(harText) : [];
    const delivery = reconcileDeliveries(entries);
    setReport({ deps: depFindings, depsParsed: deps.length, codeFindings, policy: pol, delivery, harEntries: entries.length });
    setRan(true);
  };

  const level: StatusLevel | null = report
    ? report.deps.some((d) => d.advisory.severity === 'critical') || report.codeFindings.some((f) => f.severity === 'critical') || report.delivery.length
      ? 'red'
      : report.deps.length || report.codeFindings.length || (policy.trim() && report.policy.ok < 4)
        ? 'amber'
        : 'green'
    : null;

  const radar = useMemo(() => {
    if (!report || !policy.trim()) return null;
    return report.policy.dims;
  }, [report, policy]);

  return (
    <div className="space-y-5">
      <StepSection n={1} title="Artefakte einsammeln" hint="Lockfile/Manifest, SIWX-/x402-Code, ERC-7715-Policy (wallet_grantPermissions) und optional HAR-Logs — alles bleibt lokal.">
        <div className="flex flex-wrap gap-2 items-center">
          <DemoButton onClick={demo} />
          <span className="text-xs text-dim">Demo: angreifbares Lockfile + anfaelliger SIWX-Code + Policy</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="x4-lock">package-lock.json / package.json / go.mod / requirements.txt</label>
            <textarea id="x4-lock" className="textarea mono" rows={6} value={lockText} onChange={(e) => setLockText(e.target.value)} placeholder='{"packages":{…}}' />
            <FileDrop label="…oder Datei ablegen" accept=".json,.mod,.txt,.lock" onFile={(c) => setLockText(c)} />
          </div>
          <div>
            <label className="label" htmlFor="x4-code">SIWX-/x402-Code-Schnipsel</label>
            <textarea id="x4-code" className="textarea mono" rows={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="// TypeScript/JS-Code der Zahlungs- oder Login-Middleware" />
          </div>
          <div>
            <label className="label" htmlFor="x4-pol">ERC-7715 wallet_grantPermissions (JSON)</label>
            <textarea id="x4-pol" className="textarea mono" rows={5} value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder='{"method":"wallet_grantPermissions", …}' />
          </div>
          <div>
            <label className="label" htmlFor="x4-har">HTTP-Log / HAR (optional, Lieferabgleich)</label>
            <textarea id="x4-har" className="textarea mono" rows={5} value={harText} onChange={(e) => setHarText(e.target.value)} placeholder='{"log":{"entries":[…]}}' />
            <FileDrop label="HAR-Datei ablegen" accept=".har,.json" onFile={(c) => setHarText(c)} />
          </div>
        </div>
      </StepSection>

      <StepSection n={2} title="Audit ausführen">
        <p className="text-sm">
          Gleicht Paketversionen gegen die eingebettete Schwachstellen-Matrix (x402-Linien), scannt Code-Patterns
          (Zwei-Argument-SIWX, TransferChecked, approve-Disziplin), bewertet die Policy gegen 8 Schutzdimensionen und
          gleicht Zahlungsbelege gegen Lieferstatus ab.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={run}>
          Analysieren
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {report && ran && (
        <StepSection n={3} title="Kritikalitätsbericht">
          <StatusTile
            level={level!}
            headline={
              level === 'red'
                ? 'Kritische Befunde: nicht ausfuehren, bevor gepatcht'
                : level === 'amber'
                  ? 'Erhoehtes Risiko: Patches und Policy-Haertung noetig'
                  : 'Keine bekannten kritischen Befunde im geprueften Umfang'
            }
            detail={`Geprueft: ${report.depsParsed} Pakete, ${report.codeFindings.length} Code-Befunde, Policy ${policy.trim() ? `${report.policy.ok}/8 Dimensionen` : '—'}, ${report.delivery.length} Lieferdefizite.`}
          />
          <KpiGrid>
            <Kpi label="Verwundbare Abhaengigkeiten" value={report.deps.length} tone={report.deps.length ? 'red' : 'green'} />
            <Kpi label="Code-Pattern-Funde" value={report.codeFindings.length} tone={report.codeFindings.length ? 'amber' : 'green'} />
            <Kpi label="Policy-Dimensionen abgedeckt" value={policy.trim() ? `${report.policy.ok}/8` : 'n/a'} tone={policy.trim() ? (report.policy.ok >= 5 ? 'default' : 'amber') : 'default'} />
            <Kpi label="Bezahlt, nicht geliefert" value={report.delivery.length} tone={report.delivery.length ? 'red' : 'green'} />
          </KpiGrid>

          {report.deps.length > 0 && (
            <details className="acc" open>
              <summary>Dependency-Funde ({report.deps.length})</summary>
              <div className="acc-body overflow-x-auto">
                <table className="table-x">
                  <thead>
                    <tr>
                      <th>Paket</th>
                      <th>Version</th>
                      <th>Schwelle</th>
                      <th>Kritikalitaet</th>
                      <th>Beschreibung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.deps.map((d) => (
                      <tr key={d.name + d.version}>
                        <td className="mono text-xs">{d.name}</td>
                        <td className="mono">{d.version}</td>
                        <td className="mono">&lt; {d.advisory.belowVersion}</td>
                        <td>
                          <span className={`badge ${SEVERITY_BADGE(d.advisory.severity)}`}>{d.advisory.severity}</span>
                        </td>
                        <td className="text-xs">{d.advisory.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {report.codeFindings.length > 0 && (
            <details className="acc" open>
              <summary>Code-Pattern-Funde ({report.codeFindings.length})</summary>
              <div className="acc-body space-y-3">
                {report.codeFindings.map((f, i) => (
                  <div key={i} className="border border-line rounded-lg p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge ${SEVERITY_BADGE(f.severity)}`}>{f.severity}</span>
                      <span className="mono text-xs text-dim">{f.rule} · Zeile {f.line}</span>
                    </div>
                    <pre className="mono text-xs mt-2 bg-obsidian border border-line rounded p-2 overflow-x-auto">{f.snippet}</pre>
                    <p className="text-sm mt-2">{f.explanation}</p>
                    <p className="text-sm text-prime-hi mt-1">Fix: {f.fix}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {radar && (
            <details className="acc" open>
              <summary>8-Punkte-Policy-Radar ({report.policy.ok}/8)</summary>
              <div className="acc-body grid sm:grid-cols-2 gap-4">
                <svg viewBox="0 0 220 220" className="w-56 h-56 mx-auto" role="img" aria-label="Policy-Radar">
                  {[0.25, 0.5, 0.75, 1].map((f) => (
                    <polygon key={f} points={radarPoints(8, f)} fill="none" stroke="#1e293b" strokeWidth="1" />
                  ))}
                  <polygon
                    points={radarValuePolygon(report.policy.dims.map((d) => (d.present ? 1 : 0)))}
                    fill="rgba(16,185,129,0.25)"
                    stroke="#10b981"
                    strokeWidth="2"
                  />
                  {report.policy.dims.map((d, i) => {
                    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                    return (
                      <text key={d.id} x={110 + Math.cos(a) * 102} y={110 + Math.sin(a) * 102 + 3} textAnchor="middle" fontSize="7.5" fill={d.present ? '#34d399' : '#64748b'}>
                        {d.id}
                      </text>
                    );
                  })}
                </svg>
                <ul className="space-y-1 text-sm self-center">
                  {report.policy.dims.map((d) => (
                    <li key={d.id}>
                      <span className={`badge ${d.present ? 'badge-green' : 'badge-red'}`}>{d.present ? '✓' : '✕'}</span> {d.label}
                      {d.evidence && <span className="text-xs text-dim"> — {d.evidence}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}

          {report.harEntries > 0 && (
            <details className="acc" open>
              <summary>Delivery-Reconciler ({report.delivery.length}/{report.harEntries} auffaellig)</summary>
              <div className="acc-body space-y-2">
                {report.delivery.length === 0 && <p className="text-sm text-prime-hi">Alle bezahlten Anfragen wurden mit einem Erfolgscode beantwortet.</p>}
                {report.delivery.map((d, i) => (
                  <div key={i} className="border border-line rounded-lg p-3">
                    <span className="badge badge-red">HTTP {d.status}</span>{' '}
                    <span className="mono text-xs break-all">{d.url}</span>
                    <p className="text-sm mt-1">{d.issue}</p>
                  </div>
                ))}
                <p className="text-xs text-dim">Hinweis: Fuer serverseitige Absicherung beim eigenen Betrieb helfen replaysichere Middleware-Patterns:</p>
                <pre className="mono text-xs bg-obsidian border border-line rounded p-3 overflow-x-auto whitespace-pre">{FIX_SNIPPET}</pre>
                <CopyButton text={FIX_SNIPPET} label="Middleware-Snippet kopieren" compact />
              </div>
            </details>
          )}

          <ExportBar
            onJson={() => downloadJSON({ tool: 'x402-paywallguard', generatedAt: new Date().toISOString(), report }, 'x402-paywallguard-bericht.json')}
            onCsv={() =>
              downloadCSV(
                [
                  ...report.deps.map((d) => ({
                    typ: 'dependency',
                    name: d.name,
                    version: d.version,
                    schwelle: d.advisory.belowVersion,
                    kritikalitaet: d.advisory.severity,
                    id: d.advisory.id,
                  })),
                  ...report.codeFindings.map((f) => ({ typ: 'code-pattern', name: f.rule, version: '', schwelle: '', kritikalitaet: f.severity, id: `Zeile ${f.line}` })),
                  ...report.delivery.map((d) => ({ typ: 'delivery', name: d.url, version: '', schwelle: '', kritikalitaet: 'high', id: `HTTP ${d.status}` })),
                ],
                'x402-paywallguard.csv',
              )
            }
          />
        </StepSection>
      )}
    </div>
  );
}

function radarPoints(n: number, frac: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${110 + Math.cos(a) * 90 * frac},${110 + Math.sin(a) * 90 * frac}`);
  }
  return pts.join(' ');
}

function radarValuePolygon(values: number[]): string {
  const pts: string[] = [];
  values.forEach((v, i) => {
    const a = (i / values.length) * Math.PI * 2 - Math.PI / 2;
    const r = 90 * v;
    pts.push(`${110 + Math.cos(a) * r},${110 + Math.sin(a) * r}`);
  });
  return pts.join(' ');
}
