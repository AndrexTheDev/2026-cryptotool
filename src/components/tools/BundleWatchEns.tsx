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
import { decodeContenthash, ipfsGatewayUrl } from '../../lib/contenthash';
import { checkGovernance, resolveEns, sha256Hex, type EnsResolution, type GovernanceResult } from '../../lib/ens';
import { downloadJSON, openPrintableReport } from '../../lib/export';
import { shortHex } from '../../lib/format';

interface LiveAsset {
  url: string;
  hash?: string; // sha256 vom Bookmarklet berechnet
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

// Konsolen-Snippet (im Live-Tab der dApp ausfuehren). Nutzt crypto.subtle im Seitenkontext — HTTPS erforderlich.
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
    note: 'Referenz-Manifest (aus Release-Archiv oder IPFS-Stand)',
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
  for (const m of text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)) found.add(m[1].toLowerCase());
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
          throw new Error('ENS-Namen angeben (name.eth) oder contenthash manuell einfuegen (Offline-Modus).');
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

      // 2) Referenz-Stand: hochgeladenes Archiv oder Manifest oder IPFS
      let refs: RefAsset[] = [];
      const manifest = refManifest.trim();
      if (manifest) {
        const j = JSON.parse(manifest) as { files?: RefAsset[] };
        refs = (j.files ?? []).map((f) => ({ path: f.path, sha256: f.sha256.toLowerCase(), size: Number(f.size ?? 0) }));
        setRefNote('Referenz: manuell eingefuegtes Manifest.');
      } else if (decoded && decoded.kind === 'ipfs') {
        try {
          const res = await fetch(ipfsGatewayUrl(decoded.cid), { cache: 'no-store' });
          if (res.ok) {
            const text = await res.text();
            const entry: RefAsset = { path: 'index.html', sha256: await sha256Hex(text), size: new TextEncoder().encode(text).length, text };
            refs = [entry];
            setRefNote('Referenz: IPFS-Index direkt aus dem Browser geladen.');
          } else {
            setRefNote(`IPFS-Abruf HTTP ${res.status} — bitte Release-Archiv oder Manifest manuell einfuegen.`);
          }
        } catch {
          setRefNote('IPFS-Abruf blockiert/gedrosselt — bitte Release-Archiv oder Manifest manuell einfuegen.');
        }
      } else if (ghRepo.trim()) {
        setRefNote('Repository-Abgleich ist quellensensibel: bitte Release-Archiv lokal herunterladen und als Manifest/ZIP einfuegen (die Suite laedt nichts hoch).');
      }

      // 3) Live-Bundle parsen
      let live: LiveAsset[] = [];
      const lv = liveData.trim();
      if (lv) {
        try {
          const j = JSON.parse(lv) as { assets?: LiveAsset[] };
          live = j.assets ?? [];
        } catch {
          // HAR-Format?
          const j = JSON.parse(lv) as { log?: { entries?: { request: { url: string } }[] } };
          live = (j.log?.entries ?? []).map((e) => ({ url: e.request.url, kind: e.request.url.match(/\.js(\?|$)/) ? 'script' : e.request.url.match(/\.css(\?|$)/) ? 'css' : 'other' }));
        }
      }
      if (live.length === 0) throw new Error('Keine Live-Assets: Bookmarklet-JSON, HAR oder manuelle Liste einfuegen.');
      if (refs.length === 0) throw new Error('Keine Referenz-Assets: Manifest/Archiv einfuegen oder ENS/IPFS-Bezug angeben.' + (refNote ? ` (${refNote})` : ''));

      // 4) Abgleich: Hash-Matching per Basename
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

      // Domain- und Adress-Diff
      const refText = refs.map((r) => r.text ?? '').join('\n') + ' ' + refs.map((r) => r.path).join(' ');
      const liveText = live.map((l) => l.url).join('\n');
      const refDomains = new Set(extractDomains(refText + ' ' + refManifest));
      const newDomains = extractDomains(liveText).filter((d) => !refDomains.has(d));
      const refAddrs = new Set(extractAddresses(refText));
      const newAddresses = extractAddresses(liveText).filter((a) => !refAddrs.has(a));

      setRefAssets(refs);
      setCompare({ matched, newInLive, missingInLive, newDomains, newAddresses });
    } catch (e) {
      setError((e as Error).message + ' — Offline-Pfade: contenthash manuell einfuegen, Referenz-Manifest hochladen.');
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
      <StepSection n={1} title="ENS-Name & Live-Daten" hint="ENS-Name Aufloesung (contenthash, EIP-1577) online — oder contenthash im Offline-Modus manuell einfuegen. Live-Daten via Bookmarklet, HAR oder manueller Liste.">
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
            📋 Bookmarklet kopieren
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="bw-ens">ENS-Name</label>
            <input id="bw-ens" className="input mono" placeholder="app.beispiel.eth" value={ensName} onChange={(e) => setEnsName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="bw-ch">contenthash (offline, optional Override)</label>
            <input id="bw-ch" className="input mono" placeholder="0xe30101…" value={manualCh} onChange={(e) => setManualCh(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="bw-live">Live-Bundle-Daten (Bookmarklet-JSON / HAR / Liste)</label>
          <textarea id="bw-live" className="textarea mono" rows={6} value={liveData} onChange={(e) => setLiveData(e.target.value)} placeholder='{"origin":"https://app…","assets":[{"url":"…","hash":"sha256…"}]}' />
          <FileDrop label="Bookmarklet-JSON oder HAR ablegen" accept=".json,.har" onFile={(c) => setLiveData(c)} />
        </div>
        <div>
          <label className="label" htmlFor="bw-ref">Referenz-Manifest (JSON, files: path/sha256) oder Release-Archiv-Notizen</label>
          <textarea id="bw-ref" className="textarea mono" rows={5} value={refManifest} onChange={(e) => setRefManifest(e.target.value)} placeholder='{"files":[{"path":"assets/index-ab12cd.js","sha256":"…","size":12345}]}' />
        </div>
        <div>
          <label className="label" htmlFor="bw-gh">Repository (owner/repo, optional — Hinweis: lokaler Download erwartet)</label>
          <input id="bw-gh" className="input mono" placeholder="orga/projekt" value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} />
        </div>
      </StepSection>

      <StepSection n={2} title="Integritätsprüfung starten">
        <p className="text-sm">
          Liest ENS-Owner + contenthash (EIP-1577), dekodiert IPFS/IPNS-Referenz, berechnet SHA-256-Vergleiche und
          hebt neue Domains oder Vertragsadressen im Live-Bundle hervor.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void run()} disabled={busy}>
          {busy ? 'Pruefe…' : 'Prüfen'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {compare && (
        <StepSection n={3} title="Externer Integritätsbericht">
          <StatusTile
            level={level!}
            headline={
              level === 'red'
                ? 'Live-Bundle weicht von Referenz ab'
                : level === 'amber'
                  ? 'Hashes konsistent — aber ENS-Governance kritisch'
                  : 'Live-Bundle entspricht der Referenz'
            }
            detail={
              mismatchCount > 0
                ? `${mismatchCount} Datei(en) mit abweichendem Hash. ${compare.newInLive.length} Datei(en) ohne Referenzpendant.`
                : gov?.kind === 'eoa'
                  ? 'Alle Hashes stimmen ueberein; jedoch kontrolliert ein einzelner EOA den ENS-Namen (UEbernahme-Risiko).'
                  : 'Hash- und Domain-Abgleich ohne Befund.'
            }
          />
          <KpiGrid>
            <Kpi label="Abgeglichene Dateien" value={compare.matched.filter((m) => m.ref).length} />
            <Kpi label="Hash-Abweichungen" value={mismatchCount} tone={mismatchCount ? 'red' : 'green'} />
            <Kpi label="Neue Dateien live" value={compare.newInLive.length} tone={compare.newInLive.length ? 'amber' : 'green'} />
            <Kpi label="Neue Domains live" value={compare.newDomains.length} tone={compare.newDomains.length ? 'red' : 'green'} />
          </KpiGrid>

          {gov && (
            <details className="acc" open>
              <summary>Governance-Ampel (ENS-Kontrolle)</summary>
              <div className="acc-body space-y-2">
                <p>
                  Owner: <code className="mono text-xs break-all">{gov.owner}</code>{' '}
                  <span className={`badge ${gov.kind === 'multisig-contract' ? 'badge-green' : gov.kind === 'eoa' ? 'badge-red' : 'badge-amber'}`}>
                    {gov.kind === 'multisig-contract' ? `Multisig (${gov.ownerCount} Owner)` : gov.kind === 'eoa' ? 'Einzelner EOA' : gov.kind}
                  </span>
                </p>
                <p className="text-sm">{gov.detail}</p>
                {cid && (
                  <p className="text-sm">
                    contenthash: <span className="mono text-xs">{cid.kind}</span> → <code className="mono text-xs break-all">{cid.cid}</code>
                    {cid.kind === 'ipns' && <span className="badge badge-amber ml-2">IPNS: veraenderbar — besondere Vorsicht</span>}
                  </p>
                )}
                {ens?.resolverAddress && <p className="text-xs text-dim">Resolver: <code className="mono">{ens.resolverAddress}</code></p>}
              </div>
            </details>
          )}

          <details className="acc" open>
            <summary>Skript-Hash-Abgleich</summary>
            <div className="acc-body overflow-x-auto">
              <table className="table-x">
                <thead>
                  <tr>
                    <th>Live-Asset</th>
                    <th>Referenz</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.matched.map((m, i) => (
                    <tr key={i}>
                      <td className="mono text-xs break-all">{shortHex(m.url, 52, 14)}</td>
                      <td className="mono text-xs">{m.ref || <span className="badge badge-amber">keine Referenz</span>}</td>
                      <td>{m.ref ? (m.ok ? <span className="badge badge-green">identisch</span> : <span className="badge badge-red">Hash weicht ab</span>) : <span className="badge badge-amber">neu live</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {compare.missingInLive.length > 0 && (
                <p className="text-xs text-dim mt-2">In Referenz, aber nicht live gefunden: {compare.missingInLive.join(', ')}</p>
              )}
            </div>
          </details>

          {(compare.newDomains.length > 0 || compare.newAddresses.length > 0) && (
            <details className="acc" open>
              <summary>Neue Domains / Adressen im Live-Bundle</summary>
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
                    <span className="badge badge-amber">Vertrags-Adressen</span>{' '}
                    {compare.newAddresses.map((d) => (
                      <code key={d} className="mono text-xs mr-2">{shortHex(d, 10, 6)}</code>
                    ))}
                  </p>
                )}
              </div>
            </details>
          )}

          {refNote && <p className="text-xs text-dim">{refNote}</p>}

          <ExportBar
            onJson={() =>
              downloadJSON(
                { tool: 'bundlewatch-ens', generatedAt: new Date().toISOString(), ens, gov, cid, referenceAssets: refAssets.map((r) => ({ ...r, text: undefined })), compare },
                'bundlewatch-ens-bericht.json',
              )
            }
            onPrint={() =>
              openPrintableReport({
                title: 'BundleWatch-ENS Integritätsbericht',
                subtitle: `${ensName || manualCh.slice(0, 18) + '…'} · ${new Date().toLocaleString('de-DE')}`,
                status: { level: level!, headline: level === 'red' ? 'Abweichungen gefunden' : level === 'amber' ? 'Governance-Risiko' : 'Integritaet bestaetigt', detail: gov?.detail },
                sections: [
                  { heading: 'Governance', body: `<pre>Owner: ${gov?.owner ?? '-'}\nTyp: ${gov?.kind ?? '-'}\ncontenthash: ${cid ? cid.kind + ' ' + cid.cid : '-'}</pre>` },
                  {
                    heading: 'Hash-Abgleich',
                    body: '<table border="1" cellspacing="0" cellpadding="6">' + compare.matched.map((m) => `<tr><td>${m.url}</td><td>${m.ref || '—'}</td><td>${m.ref ? (m.ok ? 'identisch' : 'ABWEICHUNG') : 'neu live'}</td></tr>`).join('') + '</table>',
                  },
                  { heading: 'Neue Domains', body: '<p>' + (compare.newDomains.join(', ') || 'keine') + '</p>' },
                ],
              })
            }
          />
        </StepSection>
      )}

      <details className="acc">
        <summary>Konsolen-Snippet (im Ziel-Tab ausführen, sammelt Skript-Hashes)</summary>
        <div className="acc-body">
          <p className="text-sm text-dim">Diese Zeile in die Konsole des Live-Tabs der dApp kopieren — sie hasht alle geladenen Skripte lokal und laedt ein JSON herunter:</p>
          <pre className="mono text-xs bg-obsidian border border-line rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{BOOKMARKLET}</pre>
          <CopyButton text={BOOKMARKLET} label="Snippet kopieren" compact />
        </div>
      </details>
    </div>
  );
}
