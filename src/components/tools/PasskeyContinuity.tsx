import { useMemo, useState } from 'react';
import {
  ChainMultiSelect,
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
  source?: 'user' | 'wallet' | 'public' | 'cache' | undefined;
  at?: number | undefined;
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
    q: 'Do you control the website domain tied to your passkey (or can you recover without it)?',
    hint: 'Passkeys are tied to a website domain (rpId). If that company shuts down its domain, you could get locked out unless you have a backup.',
  },
  {
    id: 'rp-backup',
    q: 'Do you have a second backup login or recovery guardian set up?',
    hint: 'For example, a hardware wallet signer, a trusted guardian, or a time-delayed recovery path.',
  },
  {
    id: 'synced',
    q: 'Do you have BOTH a cloud-synced passkey (iCloud/Google) AND a separate device passkey?',
    hint: 'If you lose your cloud account, the separate device passkey saves you—and vice versa if you lose your phone.',
  },
  {
    id: 'chains',
    q: 'Did you test every blockchain where you hold funds?',
    hint: 'Check the table below after running the test to make sure every network you use shows green.',
  },
  {
    id: 'portability',
    q: 'Can your passkey manager export your passkey (FIDO CXF or vendor export) if you switch apps?',
    hint: 'CXF 1.0 (Credential Exchange Format) has been a FIDO Proposed Standard since 08/2025 (errata 03/2026), while CXP transport is still a Working Draft (10/2024)—without export support, switching password managers means re-registering via recovery.',
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
            row.source = okRes.source;
            row.at = okRes.at;

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
        title="Pick your networks &amp; fill out the backup checklist"
        hint="We send a safe 160-byte P-256 test signature to each network to see if passkeys (FaceID / TouchID) work there. Wallet addresses are optional."
      >
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-sm ${!offlineMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOfflineMode(false)}>
            Online (live networks)
          </button>
          <button className={`btn btn-sm ${offlineMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOfflineMode(true)}>
            Offline (paste raw results)
          </button>
          <span className="ml-auto">
            <DemoButton onClick={demo} />
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="pc-acc">Your smart-wallet address (optional)</label>
            <input id="pc-acc" className="input mono" placeholder="0x…" value={account} onChange={(e) => setAccount(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pc-signer">Backup passkey verifier contract (optional)</label>
            <input id="pc-signer" className="input mono" placeholder="0x…" value={signer} onChange={(e) => setSigner(e.target.value)} />
          </div>
        </div>
        {!offlineMode ? (
          <div>
            <span className="label">Networks where you want to use your passkey wallet</span>
            <ChainMultiSelect selected={chains} onChange={setChains} />
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="pc-off">Offline results (one per line: chainId, hex output from 0x…0100)</label>
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

      <StepSection n={2} title="Test passkey support across chains">
        <p className="text-sm">
          Tests each chosen blockchain at the standard passkey verifier address (<code>{RIP7212_PRECOMPILE}</code>) using
          a valid test signature, checks whether strict anti-tampering (high-S rejection) is enabled, and checks if your
          backup verifier contract exists there.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Testing chains…' : 'Check chains'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {ran && scorecard && (
        <StepSection n={3} title="Passkey compatibility &amp; backup score">
          <StatusTile
            level={level!}
            headline={
              level === 'green'
                ? 'Your passkey wallet works safely across these networks'
                : level === 'amber'
                  ? 'Mostly ready — check the remaining backup gaps'
                  : 'Warning: passkey logins could silently fail on some chains'
            }
            detail={
              scorecard.kills.length > 0
                ? `On ${scorecard.kills.map((k) => chainById(k.chainId)?.short ?? k.chainId).join(', ')}, there is neither built-in passkey support nor a backup verifier contract—transactions could fail silently there.`
                : scorecard.native === 0
                  ? 'None of the checked chains returned built-in passkey support—you will need a backup verifier contract.'
                  : `Built-in passkey support active on ${scorecard.native} chain(s); backup checklist ${scorecard.clDone}/${CHECKLIST.length} completed.`
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
                    <td>
                      {chainById(r.chainId)?.name ?? `Chain ${r.chainId}`}
                      <div className="mt-1">
                        <SourceBadge source={r.source} at={r.at} />
                      </div>
                    </td>
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
                block-level access lists via EIP-7928) — active on Sepolia since 06.10.2026; the Hoodi testnet
                fork (planned for 26.10.2026) was postponed on 22.10.2026 after a ChainSecurity audit found that the
                EIP-8037 gas repricing can lock mainnet contracts into failure states (13 documented real-world cases) —
                no new date, so the floated December mainnet candidates lapsed; no mainnet date is fixed (EIP-7773
                leaves it open). The live test above
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
