import { useMemo, useState } from 'react';
import {
  ChainMultiSelect,
  CopyButton,
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
import { getCode, getStorageAt, rpcCall } from '../../lib/rpc';
import { chainById } from '../../config/chains';
import { downloadJSON, downloadSelfContainedHtml, openPrintableReport } from '../../lib/export';
import { isHexAddress, shortHex } from '../../lib/format';
import {
  EIP1967,
  ZERO_ADDR,
  authorizationDigest,
  erc7201Slot,
  extract7702Delegate,
  parseStorageDump,
  scanBytecodePatterns,
} from '../../lib/evm-utils';

interface ChainFinding {
  chainId: number;
  status: 'no-delegation' | 'delegation' | 'unknown-delegate' | 'error';
  code?: string;
  delegate?: string | null;
  delegateHasCode?: boolean;
  nonZeroSlots: { slot: string; label?: string; value: string }[];
  scannedSlots: number;
  source?: 'user' | 'wallet' | 'public' | 'cache' | 'offline';
  note?: string;
}

interface SlotLayoutItem {
  slot: string;
  role: string;
}

interface CollisionItem {
  slot: string;
  value: string;
  oldRole?: string;
  newRole?: string;
  reason: string;
}

interface PanicPack {
  digest: string;
  chainId: number;
  nonce: number;
  address: string;
  eoa: string;
  signed?: { r: string; s: string; yParity: string };
}

const DEMO_ADDRESS = '0x1111111111111111111111111111111111111777';
const DEMO_BYTECODE = '0xef0100' + 'ab5801a17d1f2c3134c0ffee00cafebabe000000';
const DEMO_DUMP = `0x0: 0x0000000000000000000000000000000000000000000000000000000000000001
0x1: 0x000000000000000000000000c0ffee254729296a45a3885639ac7e10f9d54979
0x2: 0x0000000000000000000000000000000000000000000000000000000000000042`;
const DEMO_LAYOUT_OLD = '0x0: initialized (bool)\n0x1: owner (address)\n0x2: nonce (uint256)';
const DEMO_LAYOUT_NEW = '0x0: owner (address)\n0x1: guardian (address)\n0x3: threshold (uint256)';

function parseLayout(text: string): SlotLayoutItem[] {
  const out: SlotLayoutItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(0x[0-9a-fA-F]+|\d+)\s*[:=,;|]\s*(.+)$/);
    if (!m) continue;
    const slotBig = m[1].startsWith('0x') ? BigInt(m[1]) : BigInt(m[1]);
    out.push({ slot: '0x' + slotBig.toString(16).padStart(64, '0'), role: m[2].trim() });
  }
  return out;
}

/** Baut die eigenstaendige, offline ausfuehrbare HTML-Notfalldatei. */
function buildPanicHtml(pack: PanicPack, armor: string, passphraseHint: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>Panic-Revoke — Notfallpaket (7702)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;background:#07090d;color:#cbd5e1;max-width:46rem;margin:2rem auto;padding:0 1rem;line-height:1.65}
h1{color:#f8fafc;font-size:1.4rem}
.warn{border-left:5px solid #eab308;background:rgba(234,179,8,.08);padding:.9rem 1rem;border-radius:.5rem}
pre{background:#0f141b;border:1px solid #1e293b;border-radius:.6rem;padding:.9rem;overflow-x:auto;font-size:.8rem;color:#a7f3d0;white-space:pre-wrap;word-break:break-all}
code{font-family:ui-monospace,Menlo,monospace}
.small{font-size:.8rem;color:#64748b}
input,button{font:inherit;padding:.5rem .8rem;border-radius:.5rem;border:1px solid #334155;background:#0a0f16;color:#f8fafc}
button{background:#10b981;color:#04150e;font-weight:700;border:none;cursor:pointer}
</style></head><body>
<h1>🛡 Panic-Revoke — EIP-7702-Notfallpaket</h1>
<p class="warn"><strong>Wichtig:</strong> Jede reguläre Transaktion Ihres Kontos erhöht die Nonce und macht vorab signierte
Notfallpakete uneinloesbar. Prüfen Sie vor Verwendung, ob die unten genannte Nonce noch die aktuelle Konto-Nonce ist —
andernfalls erzeugen Sie das Paket im 7702-SlotGuard neu.</p>
<h2>Konto &amp; Autorisierung (Klartext-Metadaten)</h2>
<pre>Konto (EOA):        ${esc(pack.eoa)}
Ziel-Delegation:     ${esc(ZERO_ADDR)} (vollstaendiger Widerruf)
${pack.chainId === 0 ? 'Chain-Gueltigkeit:    alle Chains (chainId 0) — ACHTUNG: chainId-0-Autorisierungen lassen sich cross-chain replayen; nur bei bewusstem Multi-Chain-Widerruf verwenden, sonst Paket mit fester chainId neu erzeugen.' : 'Chain-Gueltigkeit:    chainId ' + pack.chainId}
Autorisierungs-Nonce: ${pack.nonce}
Autorisierungs-Digest: ${esc(pack.digest)}
Erzeugt:             ${new Date().toISOString()}
Signiert:            ${pack.signed ? 'ja (r/s/yParity im verschluesselten Teil)' : 'nein — Digest zum Nachsignieren enthalten'}</pre>
<h2>Verschluesselter Kern (age, Passphrase)</h2>
<p>Dieser Abschnitt ist mit Ihrer Passphrase verschluesselt und enthaelt die vollstaendige Autorisierung${
    pack.signed ? ' inkl. Signatur' : ''
  }.</p>
<pre>${esc(armor)}</pre>
<h2>Verwendung im Ernstfall</h2>
<ol>
<li>Datei offline oeffnen. Entschluesseln Sie den Abschnitt mit Ihrem Passphrase-Hinweis: <code>${esc(
    passphraseHint || '(kein Hinweis hinterlegt)',
  )}</code> — im 7702-SlotGuard (Bereich „Notfallpaket entschluesseln") oder mit einem beliebigen age-kompatiblen Werkzeug.</li>
<li>Senden Sie eine Type-4-Transaktion (EIP-7702) mit der enthaltenen Autorisierung von Ihrem Konto (z.&nbsp;B. ueber ein Wallet oder ein Open-Source-CLI mit 7702-Unterstuetzung).</li>
<li>Erfolgskontrolle: Der Account-Bytecode muss danach leer sein (<code>eth_getCode</code> = <code>0x</code>).</li>
</ol>
<p class="small">Erzeugt lokal durch AndrexTheDev 7702-SlotGuard. Keine Server-Uebertragung. Kein Ersatz fuer Backups oder Rechtsberatung.</p>
</body></html>`;
}

export default function SlotGuard7702() {
  const [mode, setMode] = useState<'online' | 'offline'>('online');
  const [address, setAddress] = useState('');
  const [chains, setChains] = useState<number[]>([1, 8453]);
  const [oldDelegate, setOldDelegate] = useState('');
  const [newDelegate, setNewDelegate] = useState('');
  const [layoutOld, setLayoutOld] = useState('');
  const [layoutNew, setLayoutNew] = useState('');
  const [manualBytecode, setManualBytecode] = useState('');
  const [manualDump, setManualDump] = useState('');
  const [namespace, setNamespace] = useState('');

  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [findings, setFindings] = useState<ChainFinding[]>([]);
  const [collisions, setCollisions] = useState<CollisionItem[]>([]);
  const [overall, setOverall] = useState<{ level: StatusLevel; headline: string; detail: string } | null>(null);

  // Panic-Revoke
  const [panicOpen, setPanicOpen] = useState(false);
  const [panicChain, setPanicChain] = useState(1);
  const [panicNonce, setPanicNonce] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [passHint, setPassHint] = useState('');
  const [signR, setSignR] = useState('');
  const [signS, setSignS] = useState('');
  const [signV, setSignV] = useState('');
  const [panicBusy, setPanicBusy] = useState(false);
  const [panicInfo, setPanicInfo] = useState('');

  const demo = () => {
    setMode('offline');
    setAddress(DEMO_ADDRESS);
    setManualBytecode(DEMO_BYTECODE);
    setManualDump(DEMO_DUMP);
    setOldDelegate('0xab5801a17d1f2c3134c0ffee00cafebabe000000');
    setNewDelegate('0x7777777777777777777777777777777777777777');
    setLayoutOld(DEMO_LAYOUT_OLD);
    setLayoutNew(DEMO_LAYOUT_NEW);
    setNamespace('openzeppelin.storage.Ownable');
    setError('');
  };

  const analyze = async () => {
    setError('');
    setPanicInfo('');
    const addr = address.trim();
    if (!isHexAddress(addr)) {
      setError('Bitte eine gueltige öffentliche Adresse angeben (0x…, 40 Hex-Zeichen). Es wird niemals ein privater Schluessel benoetigt.');
      return;
    }
    setRunning(true);
    const newFindings: ChainFinding[] = [];
    const allNonZero = new Map<string, string>(); // slot -> value (erste gefundene)
    try {
      if (mode === 'offline') {
        const code = manualBytecode.trim() || '0x';
        const delegate = extract7702Delegate(code);
        const dump = parseStorageDump(manualDump);
        for (const e of dump) {
          if (BigInt(e.value) !== 0n) allNonZero.set(e.slot, e.value);
        }
        newFindings.push({
          chainId: 0,
          status: delegate ? 'delegation' : 'no-delegation',
          code,
          delegate,
          delegateHasCode: undefined,
          nonZeroSlots: dump.filter((e) => BigInt(e.value) !== 0n).map((e) => ({ slot: e.slot, value: e.value })),
          scannedSlots: dump.length,
          source: 'offline',
          note: 'Analyse ausschließlich aus manuell eingefuegten Rohdaten.',
        });
      } else {
        if (chains.length === 0) {
          setError('Bitte mindestens ein Netzwerk waehlen.');
          setRunning(false);
          return;
        }
        await Promise.all(
          chains.map(async (chainId) => {
            try {
              const codeRes = await getCode(chainId, addr);
              const code = codeRes.data ?? '0x';
              const delegate = extract7702Delegate(code);
              let delegateHasCode: boolean | undefined;
              if (delegate) {
                try {
                  const dc = await getCode(chainId, delegate);
                  delegateHasCode = !!(dc.data && dc.data !== '0x');
                } catch {
                  delegateHasCode = undefined;
                }
              }
              // Slot-Scan: 0..15 + EIP-1967 + optional ERC-7201-Namespace
              const slots: { slot: string; label?: string }[] = [];
              for (let i = 0; i < 16; i++) slots.push({ slot: '0x' + i.toString(16).padStart(64, '0') });
              slots.push({ slot: EIP1967.IMPLEMENTATION, label: 'EIP-1967 Implementation' });
              slots.push({ slot: EIP1967.ADMIN, label: 'EIP-1967 Admin' });
              slots.push({ slot: EIP1967.BEACON, label: 'EIP-1967 Beacon' });
              if (namespace.trim()) slots.push({ slot: await erc7201Slot(namespace.trim()), label: `ERC-7201 ${namespace.trim()}` });

              const nonZero: ChainFinding['nonZeroSlots'] = [];
              for (const s of slots) {
                try {
                  const v = await getStorageAt(chainId, addr, s.slot);
                  if (v.data && BigInt(v.data) !== 0n) {
                    nonZero.push({ slot: s.slot, label: s.label, value: v.data });
                    if (!allNonZero.has(s.slot)) allNonZero.set(s.slot, v.data);
                  }
                } catch {
                  /* einzelner Slot ueberspringen */
                }
              }
              newFindings.push({
                chainId,
                status: !delegate ? 'no-delegation' : delegateHasCode === false ? 'unknown-delegate' : 'delegation',
                code,
                delegate,
                delegateHasCode,
                nonZeroSlots: nonZero,
                scannedSlots: slots.length,
                source: codeRes.source,
              });
            } catch (e) {
              newFindings.push({ chainId, status: 'error', note: (e as Error).message, nonZeroSlots: [], scannedSlots: 0 });
            }
          }),
        );
      }

      // ---- Kollisionsanalyse (bestehender Storage x neues Layout) ----
      const layoutN = parseLayout(layoutNew);
      const layoutO = parseLayout(layoutOld);
      const roleOld = new Map(layoutO.map((l) => [l.slot, l.role]));
      const roleNew = new Map(layoutN.map((l) => [l.slot, l.role]));
      const col: CollisionItem[] = [];
      for (const [slot, value] of allNonZero) {
        const nRole = roleNew.get(slot);
        const oRole = roleOld.get(slot);
        if (nRole && (!oRole || oRole !== nRole)) {
          col.push({
            slot,
            value,
            oldRole: oRole,
            newRole: nRole,
            reason: `Belegter Slot kollidiert mit neuer Rolle „${nRole}"${oRole ? ` (bisher: „${oRole}")` : ' (bisher unbelegt/dritt)'}.`,
          });
        } else if (!nRole && !oRole) {
          col.push({ slot, value, reason: 'Verwaister Wert ohne dokumentierte Rolle in den Layouts.' });
        }
      }
      setCollisions(col);

      // ---- Ampel-Gesamtbewertung ----
      const anyError = newFindings.some((f) => f.status === 'error');
      const delegations = newFindings.filter((f) => f.status === 'delegation' || f.status === 'unknown-delegate');
      let level: StatusLevel = 'green';
      let headline = 'Keine Delegation erkannt';
      let detail = 'Auf allen geprueften Netzwerken besitzt das Konto Standard-EOA-Bytecode ohne 0xef0100-Delegationsmarker.';
      if (newFindings.length === 0 || anyError) {
        level = 'amber';
        headline = 'Teilweise unbekannt';
        detail = 'Mindestens ein Netzwerk lieferte keine Antwort. Ergebnisse nur fuer erfolgreich abgefragte Netzwerke gueltig; Offline-Modus nutzbar.';
      }
      if (delegations.length > 0) {
        if (newFindings.some((f) => f.status === 'unknown-delegate')) {
          level = 'amber';
          headline = 'Delegation auf unbekannten Delegate';
          detail =
            'Der Delegate verweist auf eine Adresse ohne ausgerollten Code oder ohne verifizierbare Antwort. Vor jeder weiteren Signatur pruefen. Kontext (2026): Die Mehrheit boesartiger 7702-Delegationen entfiel forensischen Auswertungen zufolge auf eine einzige wiederkehrende Sweeper-Vertragsfamilie — ein unbekannter Delegate ist daher ein kritischer Kandidat fuer einen Dormant-Sweeper (kann Wochen inaktiv bleiben und bei Geldeingang zugreifen).';
        } else if (col.length > 0) {
          level = 'red';
          headline = 'Kollidierende Storage-Slots / verwaiste Werte';
          detail =
            'Beim Wechsel des Delegate drohen Storage-Kollisionen: Belegte Slots ueberschneiden sich mit dem neuen Layout oder sind nicht zuordenbar. Panic-Revoke-Paket unten vorbereiten.';
        } else {
          level = 'amber';
          headline = 'Aktive 7702-Delegation gefunden';
          detail =
            'Das Konto delegiert Ausfuehrung an eine Contract-Adresse. Pruefen Sie Delegate und Storage-Slots auf Integritaet; halten Sie ein frisches Panic-Revoke-Paket bereit.';
        }
      }
      setOverall({ level, headline, detail });
      setFindings(newFindings.sort((a, b) => a.chainId - b.chainId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const buildPanic = async () => {
    setPanicBusy(true);
    setPanicInfo('');
    try {
      const eoa = address.trim();
      if (!isHexAddress(eoa)) throw new Error('Gueltige Kontoadresse erforderlich.');
      let nonce: number;
      if (panicNonce.trim() !== '') {
        nonce = Number(panicNonce);
        if (!Number.isInteger(nonce) || nonce < 0) throw new Error('Nonce muss eine nicht-negative Ganzzahl sein.');
      } else {
        const res = await rpcCall<string>(panicChain, 'eth_getTransactionCount', [eoa, 'latest']);
        nonce = Number(BigInt(res.data));
      }
      const v = await import('viem');
      const digest = await authorizationDigest(panicChain === 0 ? 0 : panicChain, ZERO_ADDR, nonce);
      const pack: PanicPack = { digest, chainId: panicChain, nonce, address: ZERO_ADDR, eoa };

      // optionale Nachsignatur: Signatur-Teile validieren
      const hasSig = signR.trim() && signS.trim();
      if (hasSig) {
        const r = signR.trim();
        const s = signS.trim();
        let yParity = signV.trim();
        if (!/^0x[0-9a-fA-F]{64}$/.test(r) || !/^0x[0-9a-fA-F]{64}$/.test(s)) throw new Error('r und s muessen 32-Byte-Hex sein.');
        if (yParity === '27') yParity = '0x0';
        if (yParity === '28') yParity = '0x1';
        if (yParity !== '0x0' && yParity !== '0x1' && yParity !== '0' && yParity !== '1')
          throw new Error('yParity/v muss 0, 1, 27 oder 28 sein.');
        pack.signed = { r, s, yParity: yParity === '0' ? '0x0' : yParity };
      }

      if (passphrase.length < 8) throw new Error('Passphrase mit mindestens 8 Zeichen waehlen.');
      const age = await import('age-encryption');
      const encrypter = new age.Encrypter();
      encrypter.setPassphrase(passphrase);
      const payload = JSON.stringify(pack, null, 2);
      const cipherBytes = await encrypter.encrypt(new TextEncoder().encode(payload));
      const armor = age.armor.encode(cipherBytes);

      const html = buildPanicHtml(pack, armor, passHint.trim());
      downloadSelfContainedHtml(html, `panic-revoke-${eoa.slice(0, 10)}.html`);
      setPanicInfo(
        `Notfallpaket erzeugt und als panic-revoke-${eoa.slice(0, 10)}.html gespeichert. Digest: ${shortHex(digest, 14, 10)}. ` +
          'Nach jeder regulären Transaktion unbedingt neu erzeugen (Nonce-Verfall).',
      );
      void v; // viem lazy import (wird in authorizationDigest genutzt)
    } catch (e) {
      setPanicInfo('Fehler: ' + (e as Error).message);
    } finally {
      setPanicBusy(false);
    }
  };

  const resultJson = useMemo(
    () => ({ tool: '7702-slotguard', generatedAt: new Date().toISOString(), address, findings, collisions, overall }),
    [address, findings, collisions, overall],
  );

  return (
    <div className="space-y-5">
      <StepSection
        n={1}
        title="Konto & Netzwerke festlegen"
        hint="Öffentliche Adresse genuegt — privater Schluessel wird nie benoetigt. Offline-Modus: Bytecode und Storage-Dump direkt einfuegen."
      >
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-sm ${mode === 'online' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('online')}>
            Online (Multi-Chain)
          </button>
          <button className={`btn btn-sm ${mode === 'offline' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('offline')}>
            Offline (manuelle Rohdaten)
          </button>
          <span className="ml-auto">
            <DemoButton onClick={demo} />
          </span>
        </div>
        <div>
          <label className="label" htmlFor="sg-addr">
            Öffentliche EOA-Adresse
          </label>
          <input
            id="sg-addr"
            className="input mono"
            placeholder="0x…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
          />
        </div>
        {mode === 'online' ? (
          <div>
            <span className="label">Netzwerke</span>
            <ChainMultiSelect selected={chains} onChange={setChains} />
          </div>
        ) : (
          <div className="grid gap-4">
            <div>
              <label className="label" htmlFor="sg-code">
                Account-Bytecode (eth_getCode-Ausgabe)
              </label>
              <textarea
                id="sg-code"
                className="textarea mono"
                placeholder="0xef0100… (23 Byte) oder laengerer Bytecode"
                value={manualBytecode}
                onChange={(e) => setManualBytecode(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="sg-dump">
                Storage-Dump (eine Zeile pro Slot: „slot value" oder JSON)
              </label>
              <textarea
                id="sg-dump"
                className="textarea mono"
                placeholder={'0x0: 0x0000…0001\n0x1: 0x0000…c0ffee…'}
                value={manualDump}
                onChange={(e) => setManualDump(e.target.value)}
              />
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="sg-old">Bisheriger Delegate (optional)</label>
            <input id="sg-old" className="input mono" placeholder="0x…" value={oldDelegate} onChange={(e) => setOldDelegate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sg-new">Geplanter neuer Delegate (optional)</label>
            <input id="sg-new" className="input mono" placeholder="0x…" value={newDelegate} onChange={(e) => setNewDelegate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sg-lo">Layout bisher (Slot: Rolle)</label>
            <textarea id="sg-lo" className="textarea mono" rows={3} placeholder={'0x0: owner\n0x1: nonce'} value={layoutOld} onChange={(e) => setLayoutOld(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sg-ln">Layout neu (Slot: Rolle)</label>
            <textarea id="sg-ln" className="textarea mono" rows={3} placeholder={'0x0: owner\n0x1: guardian'} value={layoutNew} onChange={(e) => setLayoutNew(e.target.value)} />
          </div>
        </div>
        {mode === 'online' && (
          <div>
            <label className="label" htmlFor="sg-ns">ERC-7201-Namespace (optional)</label>
            <input
              id="sg-ns"
              className="input mono"
              placeholder="z. B. openzeppelin.storage.Ownable"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
            />
          </div>
        )}
      </StepSection>

      <StepSection n={2} title="Delegation & Storage prüfen">
        <p className="text-sm">
          Liest den 0xef0100-Delegationsmarker, extrahiert den aktiven Delegate, prueft <code>eth_getCode</code> des
          Delegates und scannt Slots 0–15 sowie EIP-1967-/ERC-7201-Namensraeume auf belegte Werte — anschließend folgt
          die Kollisionsanalyse bisheriges vs. neues Layout.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void analyze()} disabled={running}>
          {running ? 'Analyse laeuft…' : 'Prüfen'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {overall && (
        <StepSection n={3} title="Ampel-Ergebnisbericht">
          <StatusTile level={overall.level} headline={overall.headline} detail={overall.detail} />
          <KpiGrid>
            <Kpi label="Gepruefte Netzwerke" value={findings.filter((f) => f.status !== 'error').length + '/' + findings.length} />
            <Kpi
              label="Aktive Delegationen"
              value={findings.filter((f) => f.status === 'delegation').length}
              tone={findings.some((f) => f.status === 'delegation') ? 'amber' : 'green'}
            />
            <Kpi
              label="Belegte Slots (gesamt)"
              value={findings.reduce((a, f) => Math.max(a, f.nonZeroSlots.length), 0)}
              tone={collisions.length > 0 ? 'red' : 'default'}
            />
            <Kpi label="Kollisionen / verwaist" value={collisions.length} tone={collisions.length ? 'red' : 'green'} />
          </KpiGrid>

          {findings.map((f) => (
            <details key={f.chainId} className="acc">
              <summary>
                <span className="flex items-center gap-2">
                  {f.chainId === 0 ? 'Offline-Eingabe' : chainById(f.chainId)?.name ?? `Chain ${f.chainId}`}
                  <SourceBadge source={f.source} />
                </span>
                <span className={`badge ${f.status === 'no-delegation' ? 'badge-green' : f.status === 'delegation' ? 'badge-amber' : 'badge-red'}`}>
                  {f.status === 'no-delegation'
                    ? 'keine Delegation'
                    : f.status === 'delegation'
                      ? 'Delegation aktiv'
                      : f.status === 'unknown-delegate'
                        ? 'Delegate unbekannt'
                        : 'Fehler'}
                </span>
              </summary>
              <div className="acc-body space-y-2">
                {f.note && <p className="text-gold-hi text-sm">{f.note}</p>}
                {f.delegate && (
                  <p>
                    Delegate: <code className="mono text-prime-hi break-all">{f.delegate}</code>{' '}
                    {f.delegateHasCode === true && <span className="badge badge-green">Code vorhanden</span>}
                    {f.delegateHasCode === false && <span className="badge badge-red">kein Code</span>}
                  </p>
                )}
                {f.code && f.code !== '0x' && (
                  <p className="mono text-xs break-all">
                    Bytecode ({Math.floor((f.code.length - 2) / 2)} Byte): {shortHex(f.code, 26, 14)}
                  </p>
                )}
                {f.code && f.code !== '0x' && (
                  <div>
                    <p className="text-xs text-dim mb-1">Kritische Opcode-Muster im Account-Code:</p>
                    {scanBytecodePatterns(f.code).length === 0 ? (
                      <p className="text-sm text-prime-hi">Keine delegatecall-/selfdestruct-Muster erkannt.</p>
                    ) : (
                      <ul className="text-sm space-y-1">
                        {scanBytecodePatterns(f.code).map((p) => (
                          <li key={p.opcode}>
                            <span className="badge badge-amber">{p.count}×</span> {p.opcode} — {p.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {f.nonZeroSlots.length > 0 ? (
                  <table className="table-x">
                    <thead>
                      <tr>
                        <th>Slot</th>
                        <th>Bedeutung</th>
                        <th>Wert</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.nonZeroSlots.map((s) => (
                        <tr key={s.slot}>
                          <td className="mono text-xs break-all">{shortHex(s.slot, 12, 8)}</td>
                          <td>{s.label ?? '—'}</td>
                          <td className="mono text-xs break-all">{shortHex(s.value, 14, 8)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm">Keine belegten Slots im Scanbereich ({f.scannedSlots} Slots geprueft).</p>
                )}
              </div>
            </details>
          ))}

          {collisions.length > 0 && (
            <details className="acc" open>
              <summary>Storage-Kollisionen & verwaiste Werte ({collisions.length})</summary>
              <div className="acc-body">
                <table className="table-x">
                  <thead>
                    <tr>
                      <th>Slot</th>
                      <th>Bisher</th>
                      <th>Neu</th>
                      <th>Bewertung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collisions.map((c) => (
                      <tr key={c.slot}>
                        <td className="mono text-xs break-all">{shortHex(c.slot, 10, 6)}</td>
                        <td>{c.oldRole ?? '—'}</td>
                        <td>{c.newRole ?? '—'}</td>
                        <td className="text-gold-hi">{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="status-tile status-amber">
            <span aria-hidden="true">⚠</span>
            <p className="text-sm">
              <strong>Nonce-Warnung:</strong> Jede reguläre Transaktion dieses Kontos erhöht die Nonce und macht vorab
              signierte Notfallpakete (Panic-Revoke) uneinloesbar. Erzeugen Sie das Paket nach jeder Kontoaenderung neu
              und lagern Sie es offline.
            </p>
          </div>

          <details className="acc" open={panicOpen}>
            <summary onClick={(e) => e.preventDefault()}>Break-Glass: Panic-Revoke-Generator</summary>
            <div className="acc-body space-y-3">
              {!panicOpen && (
                <button className="btn btn-outline-amber btn-sm" onClick={() => setPanicOpen(true)}>
                  Notfallpaket konfigurieren
                </button>
              )}
              {panicOpen && (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="pg-chain">Chain-Gueltigkeit</label>
                      <select id="pg-chain" className="select" value={panicChain} onChange={(e) => setPanicChain(Number(e.target.value))}>
                        <option value={0}>alle Chains (chainId 0)</option>
                        {[1, 8453, 42161, 10, 137, 56].map((id) => (
                          <option key={id} value={id}>
                            nur chainId {id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="pg-nonce">Nonce (leer = aktuell abrufen)</label>
                      <input id="pg-nonce" className="input mono" placeholder="z. B. 12" value={panicNonce} onChange={(e) => setPanicNonce(e.target.value)} />
                    </div>
                    <div>
                      <label className="label" htmlFor="pg-pass">Passphrase (min. 8 Zeichen)</label>
                      <input id="pg-pass" type="password" className="input" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                    </div>
                    <div>
                      <label className="label" htmlFor="pg-hint">Passwort-Hinweis (optional, im Klartext der Datei)</label>
                      <input id="pg-hint" className="input" placeholder="z. B. 'Messer-Kluever-Tresor 2026'" value={passHint} onChange={(e) => setPassHint(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-xs text-dim">
                    Vorbereitet wird eine EIP-7702-Autorisierung an {ZERO_ADDR} (vollständiger Widerruf). Signiert werden
                    kann mit jedem 7702-faehigen Wallet-Flow (<code>wallet_signAuthorization</code>) oder extern über den
                    ausgewiesenen Digest; Signaturteile (r, s, v/yParity) können hier nachgetragen werden und werden
                    verschlüsselt abgelegt.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <input className="input mono" placeholder="r (0x…64 Hex)" value={signR} onChange={(e) => setSignR(e.target.value)} />
                    <input className="input mono" placeholder="s (0x…64 Hex)" value={signS} onChange={(e) => setSignS(e.target.value)} />
                    <input className="input mono" placeholder="v / yParity (0,1,27,28)" value={signV} onChange={(e) => setSignV(e.target.value)} />
                  </div>
                  <button className="btn btn-primary" onClick={() => void buildPanic()} disabled={panicBusy}>
                    {panicBusy ? 'Verschluesselung laeuft…' : 'Verschluesseltes Notfallpaket erzeugen (HTML-Download)'}
                  </button>
                  {panicInfo && <p className="text-sm text-gold-hi">{panicInfo}</p>}
                </>
              )}
            </div>
          </details>

          <ExportBar
            onJson={() => downloadJSON(resultJson, '7702-slotguard-bericht.json')}
            onPrint={() =>
              openPrintableReport({
                title: '7702-SlotGuard Prüfbericht',
                subtitle: `Konto ${address} · ${new Date().toLocaleString('de-DE')}`,
                status: overall,
                sections: [
                  {
                    heading: 'Netzwerk-Ergebnisse',
                    body:
                      '<pre>' +
                      findings
                        .map(
                          (f) =>
                            `${f.chainId === 0 ? 'Offline' : `Chain ${f.chainId}`}: ${f.status}${f.delegate ? ` · Delegate ${f.delegate}` : ''} · ${f.nonZeroSlots.length} belegte Slots`,
                        )
                        .join('\n') +
                      '</pre>',
                  },
                  collisions.length
                    ? {
                        heading: 'Storage-Kollisionen',
                        body: '<pre>' + collisions.map((c) => `${c.slot}\n  ${c.reason}`).join('\n') + '</pre>',
                      }
                    : { heading: 'Storage-Kollisionen', body: '<p>Keine erkannt.</p>' },
                  {
                    heading: 'Nonce-Warnung',
                    body: '<p>Jede reguläre Transaktion erhoeht die Nonce; vorab signierte Notfallpakete verfallen danach und muessen neu erzeugt werden.</p>',
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
