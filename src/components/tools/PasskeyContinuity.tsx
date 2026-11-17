import { useMemo, useState } from 'react';
import {
  ChainMultiSelect,
  DemoButton,
  ErrorNote,
  ExportBar,
  Kpi,
  KpiGrid,
  StatusTile,
  StepSection,
  type StatusLevel,
} from '../react/ui';
import { ethCall, getCode } from '../../lib/rpc';
import { chainById } from '../../config/chains';
import { downloadCSV, downloadJSON, openPrintableReport } from '../../lib/export';
import { isHexAddress, shortHex } from '../../lib/format';

// RIP-7212 (Rollups) / EIP-7951 (Ethereum Mainnet seit Fusaka, 03.12.2025) — gleiche Precompile-Adresse.
// EIP-7951 spezifiziert die Malleability-Ablehnung (high-S) verbindlich; RIP-7212 ueberlies das den Chains.
const RIP7212_PRECOMPILE = '0x0000000000000000000000000000000000000100';

// Fest eingebetteter, kryptografisch GUELTIGER 160-Byte-Testvektor
// (hash || r || s || x || y), generiert aus Testkey p256-priv = 7, low-S.
const P256_VECTOR = {
  hash: '6a229ed70d44d53273bd7b714743cdae936731f6d9cfb10ac10764f717227baa',
  r: '8487654b9b8493ca3d284994fba005a8494073d706cffcdbdd41d537a018c1d6',
  s: '2c7888ebd65e3a2830b6262626c5a0a425b192d7ed576750a8328138e780e0a7',
  x: '8e533b6fa0bf7b4625bb30667c01fb607ef9f8b8a80fef5b300628703187b2a3',
  y: '73eb1dbde03318366d069f83a6f5900053c73633cb041b21c55e1a86c1f400b4',
  // high-S-Gegenstueck (n - s) fuer den Malleability-Test:
  sHigh: 'd387771329a1c5d8cf49d9d9d93a5f5b973567d5b9c037344b87498a14e244aa',
};

interface ChainResult {
  chainId: number;
  precompile: 'yes' | 'empty' | 'zero' | 'revert' | 'error';
  precompileRaw?: string;
  malleability: 'rejects-high-s' | 'accepts-high-s' | 'unknown' | 'skipped';
  malleabilityRaw?: string;
  signerCode?: 'contract' | 'empty' | 'unknown';
  accountCode?: 'contract' | 'empty' | 'unknown';
  error?: string;
}

function classifyCall(raw: string): ChainResult['precompile'] {
  const v = (raw ?? '').toLowerCase();
  if (v === '0x' || v === '' || v.length < 66) return 'empty';
  const body = v.slice(2);
  if (/^0+$/.test(body)) return 'zero';
  if (/^0+1$/.test(body)) return 'yes';
  return 'zero';
}

const CHECKLIST = [
  {
    id: 'rp-self',
    q: 'Steuern Sie die rpId-Domain selbst (kein Abhaengigkeit von Drittanbieter-Domains)?',
    hint: 'passkey-signaturen sind an die rpId-Domain gebunden — deren Ausfall sperrt das Konto.',
  },
  {
    id: 'rp-backup',
    q: 'Existiert ein dokumentierter fallback-faehiger Zweit-Signer fuer Domain-Verlust?',
    hint: 'z. B. zweiter Signer-Typ, Guardian oder zeitverzoegerter Recovery-Modus.',
  },
  {
    id: 'synced',
    q: 'Ist der Passkey cloud-synchronisiert UND zusaetzlich ein geraetegebundener Backup-Passkey registriert?',
    hint: 'Reine Sync-Passkeys fallen mit dem Konto des Sync-Dienstes; rein geraetegebundene mit dem Geraet.',
  },
  {
    id: 'chains',
    q: 'Sind alle vom Konto genutzten Chains getestet (Precompile oder Fallback-Contract vorhanden)?',
    hint: 'Wird automatisch aus der Matrix uebernommen, sobald die Pruefung gelaufen ist.',
  },
  {
    id: 'portability',
    q: 'Unterstuetzt der Passkey-Manager einen Export (FIDO CXF oder herstellereigenen Weg) — d. h. ueberlebt der Passkey einen Anbieterwechsel?',
    hint: 'CXF 1.0 (Credential Exchange Format) ist seit 08/2025 FIDO Proposed Standard (Errata 03/2026); das Transport-Protokoll CXP ist weiter nur Working Draft (10/2024) — ohne Manager-Export droht bei Anbieterwechsel Zwangs-Neuregistrierung über den Recovery-Pfad.',
  },
];

export default function PasskeyContinuity() {
  const [account, setAccount] = useState('');
  const [signer, setSigner] = useState('');
  const [chains, setChains] = useState<number[]>([1, 8453]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ChainResult[]>([]);
  const [ran, setRan] = useState(false);

  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineRows, setOfflineRows] = useState('');

  const demo = () => {
    setAccount('0x2Df8c99fab9c9fE1CDaDEEf8fD40Bf7C4d0c0001');
    setSigner('');
    setChains([1, 8453, 42161, 10]);
    setChecklist({});
    setError('');
  };

  const run = async () => {
    setError('');
    setResults([]);
    if (offlineMode) {
      // Offline: manuelle Konsolenausgaben parsen ("chainId,returndata" pro Zeile)
      const rows: ChainResult[] = [];
      for (const line of offlineRows.split(/\r?\n/)) {
        const m = line.match(/^\s*(\d+)\s*[,;\s]\s*(0x[0-9a-fA-F]*)/);
        if (m && m[1] !== undefined) {
          const cid = Number(m[1]);
          const raw = m[2] ?? '';
          rows.push({ chainId: cid, precompile: classifyCall(raw), precompileRaw: raw, malleability: 'skipped' });
        }
      }
      if (rows.length === 0) {
        setError('Offline-Modus: mindestens eine Zeile „chainId, returndata“ einfuegen (z. B. aus einem lokalen Node-Call).');
        return;
      }
      setResults(rows);
      setRan(true);
      return;
    }
    if (chains.length === 0) {
      setError('Bitte mindestens ein Netzwerk waehlen.');
      return;
    }
    setBusy(true);
    try {
      const vectorOk = '0x' + P256_VECTOR.hash + P256_VECTOR.r + P256_VECTOR.s + P256_VECTOR.x + P256_VECTOR.y;
      const vectorHighS = '0x' + P256_VECTOR.hash + P256_VECTOR.r + P256_VECTOR.sHigh + P256_VECTOR.x + P256_VECTOR.y;

      const out = await Promise.all(
        chains.map(async (chainId): Promise<ChainResult> => {
          const row: ChainResult = { chainId, precompile: 'error', malleability: 'unknown' };
          try {
            const okRes = await ethCall(chainId, RIP7212_PRECOMPILE, vectorOk);
            row.precompileRaw = okRes.data;
            row.precompile = classifyCall(okRes.data);

            const hsRes = await ethCall(chainId, RIP7212_PRECOMPILE, vectorHighS);
            row.malleabilityRaw = hsRes.data;
            const hs = classifyCall(hsRes.data);
            if (row.precompile === 'yes') {
              // RIP-7212: low-S-Ablehnung ist NICHT zwingend Teil des Precompiles (Chain-Sache);
              // high-S muss "false" liefern, wenn der Precompile strict ist.
              // EIP-7951 (Mainnet, Fusaka) macht die high-S-Ablehnung dagegen verbindlich.
              row.malleability = hs === 'yes' ? 'accepts-high-s' : hs === 'zero' ? 'rejects-high-s' : hs === 'empty' ? 'unknown' : 'unknown';
            } else {
              row.malleability = 'skipped';
            }

            if (signer.trim() && isHexAddress(signer.trim())) {
              const c = await getCode(chainId, signer.trim());
              row.signerCode = c.data && c.data !== '0x' ? 'contract' : 'empty';
            }
            if (account.trim() && isHexAddress(account.trim())) {
              const c = await getCode(chainId, account.trim());
              row.accountCode = c.data && c.data !== '0x' ? 'contract' : 'empty';
            }
          } catch (e) {
            row.error = (e as Error).message;
          }
          return row;
        }),
      );
      setResults(out);
      setRan(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const scorecard = useMemo(() => {
    if (results.length === 0) return null;
    const native = results.filter((r) => r.precompile === 'yes').length;
    const silentlyNo = results.filter((r) => r.precompile === 'empty' || r.precompile === 'zero' || r.precompile === 'revert').length;
    const errored = results.filter((r) => r.precompile === 'error').length;
    const signerOk = results.filter((r) => r.signerCode === 'contract').length;
    const kills = results.filter((r) => r.precompile !== 'yes' && r.precompile !== 'error' && r.signerCode !== 'contract' && !offlineMode);
    const clDone = CHECKLIST.filter((c) => checklist[c.id]).length;
    let score = 0;
    score += native * 2;
    score += signerOk;
    score += clDone;
    const max = results.length * 2 + results.length + CHECKLIST.length;
    return { native, silentlyNo, errored, signerOk, kills, clDone, score, max };
  }, [results, checklist, offlineMode]);

  const level: StatusLevel | null = scorecard
    ? scorecard.kills.length > 0 || scorecard.native === 0
      ? 'red'
      : scorecard.silentlyNo > 0 || scorecard.clDone < CHECKLIST.length
        ? 'amber'
        : 'green'
    : null;

  return (
    <div className="space-y-5">
      <StepSection
        n={1}
        title="Account & Ziel-Chains festlegen"
        hint="Der Precompile-Test nutzt einen fix eingebetteten, gueltigen P-256-Vektor (160 Byte). Optional: Signer-/Verifier-Adresse fuer Chain-Fallback-Pruefung."
      >
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-sm ${!offlineMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOfflineMode(false)}>
            Online
          </button>
          <button className={`btn btn-sm ${offlineMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOfflineMode(true)}>
            Offline (Ergebnisse einfuegen)
          </button>
          <span className="ml-auto">
            <DemoButton onClick={demo} />
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="pc-acc">Smart-Account-Adresse (optional)</label>
            <input id="pc-acc" className="input mono" placeholder="0x…" value={account} onChange={(e) => setAccount(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pc-signer">WebAuthn-Signer / P-256-Verifier-Adresse (optional)</label>
            <input id="pc-signer" className="input mono" placeholder="0x…" value={signer} onChange={(e) => setSigner(e.target.value)} />
          </div>
        </div>
        {!offlineMode ? (
          <div>
            <span className="label">Ziel-Netzwerke</span>
            <ChainMultiSelect selected={chains} onChange={setChains} />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="pc-off">Offline-Ergebnisse (pro Zeile: chainId, eth_call-Return an 0x…0100)</label>
            <textarea
              id="pc-off"
              className="textarea mono"
              rows={4}
              value={offlineRows}
              onChange={(e) => setOfflineRows(e.target.value)}
              placeholder={'8453, 0x0000000000000000000000000000000000000000000000000000000000000001\n1, 0x'}
            />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {CHECKLIST.map((c) => (
            <label key={c.id} className="card p-3 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                checked={!!checklist[c.id]}
                onChange={(e) => setChecklist((m) => ({ ...m, [c.id]: e.target.checked }))}
              />
              <span>
                <span className="text-ink text-sm font-semibold block">{c.q}</span>
                <span className="text-xs text-dim">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </StepSection>

      <StepSection n={2} title="Multi-Chain-Pruefung starten">
        <p className="text-sm">
          Fuer jede Chain: <code>eth_call</code> an <code>{RIP7212_PRECOMPILE}</code> (RIP-7212-/EIP-7951-Adresse) mit dem gueltigen Vektor
          (erwartet 32-Byte <code>1</code>), danach mit dem high-S-Gegenstueck (Malleability-Verhalten), dann
          Fallback-Code-Praesenz (0x ≠ 0x via <code>eth_getCode</code>).
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Pruefe Chains…' : 'Prüfen'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {ran && scorecard && (
        <StepSection n={3} title="Kompatibilitätsmatrix & Recovery-Readiness">
          <StatusTile
            level={level!}
            headline={
              level === 'green'
                ? 'Passkey-Konto multi-chain ueberlebensfaehig'
                : level === 'amber'
                  ? 'Teilweise abgesichert — Luecken dokumentieren'
                  : 'Stilles Ausfallrisiko erkannt'
            }
            detail={
              scorecard.kills.length > 0
                ? `Auf ${scorecard.kills.map((k) => chainById(k.chainId)?.short ?? k.chainId).join(', ')} weder natives Precompile noch Fallback-Contract — Signaturen fallen dort still aus (0x0100-Ambiguitaet).`
                : scorecard.native === 0
                  ? 'Auf keiner geprueften Chain ein natives P-256-Precompile nachgewiesen — Fallback-Contracts werden zwingend.'
                  : `Nativ verifizierbar auf ${scorecard.native} Chain(s), Checklist ${scorecard.clDone}/${CHECKLIST.length} erledigt.`
            }
          />
          <KpiGrid>
            <Kpi label="Natives Precompile" value={`${scorecard.native}/${results.length}`} tone={scorecard.native ? 'green' : 'red'} />
            <Kpi label="Still leer/0x (Ambiguitaet)" value={scorecard.silentlyNo} tone={scorecard.silentlyNo ? 'amber' : 'green'} />
            <Kpi label="Signer-Fallback (Code da)" value={signer.trim() ? `${scorecard.signerOk}/${results.length}` : 'n/a'} tone={signer.trim() ? (scorecard.signerOk ? 'default' : 'amber') : 'default'} />
            <Kpi label="Readiness-Score" value={`${scorecard.score}/${scorecard.max}`} tone={level === 'green' ? 'green' : level === 'amber' ? 'amber' : 'red'} />
          </KpiGrid>

          <div className="overflow-x-auto">
            <table className="table-x">
              <thead>
                <tr>
                  <th>Netzwerk</th>
                  <th>P-256-Precompile</th>
                  <th>High-S-Verhalten</th>
                  <th>Signer-Code</th>
                  <th>Account-Code</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.chainId}>
                    <td>{chainById(r.chainId)?.name ?? `Chain ${r.chainId}`}</td>
                    <td>
                      <span
                        className={`badge ${
                          r.precompile === 'yes' ? 'badge-green' : r.precompile === 'error' ? 'badge-red' : 'badge-amber'
                        }`}
                      >
                        {r.precompile === 'yes'
                          ? 'nativ aktiv (32B=1)'
                          : r.precompile === 'empty'
                            ? 'leer (Ambiguitaet!)'
                            : r.precompile === 'zero'
                              ? 'false (0)'
                              : r.precompile === 'error'
                                ? 'Fehler'
                                : 'revert'}
                      </span>
                      {r.error && <span className="block text-xs text-dim mt-1">{shortHex(r.error, 40, 0)}</span>}
                    </td>
                    <td>
                      {r.malleability === 'rejects-high-s' && <span className="badge badge-green">lehnt high-S ab</span>}
                      {r.malleability === 'accepts-high-s' && <span className="badge badge-red">akzeptiert high-S!</span>}
                      {r.malleability === 'unknown' && <span className="badge badge-amber">unbestimmt</span>}
                      {r.malleability === 'skipped' && <span className="badge">n/a</span>}
                    </td>
                    <td>
                      {r.signerCode === 'contract' ? <span className="badge badge-green">Contract</span> : r.signerCode === 'empty' ? <span className="badge badge-red">0x</span> : r.signerCode ? <span className="badge">?</span> : <span className="badge">nicht geprueft</span>}
                    </td>
                    <td>
                      {r.accountCode === 'contract' ? <span className="badge badge-green">Contract</span> : r.accountCode === 'empty' ? <span className="badge badge-amber">0x</span> : r.accountCode ? <span className="badge">?</span> : <span className="badge">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="acc">
            <summary>Technische Details & Testvektor</summary>
            <div className="acc-body">
              <pre className="mono text-xs whitespace-pre-wrap break-all">{`Precompile:      ${RIP7212_PRECOMPILE}
hash:            ${P256_VECTOR.hash}
r:               ${P256_VECTOR.r}
s (low):         ${P256_VECTOR.s}
s (high-Twin):   ${P256_VECTOR.sHigh}
x:               ${P256_VECTOR.x}
y:               ${P256_VECTOR.y}

RIP-7212-Semantik: erfolgreiche Verifikation liefert 32-Byte 1; Fehler liefern je nach Chain LEER (0x) oder 0.
Die "leere" Variante ist die still-fehlerquelle: Signaturen schlagen fehl, ohne dass ein Ablehnungsgrund
sichtbar wird — Deshalb ist der positive Nachweis (32B=1) mit echtem Vektor entscheidend.`}</pre>
              <p className="text-sm text-dim">
                <strong className="text-ink">Adoptions-Referenz (Stand 2026):</strong> Auf dem Ethereum-Mainnet ist der
                Precompile seit dem Fusaka-Hardfork (03.12.2025) als <strong>EIP-7951</strong> konsensfaegig aktiv —
                selbe Adresse, aber mit verbindlicher high-S-Ablehnung (Malleability-Schutz). Auf Rollups laeuft er als
                <strong>RIP-7212</strong> finalisiert auf Optimism, Base, zkSync Era, Polygon zkEVM, Linea und Scroll — die Precompile-Verifikation
                zieht die Kosten von ~200.000–300.000 Gas auf ~3.450 Gas (~98 % Reduktion).{' '}
                <strong className="text-ink">Fork-Landschaft (Stand 11/2026):</strong> Die Fusaka-Nachzuegler BPO-1
                (17.12.2025) und BPO-2 (07.01.2026) hoben die Blob-Kapazitaet schrittweise auf 14 Ziel- / 21
                Max-Blobs pro Block; naechster grosser Fork ist <strong>Glamsterdam</strong> (ePBS via EIP-7732,
                Block-Level Access Lists via EIP-7928) — seit 06.10.2026 auf Sepolia aktiv, Mainnet-Termin
                (angestrebt: Anfang 12/2026) zum Zeitpunkt dieses Textes noch nicht fixiert. Der Live-Test oben
                verifiziert jede ausgewaehlte Chain dennoch individuell — Chain-Listen alterieren schneller als
                statische Dokumentation.
              </p>
            </div>
          </details>

          <ExportBar
            onJson={() =>
              downloadJSON(
                { tool: 'passkey-continuity', generatedAt: new Date().toISOString(), account, signer, results, checklist, scorecard },
                'passkey-continuity-bericht.json',
              )
            }
            onCsv={() =>
              downloadCSV(
                results.map((r) => ({
                  chainId: r.chainId,
                  netzwerk: chainById(r.chainId)?.name,
                  precompile: r.precompile,
                  high_s: r.malleability,
                  signer_code: r.signerCode ?? '',
                  account_code: r.accountCode ?? '',
                })),
                'passkey-continuity-matrix.csv',
              )
            }
            onPrint={() =>
              openPrintableReport({
                title: 'Passkey-Continuity Scorecard',
                subtitle: `Account ${account || '-'} · ${new Date().toLocaleString('de-DE')}`,
                status: { level: level!, headline: level === 'green' ? 'Multi-chain bereit' : level === 'amber' ? 'Teilweise bereit' : 'Ausfallrisiko', detail: `Score ${scorecard.score}/${scorecard.max}` },
                sections: [
                  {
                    heading: 'Multi-Chain-Matrix',
                    body:
                      '<pre>' +
                      results
                        .map((r) => `Chain ${r.chainId}: precompile=${r.precompile}, high-s=${r.malleability}, signerCode=${r.signerCode ?? '-'}`)
                        .join('\n') +
                      '</pre>',
                  },
                  {
                    heading: 'Checkliste',
                    body: '<ul>' + CHECKLIST.map((c) => `<li>[${checklist[c.id] ? 'x' : ' '}] ${c.q}</li>`).join('') + '</ul>',
                  },
                ],
              })
            }
          />
        </StepSection>
      )}
    </div>
  );
}
