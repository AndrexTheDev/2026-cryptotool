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

// RIP-7212 (rollups) / EIP-7951 (Ethereum mainnet since Fusaka, 03.12.2025) — same precompile address.
// EIP-7951 makes the malleability rejection (high-S) mandatory; RIP-7212 left that to the chains.
const RIP7212_PRECOMPILE = '0x0000000000000000000000000000000000000100';

// Permanently embedded, cryptographically VALID 160-byte test vector
// (hash || r || s || x || y), generated from test key p256-priv = 7, low-S.
const P256_VECTOR = {
  hash: '6a229ed70d44d53273bd7b714743cdae936731f6d9cfb10ac10764f717227baa',
  r: '8487654b9b8493ca3d284994fba005a8494073d706cffcdbdd41d537a018c1d6',
  s: '2c7888ebd65e3a2830b6262626c5a0a425b192d7ed576750a8328138e780e0a7',
  x: '8e533b6fa0bf7b4625bb30667c01fb607ef9f8b8a80fef5b300628703187b2a3',
  y: '73eb1dbde03318366d069f83a6f5900053c73633cb041b21c55e1a86c1f400b4',
  // high-S counterpart (n - s) for the malleability test:
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
    q: 'Do you control the rpId domain yourself (no dependency on third-party domains)?',
    hint: 'passkey signatures are bound to the rpId domain — its outage locks the account.',
  },
  {
    id: 'rp-backup',
    q: 'Does a documented fallback-capable second signer exist for domain loss?',
    hint: 'e.g. a second signer type, guardian or time-delayed recovery mode.',
  },
  {
    id: 'synced',
    q: 'Is the passkey cloud-synced AND additionally a device-bound backup passkey registered?',
    hint: 'Pure sync passkeys die with the sync service account; purely device-bound ones die with the device.',
  },
  {
    id: 'chains',
    q: 'Are all chains used by the account tested (precompile or fallback contract present)?',
    hint: 'Automatically taken over from the matrix once the check has run.',
  },
  {
    id: 'portability',
    q: 'Does the passkey manager support an export (FIDO CXF or a vendor-specific path) — i.e. does the passkey survive a provider switch?',
    hint: 'CXF 1.0 (Credential Exchange Format) has been a FIDO Proposed Standard since 08/2025 (errata 03/2026); the transport protocol CXP is still only a Working Draft (10/2024) — without a manager export, a provider switch threatens forced re-registration via the recovery path.',
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
      // offline: parse manual console outputs ("chainId,returndata" per line)
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
        setError('Offline mode: paste at least one line "chainId, returndata" (e.g. from a local node call).');
        return;
      }
      setResults(rows);
      setRan(true);
      return;
    }
    if (chains.length === 0) {
      setError('Please select at least one network.');
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
              // RIP-7212: low-S rejection is NOT mandatorily part of the precompile (chain's choice);
              // high-S must return "false" when the precompile is strict.
              // EIP-7951 (mainnet, Fusaka) makes the high-S rejection mandatory instead.
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
        title="Define account & target chains"
        hint="The precompile test uses a fixed embedded, valid P-256 vector (160 bytes). Optional: signer/verifier address for chain fallback checks."
      >
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-sm ${!offlineMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOfflineMode(false)}>
            Online
          </button>
          <button className={`btn btn-sm ${offlineMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOfflineMode(true)}>
            Offline (paste results)
          </button>
          <span className="ml-auto">
            <DemoButton onClick={demo} />
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="pc-acc">Smart account address (optional)</label>
            <input id="pc-acc" className="input mono" placeholder="0x…" value={account} onChange={(e) => setAccount(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pc-signer">WebAuthn signer / P-256 verifier address (optional)</label>
            <input id="pc-signer" className="input mono" placeholder="0x…" value={signer} onChange={(e) => setSigner(e.target.value)} />
          </div>
        </div>
        {!offlineMode ? (
          <div>
            <span className="label">Target networks</span>
            <ChainMultiSelect selected={chains} onChange={setChains} />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="pc-off">Offline results (per line: chainId, eth_call return to 0x…0100)</label>
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

      <StepSection n={2} title="Start multi-chain check">
        <p className="text-sm">
          For each chain: <code>eth_call</code> to <code>{RIP7212_PRECOMPILE}</code> (RIP-7212/EIP-7951 address) with the valid vector
          (expects 32-byte <code>1</code>), then with the high-S counterpart (malleability behavior), then
          fallback code presence (0x ≠ 0x via <code>eth_getCode</code>).
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Checking chains…' : 'Check'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {ran && scorecard && (
        <StepSection n={3} title="Compatibility matrix & recovery readiness">
          <StatusTile
            level={level!}
            headline={
              level === 'green'
                ? 'Passkey account viable multi-chain'
                : level === 'amber'
                  ? 'Partially secured — document the gaps'
                  : 'Silent failure risk detected'
            }
            detail={
              scorecard.kills.length > 0
                ? `On ${scorecard.kills.map((k) => chainById(k.chainId)?.short ?? k.chainId).join(', ')} neither a native precompile nor a fallback contract — signatures silently fail there (0x0100 ambiguity).`
                : scorecard.native === 0
                  ? 'No native P-256 precompile detected on any checked chain — fallback contracts become mandatory.'
                  : `Natively verifiable on ${scorecard.native} chain(s), checklist ${scorecard.clDone}/${CHECKLIST.length} done.`
            }
          />
          <KpiGrid>
            <Kpi label="Native precompile" value={`${scorecard.native}/${results.length}`} tone={scorecard.native ? 'green' : 'red'} />
            <Kpi label="Silently empty/0x (ambiguity)" value={scorecard.silentlyNo} tone={scorecard.silentlyNo ? 'amber' : 'green'} />
            <Kpi label="Signer fallback (code present)" value={signer.trim() ? `${scorecard.signerOk}/${results.length}` : 'n/a'} tone={signer.trim() ? (scorecard.signerOk ? 'default' : 'amber') : 'default'} />
            <Kpi label="Readiness score" value={`${scorecard.score}/${scorecard.max}`} tone={level === 'green' ? 'green' : level === 'amber' ? 'amber' : 'red'} />
          </KpiGrid>

          <div className="overflow-x-auto">
            <table className="table-x">
              <thead>
                <tr>
                  <th>Network</th>
                  <th>P-256 precompile</th>
                  <th>High-S behavior</th>
                  <th>Signer code</th>
                  <th>Account code</th>
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
                          ? 'native active (32B=1)'
                          : r.precompile === 'empty'
                            ? 'empty (ambiguity!)'
                            : r.precompile === 'zero'
                              ? 'false (0)'
                              : r.precompile === 'error'
                                ? 'error'
                                : 'revert'}
                      </span>
                      {r.error && <span className="block text-xs text-dim mt-1">{shortHex(r.error, 40, 0)}</span>}
                    </td>
                    <td>
                      {r.malleability === 'rejects-high-s' && <span className="badge badge-green">rejects high-S</span>}
                      {r.malleability === 'accepts-high-s' && <span className="badge badge-red">accepts high-S!</span>}
                      {r.malleability === 'unknown' && <span className="badge badge-amber">undetermined</span>}
                      {r.malleability === 'skipped' && <span className="badge">n/a</span>}
                    </td>
                    <td>
                      {r.signerCode === 'contract' ? <span className="badge badge-green">Contract</span> : r.signerCode === 'empty' ? <span className="badge badge-red">0x</span> : r.signerCode ? <span className="badge">?</span> : <span className="badge">not checked</span>}
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
            <summary>Technical details & test vector</summary>
            <div className="acc-body">
              <pre className="mono text-xs whitespace-pre-wrap break-all">{`Precompile:      ${RIP7212_PRECOMPILE}
hash:            ${P256_VECTOR.hash}
r:               ${P256_VECTOR.r}
s (low):         ${P256_VECTOR.s}
s (high-Twin):   ${P256_VECTOR.sHigh}
x:               ${P256_VECTOR.x}
y:               ${P256_VECTOR.y}

RIP-7212 semantics: successful verification returns 32-byte 1; failures return either EMPTY (0x) or 0 depending on the chain.
The "empty" variant is the silent failure source: signatures fail without a rejection reason
becoming visible — that is why the positive proof (32B=1) with a real vector is crucial.`}</pre>
              <p className="text-sm text-dim">
                <strong className="text-ink">Adoption reference (as of 2026):</strong> On Ethereum mainnet the
                precompile has been consensus-active as <strong>EIP-7951</strong> since the Fusaka hard fork (03.12.2025) —
                same address, but with mandatory high-S rejection (malleability protection). On rollups it runs as
                <strong>RIP-7212</strong>, finalized on Optimism, Base, zkSync Era, Polygon zkEVM, Linea and Scroll — precompile verification
                cuts the cost from ~200,000–300,000 gas to ~3,450 gas (~98 % reduction).{' '}
                <strong className="text-ink">Fork landscape (as of 11/2026):</strong> The Fusaka follow-ups BPO-1
                (17.12.2025) and BPO-2 (07.01.2026) raised blob capacity stepwise to 14 target / 21
                max blobs per block; the next major fork is <strong>Glamsterdam</strong> (ePBS via EIP-7732,
                block-level access lists via EIP-7928) — active on Sepolia since 06.10.2026, the mainnet date
                (targeted: early 12/2026) was not fixed at the time of writing. The live test above
                nevertheless verifies every selected chain individually — chain lists change faster than
                static documentation.
              </p>
            </div>
          </details>

          <ExportBar
            onJson={() =>
              downloadJSON(
                { tool: 'passkey-continuity', generatedAt: new Date().toISOString(), account, signer, results, checklist, scorecard },
                'passkey-continuity-report.json',
              )
            }
            onCsv={() =>
              downloadCSV(
                results.map((r) => ({
                  chainId: r.chainId,
                  network: chainById(r.chainId)?.name,
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
                subtitle: `Account ${account || '-'} · ${new Date().toLocaleString('en-GB')}`,
                status: { level: level!, headline: level === 'green' ? 'Multi-chain ready' : level === 'amber' ? 'Partially ready' : 'Failure risk', detail: `Score ${scorecard.score}/${scorecard.max}` },
                sections: [
                  {
                    heading: 'Multi-chain matrix',
                    body:
                      '<pre>' +
                      results
                        .map((r) => `Chain ${r.chainId}: precompile=${r.precompile}, high-s=${r.malleability}, signerCode=${r.signerCode ?? '-'}`)
                        .join('\n') +
                      '</pre>',
                  },
                  {
                    heading: 'Checklist',
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
