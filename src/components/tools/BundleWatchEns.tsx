import { useMemo, useState } from 'react';
import {
  CopyButton,
  DemoButton,
  ErrorNote,
  ExportBar,
  FileDrop,
  Kpi,
  KpiGrid,
  SourceBadge,
  StatusTile,
  StepSection,
  type StatusLevel,
} from '../react/ui';
import { decodeContenthash, ipfsGatewayUrl } from '../../lib/contenthash';
import { checkGovernance, resolveEns, sha256Hex, type EnsResolution, type GovernanceResult } from '../../lib/ens';
import { downloadJSON, openPrintableReport } from '../../lib/export';
import { shortHex } from '../../lib/format';

interface LiveAsset {
  url: string;
  hash?: string; // sha256 computed by the bookmarklet
  kind?: string;
}

interface RefAsset {
  path: string;
  sha256: string;
  size: number;
  text?: string;
}

interface Compare {
  matched: { url: string; ref: string; ok: boolean }[];
  newInLive: string[];
  missingInLive: string[];
  newDomains: string[];
  newAddresses: string[];
}

// console snippet (run in the live tab of the dApp). Uses crypto.subtle in the page context — HTTPS required.
const BOOKMARKLET = `(async()=>{const u=[];const h=async t=>{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')};for(const s of document.querySelectorAll('script[src]')){try{const r=await fetch(s.src,{cache:'no-store'});const t=await r.text();u.push({url:s.src,hash:await h(t),kind:'script'})}catch(e){u.push({url:s.src,kind:'script',error:'fetch-failed'})}}for(const l of document.querySelectorAll('link[rel=stylesheet]')){try{const r=await fetch(l.href,{cache:'no-store'});const t=await r.text();u.push({url:l.href,hash:await h(t),kind:'css'})}catch(e){u.push({url:l.href,kind:'css',error:'fetch-failed'})}}const blob=new Blob([JSON.stringify({origin:location.origin,ts:new Date().toISOString(),assets:u},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='live-bundle-'+location.hostname+'.json';a.click()})()`;

const DEMO_LIVE = JSON.stringify(
  {
    origin: 'https://app.demo-dapp.example',
    ts: '2026-11-14T22:00:00Z',
    assets: [
      { url: 'https://app.demo-dapp.example/assets/index-8f2ca1.js', hash: 'aa00'.repeat(8), kind: 'script' },
      { url: 'https://app.demo-dapp.example/assets/index-8f2ca1.css', hash: 'ff11'.repeat(8), kind: 'css' },
      { url: 'https://cdn.evil-inject.example/track.js', hash: 'deed'.repeat(8), kind: 'script' },
    ],
  },
  null,
  2,
);

const DEMO_REF = JSON.stringify(
  {
    note: 'reference manifest (from release archive or IPFS state)',
    files: [
      { path: 'assets/index-8f2ca1.js', sha256: 'aa00'.repeat(8), size: 512345 },
      { path: 'assets/index-8f2ca1.css', sha256: 'ff11'.repeat(8), size: 42310 },
    ],
    domains: ['app.demo-dapp.example'],
  },
  null,
  2,
);

function extractDomains(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)) { const h = m[1]; if (h) found.add(h.toLowerCase()); }
  return [...found];
}

function extractAddresses(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/0x[0-9a-fA-F]{40}/g)) found.add(m[0].toLowerCase());
  return [...found];
}

export default function BundleWatchEns() {
  const [ensName, setEnsName] = useState('');
  const [manualCh, setManualCh] = useState('');
  const [liveData, setLiveData] = useState('');
  const [refManifest, setRefManifest] = useState('');
  const [ghRepo, setGhRepo] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ens, setEns] = useState<EnsResolution | null>(null);
  const [gov, setGov] = useState<GovernanceResult | null>(null);
  const [cid, setCid] = useState<{ kind: string; cid: string } | null>(null);
  const [refAssets, setRefAssets] = useState<RefAsset[]>([]);
  const [refNote, setRefNote] = useState('');
  const [refLiveAt, setRefLiveAt] = useState<number | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);

  const demo = () => {
    setEnsName('app.demo-dapp.example');
    setManualCh('0xe3010170122029f2d17be6139079dc48696d1f582a13a5d55952b3bddd83a632a1c3c09a9b1e');
    setLiveData(DEMO_LIVE);
    setRefManifest(DEMO_REF);
    setGhRepo('');
    setError('');
  };

  const run = async () => {
    setError('');
    setEns(null);
    setGov(null);
    setCid(null);
    setCompare(null);
    setRefAssets([]);
    setRefNote('');
    setBusy(true);
    try {
      // 1) ENS + contenthash
      let contenthash = manualCh.trim();
      if (!contenthash) {
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/i.test(ensName.trim())) {
          throw new Error('Provide an ENS name (name.eth) or paste the contenthash manually (offline mode).');
        }
        const r = await resolveEns(ensName.trim());
        setEns(r);
        if (r.contenthash) contenthash = r.contenthash;
        if (r.owner) {
          try {
            setGov(await checkGovernance(r.owner));
          } catch (e) {
            setGov({ owner: r.owner, kind: 'unknown', detail: (e as Error).message });
          }
        }
        if (r.error) setRefNote(r.error);
      }
      let decoded: { kind: string; cid: string } | null = null;
      if (contenthash) {
        const d = decodeContenthash(contenthash);
        if (d.kind !== 'unknown') decoded = { kind: d.kind, cid: d.cid };
        setCid(decoded);
      }

      // 2) reference state: uploaded archive or manifest or IPFS
      let refs: RefAsset[] = [];
      const manifest = refManifest.trim();
      if (manifest) {
        const j = JSON.parse(manifest) as { files?: RefAsset[] };
        refs = (j.files ?? []).map((f) => ({ path: f.path, sha256: f.sha256.toLowerCase(), size: Number(f.size ?? 0) }));
        setRefNote('Reference: manually pasted manifest.');
      } else if (decoded && decoded.kind === 'ipfs') {
        try {
          const res = await fetch(ipfsGatewayUrl(decoded.cid), { cache: 'no-store' });
          if (res.ok) {
            const text = await res.text();
            const entry: RefAsset = { path: 'index.html', sha256: await sha256Hex(text), size: new TextEncoder().encode(text).length, text };
            refs = [entry];
            setRefNote('Reference: IPFS index loaded directly from the browser.');
            setRefLiveAt(Date.now());
          } else {
            setRefNote(`IPFS fetch HTTP ${res.status} — please paste the release archive or manifest manually.`);
          }
        } catch {
          setRefNote('IPFS fetch blocked/throttled — please paste the release archive or manifest manually.');
        }
      } else if (ghRepo.trim()) {
        setRefNote('Repository comparison is source-sensitive: please download the release archive locally and paste it as manifest/ZIP (the suite uploads nothing).');
      }

      // 3) parse the live bundle
      let live: LiveAsset[] = [];
      const lv = liveData.trim();
      if (lv) {
        try {
          const j = JSON.parse(lv) as { assets?: LiveAsset[] };
          live = j.assets ?? [];
        } catch {
          // HAR format?
          const j = JSON.parse(lv) as { log?: { entries?: { request: { url: string } }[] } };
          live = (j.log?.entries ?? []).map((e) => ({ url: e.request.url, kind: e.request.url.match(/\.js(\?|$)/) ? 'script' : e.request.url.match(/\.css(\?|$)/) ? 'css' : 'other' }));
        }
      }
      if (live.length === 0) throw new Error('No live assets: paste bookmarklet JSON, HAR or a manual list.');
      if (refs.length === 0) throw new Error('No reference assets: paste a manifest/archive or provide an ENS/IPFS reference.' + (refNote ? ` (${refNote})` : ''));

      // 4) reconciliation: hash matching per basename
      const base = (u: string) => {
        try {
          return new URL(u).pathname.split('/').pop() ?? u;
        } catch {
          return u.split('/').pop() ?? u;
        }
      };
      const matched: Compare['matched'] = [];
      const refUsed = new Set<string>();
      for (const a of live) {
        const b = base(a.url);
        const ref = refs.find((r) => base(r.path) === b);
        if (ref) {
          refUsed.add(ref.path);
          matched.push({ url: a.url, ref: ref.path, ok: a.hash ? a.hash.toLowerCase() === ref.sha256 : false });
        } else {
          matched.push({ url: a.url, ref: '', ok: false });
        }
      }
      const newInLive = live.filter((a) => !refs.some((r) => base(r.path) === base(a.url))).map((a) => a.url);
      const missingInLive = refs.filter((r) => ![...refUsed].includes(r.path)).map((r) => r.path);

      // domain and address diff
      const refText = refs.map((r) => r.text ?? '').join('\n') + ' ' + refs.map((r) => r.path).join(' ');
      const liveText = live.map((l) => l.url).join('\n');
      const refDomains = new Set(extractDomains(refText + ' ' + refManifest));
      const newDomains = extractDomains(liveText).filter((d) => !refDomains.has(d));
      const refAddrs = new Set(extractAddresses(refText));
      const newAddresses = extractAddresses(liveText).filter((a) => !refAddrs.has(a));

      setRefAssets(refs);
      setCompare({ matched, newInLive, missingInLive, newDomains, newAddresses });
    } catch (e) {
      setError((e as Error).message + ' — offline paths: paste the contenthash manually, upload a reference manifest.');
    } finally {
      setBusy(false);
    }
  };

  const mismatchCount = useMemo(() => compare?.matched.filter((m) => m.ref && !m.ok).length ?? 0, [compare]);

  const level: StatusLevel | null = compare
    ? mismatchCount > 0 || (compare?.newDomains.length ?? 0) > 0 || (compare?.newInLive.length ?? 0) > 0
      ? 'red'
      : gov?.kind === 'eoa'
        ? 'amber'
        : 'green'
    : null;

  return (
    <div className="space-y-5">
      <StepSection n={1} title="ENS name & live data" hint="ENS name resolution (contenthash, EIP-1577) online — or paste the contenthash manually in offline mode. Live data via bookmarklet, HAR or a manual list.">
        <div className="flex flex-wrap gap-2 items-center">
          <DemoButton onClick={demo} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(BOOKMARKLET);
              } catch {
                /* noop */
              }
            }}
          >
            📋 Copy bookmarklet
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="bw-ens">ENS name</label>
            <input id="bw-ens" className="input mono" placeholder="app.example.eth" value={ensName} onChange={(e) => setEnsName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="bw-ch">contenthash (offline, optional override)</label>
            <input id="bw-ch" className="input mono" placeholder="0xe30101…" value={manualCh} onChange={(e) => setManualCh(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="bw-live">Live bundle data (bookmarklet JSON / HAR / list)</label>
          <textarea id="bw-live" className="textarea mono" rows={6} value={liveData} onChange={(e) => setLiveData(e.target.value)} placeholder='{"origin":"https://app…","assets":[{"url":"…","hash":"sha256…"}]}' />
          <FileDrop label="Drop bookmarklet JSON or HAR" accept=".json,.har" onFile={(c) => setLiveData(c)} />
        </div>
        <div>
          <label className="label" htmlFor="bw-ref">Reference manifest (JSON, files: path/sha256) or release archive notes</label>
          <textarea id="bw-ref" className="textarea mono" rows={5} value={refManifest} onChange={(e) => setRefManifest(e.target.value)} placeholder='{"files":[{"path":"assets/index-ab12cd.js","sha256":"…","size":12345}]}' />
        </div>
        <div>
          <label className="label" htmlFor="bw-gh">Repository (owner/repo, optional — note: local download expected)</label>
          <input id="bw-gh" className="input mono" placeholder="org/project" value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} />
        </div>
      </StepSection>

      <StepSection n={2} title="Start integrity check">
        <p className="text-sm">
          Reads the ENS owner + contenthash (EIP-1577), decodes the IPFS/IPNS reference, computes SHA-256 comparisons
          and highlights new domains or contract addresses in the live bundle.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Checking…' : 'Check'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {compare && (
        <StepSection n={3} title="External integrity report">
          <StatusTile
            level={level!}
            headline={
              level === 'red'
                ? 'Live bundle deviates from the reference'
                : level === 'amber'
                  ? 'Hashes consistent — but ENS governance is critical'
                  : 'Live bundle matches the reference'
            }
            detail={
              mismatchCount > 0
                ? `${mismatchCount} file(s) with a diverging hash. ${compare.newInLive.length} file(s) without a reference counterpart.`
                : gov?.kind === 'eoa'
                  ? 'All hashes match; however, a single EOA controls the ENS name (takeover risk).'
                  : 'Hash and domain comparison without findings.'
            }
          />
          <KpiGrid>
            <Kpi label="Reconciled files" value={compare.matched.filter((m) => m.ref).length} />
            <Kpi label="Hash deviations" value={mismatchCount} tone={mismatchCount ? 'red' : 'green'} />
            <Kpi label="New files live" value={compare.newInLive.length} tone={compare.newInLive.length ? 'amber' : 'green'} />
            <Kpi label="New domains live" value={compare.newDomains.length} tone={compare.newDomains.length ? 'red' : 'green'} />
          </KpiGrid>

          {gov && (
            <details className="acc" open>
              <summary>Governance traffic light (ENS control)</summary>
              <div className="acc-body space-y-2">
                <p className="text-xs text-dim">
                  ENSv2 note: resolution runs via the DAO-owned universal resolver proxy
                  (0xeEeEEEeE…E144EeEe) — the ENS DAO is migrating registries step by step under ENSv2
                  (Sepolia since 08/2026, mainnet upon activation); the query stays compatible because the
                  proxy is updated by the DAO.
                </p>
                <p>
                  Owner: <code className="mono text-xs break-all">{gov.owner}</code>{' '}
                  <span className={`badge ${gov.kind === 'multisig-contract' ? 'badge-green' : gov.kind === 'eoa' ? 'badge-red' : 'badge-amber'}`}>
                    {gov.kind === 'multisig-contract' ? `Multisig (${gov.ownerCount} owners)` : gov.kind === 'eoa' ? 'Single EOA' : gov.kind}
                  </span>
                </p>
                <p className="text-sm">{gov.detail}</p>
                {cid && (
                  <p className="text-sm">
                    contenthash: <span className="mono text-xs">{cid.kind}</span> → <code className="mono text-xs break-all">{cid.cid}</code>
                    {cid.kind === 'ipns' && <span className="badge badge-amber ml-2">IPNS: mutable — extra caution</span>}
                  </p>
                )}
                {ens?.resolverAddress && <p className="text-xs text-dim">Resolver: <code className="mono">{ens.resolverAddress}</code></p>}
              </div>
            </details>
          )}

          <details className="acc" open>
            <summary>Script hash comparison</summary>
            <div className="acc-body overflow-x-auto">
              <table className="table-x">
                <thead>
                  <tr>
                    <th>Live asset</th>
                    <th>Reference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.matched.map((m, i) => (
                    <tr key={i}>
                      <td className="mono text-xs break-all">{shortHex(m.url, 52, 14)}</td>
                      <td className="mono text-xs">{m.ref || <span className="badge badge-amber">no reference</span>}</td>
                      <td>{m.ref ? (m.ok ? <span className="badge badge-green">identical</span> : <span className="badge badge-red">hash diverges</span>) : <span className="badge badge-amber">new live</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {compare.missingInLive.length > 0 && (
                <p className="text-xs text-dim mt-2">In the reference but not found live: {compare.missingInLive.join(', ')}</p>
              )}
            </div>
          </details>

          {(compare.newDomains.length > 0 || compare.newAddresses.length > 0) && (
            <details className="acc" open>
              <summary>New domains / addresses in the live bundle</summary>
              <div className="acc-body">
                {compare.newDomains.length > 0 && (
                  <p className="text-sm">
                    <span className="badge badge-red">Domains</span>{' '}
                    {compare.newDomains.map((d) => (
                      <code key={d} className="mono text-xs mr-2">{d}</code>
                    ))}
                  </p>
                )}
                {compare.newAddresses.length > 0 && (
                  <p className="text-sm mt-2">
                    <span className="badge badge-amber">Contract addresses</span>{' '}
                    {compare.newAddresses.map((d) => (
                      <code key={d} className="mono text-xs mr-2">{shortHex(d, 10, 6)}</code>
                    ))}
                  </p>
                )}
              </div>
            </details>
          )}

          {refNote && (
            <p className="text-xs text-dim">
              {refNote} {refLiveAt && <SourceBadge source="gateway" at={refLiveAt} />}
            </p>
          )}

          <ExportBar
            onJson={() =>
              downloadJSON(
                { tool: 'bundlewatch-ens', generatedAt: new Date().toISOString(), ens, gov, cid, referenceAssets: refAssets.map((r) => ({ ...r, text: undefined })), compare },
                'bundlewatch-ens-report.json',
              )
            }
            onPrint={() =>
              openPrintableReport({
                title: 'BundleWatch-ENS integrity report',
                subtitle: `${ensName || manualCh.slice(0, 18) + '…'} · ${new Date().toLocaleString('en-GB')}`,
                status: { level: level!, headline: level === 'red' ? 'Deviations found' : level === 'amber' ? 'Governance risk' : 'Integrity confirmed', detail: gov?.detail },
                sections: [
                  { heading: 'Governance', body: `<pre>Owner: ${gov?.owner ?? '-'}\nTyp: ${gov?.kind ?? '-'}\ncontenthash: ${cid ? cid.kind + ' ' + cid.cid : '-'}</pre>` },
                  {
                    heading: 'Hash comparison',
                    body: '<table border="1" cellspacing="0" cellpadding="6">' + compare.matched.map((m) => `<tr><td>${m.url}</td><td>${m.ref || '—'}</td><td>${m.ref ? (m.ok ? 'identical' : 'DEVIATION') : 'new live'}</td></tr>`).join('') + '</table>',
                  },
                  { heading: 'New domains', body: '<p>' + (compare.newDomains.join(', ') || 'none') + '</p>' },
                ],
              })
            }
          />
        </StepSection>
      )}

      <details className="acc">
        <summary>Console snippet (run in the target tab, collects script hashes)</summary>
        <div className="acc-body">
          <p className="text-sm text-dim">Copy this line into the console of the dApp's live tab — it hashes all loaded scripts locally and downloads a JSON file:</p>
          <pre className="mono text-xs bg-obsidian border border-line rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{BOOKMARKLET}</pre>
          <CopyButton text={BOOKMARKLET} label="Copy snippet" compact />
        </div>
      </details>
    </div>
  );
}
