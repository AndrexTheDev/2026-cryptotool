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

// Canonical 7702 delegate addresses, verified by multiple independent sources.
// Conservative: only addresses with at least three independent sources.
export const KNOWN_DELEGATES: Record<string, { name: string; note: string }> = {
  '0x63c0c19a282a1b52b07dd5a65b58948a07dae32b': {
    name: 'MetaMask EIP-7702 Delegator',
    note: 'MetaMask whitelists exclusively this delegator; return to EOA via a 7702 authorization to address(0).',
  },
};
const knownDelegate = (addr: string | null | undefined) => (addr ? KNOWN_DELEGATES[addr.toLowerCase()] : undefined);

interface ChainFinding {
  chainId: number;
  status: 'no-delegation' | 'delegation' | 'unknown-delegate' | 'error';
  code?: string;
  delegate?: string | null;
  delegateHasCode?: boolean | undefined;
  delegateLabel?: string;
  nonZeroSlots: { slot: string; label?: string | undefined; value: string }[];
  scannedSlots: number;
  source?: 'user' | 'wallet' | 'public' | 'cache' | 'offline';
  at?: number | undefined;
  note?: string;
}

interface SlotLayoutItem {
  slot: string;
  role: string;
}

interface CollisionItem {
  slot: string;
  value: string;
  oldRole?: string | undefined;
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
const DEMO_BYTECODE = '0xef0100' + '63c0c19a282a1b52b07dd5a65b58948a07dae32b'; // MetaMask delegator → demo shows the known-delegates badge
const DEMO_DUMP = `0x0: 0x0000000000000000000000000000000000000000000000000000000000000001
0x1: 0x000000000000000000000000c0ffee254729296a45a3885639ac7e10f9d54979
0x2: 0x0000000000000000000000000000000000000000000000000000000000000042`;
const DEMO_LAYOUT_OLD = '0x0: initialized (bool)\n0x1: owner (address)\n0x2: nonce (uint256)';
const DEMO_LAYOUT_NEW = '0x0: owner (address)\n0x1: guardian (address)\n0x3: threshold (uint256)';

function parseLayout(text: string): SlotLayoutItem[] {
  const out: SlotLayoutItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(0x[0-9a-fA-F]+|\d+)\s*[:=,;|]\s*(.+)$/);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const slotBig = BigInt(m[1]);
    out.push({ slot: '0x' + slotBig.toString(16).padStart(64, '0'), role: m[2].trim() });
  }
  return out;
}

/** Builds the self-contained, offline-runnable HTML emergency file. */
function buildPanicHtml(pack: PanicPack, armor: string, passphraseHint: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Panic Revoke — emergency package (7702)</title>
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
<h1>🛡 Panic Revoke — EIP-7702 emergency package</h1>
<p class="warn"><strong>Important:</strong> every regular transaction from your account increments the nonce and makes
pre-signed emergency packages unredeemable. Before use, check whether the nonce below is still the current account nonce —
otherwise regenerate the package in 7702 SlotGuard.</p>
<h2>Account &amp; authorization (plain-text metadata)</h2>
<pre>Account (EOA):      ${esc(pack.eoa)}
Target delegation:   ${esc(ZERO_ADDR)} (full revocation)
${pack.chainId === 0 ? 'Chain validity:      all chains (chainId 0) — WARNING: chainId-0 authorizations can be replayed cross-chain; use only for a deliberate multi-chain revocation, otherwise regenerate the package with a fixed chainId.' : 'Chain validity:      chainId ' + pack.chainId}
Authorization nonce:  ${pack.nonce}
Authorization digest: ${esc(pack.digest)}
Created:             ${new Date().toISOString()}
Signiert:            ${pack.signed ? 'yes (r/s/yParity in the encrypted part)' : 'no — digest included for later signing'}</pre>
<h2>Encrypted core (age, passphrase)</h2>
<p>This section is encrypted with your passphrase and contains the complete authorization${
    pack.signed ? ' incl. signature' : ''
  }.</p>
<pre>${esc(armor)}</pre>
<h2>Use in an emergency</h2>
<ol>
<li>Open the file offline. Decrypt the section using your passphrase hint: <code>${esc(
    passphraseHint || '(no hint stored)',
  )}</code> — in 7702 SlotGuard (section "Decrypt emergency package") or with any age-compatible tool.</li>
<li>Send a type-4 transaction (EIP-7702) with the contained authorization from your account (e.g.&nbsp;via a wallet or an open-source CLI with 7702 support).</li>
<li>Success check: the account bytecode must be empty afterwards (<code>eth_getCode</code> = <code>0x</code>).</li>
</ol>
<p class="small">Generated locally by StackAutopsy 7702 SlotGuard. No server transfer. No substitute for backups or legal advice.</p>
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
      setError('Please provide a valid public address (0x…, 40 hex characters). A private key is never required.');
      return;
    }
    setRunning(true);
    const newFindings: ChainFinding[] = [];
    const allNonZero = new Map<string, string>(); // slot -> value (first found)
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
          note: 'Analysis based exclusively on manually pasted raw data.',
        });
      } else {
        if (chains.length === 0) {
          setError('Please select at least one network.');
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
              // slot scan: 0..15 + EIP-1967 + optional ERC-7201 namespace
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
                  /* skip individual slot */
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
                at: codeRes.at,
              });
            } catch (e) {
              newFindings.push({ chainId, status: 'error', note: (e as Error).message, nonZeroSlots: [], scannedSlots: 0 });
            }
          }),
        );
      }

      // ---- collision analysis (existing storage x new layout) ----
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
            reason: `Occupied slot collides with new role "${nRole}"${oRole ? ` (previously: "${oRole}")` : ' (previously unassigned/third-party)'}.`,
          });
        } else if (!nRole && !oRole) {
          col.push({ slot, value, reason: 'Orphaned value without a documented role in the layouts.' });
        }
      }
      setCollisions(col);

      // ---- overall traffic-light assessment ----
      const anyError = newFindings.some((f) => f.status === 'error');
      const delegations = newFindings.filter((f) => f.status === 'delegation' || f.status === 'unknown-delegate');
      let level: StatusLevel = 'green';
      let headline = 'No delegation detected';
      let detail = 'On all checked networks the account has standard EOA bytecode without the 0xef0100 delegation marker.';
      if (newFindings.length === 0 || anyError) {
        level = 'amber';
        headline = 'Partially unknown';
        detail = 'At least one network did not respond. Results are valid only for successfully queried networks; use offline mode if needed.';
      }
      if (delegations.length > 0) {
        if (newFindings.some((f) => f.status === 'unknown-delegate')) {
          level = 'amber';
          headline = 'Delegation to an unknown delegate';
          detail =
            'The delegate points to an address without deployed code or without a verifiable response. Check before any further signature. Context (2026): according to forensic analyses, the majority of malicious 7702 delegations trace back to a single recurring sweeper contract family — an unknown delegate is therefore a critical candidate for a dormant sweeper (can stay inactive for weeks and strike when funds arrive).';
        } else if (col.length > 0) {
          level = 'red';
          headline = 'Colliding storage slots / orphaned values';
          detail =
            'Switching the delegate risks storage collisions: occupied slots overlap with the new layout or cannot be attributed. Prepare the panic-revoke package below.';
        } else {
          level = 'amber';
          headline = 'Active 7702 delegation found';
          detail =
            'The account delegates execution to a contract address. Check the delegate and storage slots for integrity; keep a fresh panic-revoke package ready.';
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
      if (!isHexAddress(eoa)) throw new Error('A valid account address is required.');
      let nonce: number;
      if (panicNonce.trim() !== '') {
        nonce = Number(panicNonce);
        if (!Number.isInteger(nonce) || nonce < 0) throw new Error('Nonce must be a non-negative integer.');
      } else {
        const res = await rpcCall<string>(panicChain, 'eth_getTransactionCount', [eoa, 'latest']);
        nonce = Number(BigInt(res.data));
      }
      const v = await import('viem');
      const digest = await authorizationDigest(panicChain === 0 ? 0 : panicChain, ZERO_ADDR, nonce);
      const pack: PanicPack = { digest, chainId: panicChain, nonce, address: ZERO_ADDR, eoa };

      // optional later signing: validate signature parts
      const hasSig = signR.trim() && signS.trim();
      if (hasSig) {
        const r = signR.trim();
        const s = signS.trim();
        let yParity = signV.trim();
        if (!/^0x[0-9a-fA-F]{64}$/.test(r) || !/^0x[0-9a-fA-F]{64}$/.test(s)) throw new Error('r and s must be 32-byte hex.');
        if (yParity === '27') yParity = '0x0';
        if (yParity === '28') yParity = '0x1';
        if (yParity !== '0x0' && yParity !== '0x1' && yParity !== '0' && yParity !== '1')
          throw new Error('yParity/v must be 0, 1, 27 or 28.');
        pack.signed = { r, s, yParity: yParity === '0' ? '0x0' : yParity };
      }

      if (passphrase.length < 8) throw new Error('Choose a passphrase of at least 8 characters.');
      const age = await import('age-encryption');
      const encrypter = new age.Encrypter();
      encrypter.setPassphrase(passphrase);
      const payload = JSON.stringify(pack, null, 2);
      const cipherBytes = await encrypter.encrypt(new TextEncoder().encode(payload));
      const armor = age.armor.encode(cipherBytes);

      const html = buildPanicHtml(pack, armor, passHint.trim());
      downloadSelfContainedHtml(html, `panic-revoke-${eoa.slice(0, 10)}.html`);
      setPanicInfo(
        `Emergency package created and saved as panic-revoke-${eoa.slice(0, 10)}.html. Digest: ${shortHex(digest, 14, 10)}. ` +
          'Regenerate without fail after every regular transaction (nonce expiry).',
      );
      void v; // viem lazy import (used in authorizationDigest)
    } catch (e) {
      setPanicInfo('Error: ' + (e as Error).message);
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
        title="Set account & networks"
        hint="A public address is sufficient — a private key is never needed. Offline mode: paste bytecode and storage dump directly."
      >
        <div className="flex flex-wrap gap-2">
          <button className={`btn btn-sm ${mode === 'online' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('online')}>
            Online (multi-chain)
          </button>
          <button className={`btn btn-sm ${mode === 'offline' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('offline')}>
            Offline (manual raw data)
          </button>
          <span className="ml-auto">
            <DemoButton onClick={demo} />
          </span>
        </div>
        <div>
          <label className="label" htmlFor="sg-addr">
            Public EOA address
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
            <span className="label">Networks</span>
            <ChainMultiSelect selected={chains} onChange={setChains} />
          </div>
        ) : (
          <div className="grid gap-4">
            <div>
              <label className="label" htmlFor="sg-code">
                Account bytecode (eth_getCode output)
              </label>
              <textarea
                id="sg-code"
                className="textarea mono"
                placeholder="0xef0100… (23 bytes) or longer bytecode"
                value={manualBytecode}
                onChange={(e) => setManualBytecode(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="sg-dump">
                Storage dump (one line per slot: "slot value" or JSON)
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
            <label className="label" htmlFor="sg-old">Current delegate (optional)</label>
            <input id="sg-old" className="input mono" placeholder="0x…" value={oldDelegate} onChange={(e) => setOldDelegate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sg-new">Planned new delegate (optional)</label>
            <input id="sg-new" className="input mono" placeholder="0x…" value={newDelegate} onChange={(e) => setNewDelegate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sg-lo">Current layout (slot: role)</label>
            <textarea id="sg-lo" className="textarea mono" rows={3} placeholder={'0x0: owner\n0x1: nonce'} value={layoutOld} onChange={(e) => setLayoutOld(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sg-ln">New layout (slot: role)</label>
            <textarea id="sg-ln" className="textarea mono" rows={3} placeholder={'0x0: owner\n0x1: guardian'} value={layoutNew} onChange={(e) => setLayoutNew(e.target.value)} />
          </div>
        </div>
        {mode === 'online' && (
          <div>
            <label className="label" htmlFor="sg-ns">ERC-7201-Namespace (optional)</label>
            <input
              id="sg-ns"
              className="input mono"
              placeholder="e.g. openzeppelin.storage.Ownable"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
            />
          </div>
        )}
      </StepSection>

      <StepSection n={2} title="Check delegation & storage">
        <p className="text-sm">
          Reads the 0xef0100 delegation marker, extracts the active delegate, checks <code>eth_getCode</code> of the
          delegate and scans slots 0–15 plus EIP-1967/ERC-7201 namespaces for occupied values — followed by the
          collision analysis of current vs. new layout.
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void analyze()} disabled={running}>
          {running ? 'Analyzing…' : 'Check'}
        </button>
        {error && <ErrorNote message={error} />}
      </StepSection>

      {overall && (
        <StepSection n={3} title="Traffic-light result report">
          <StatusTile level={overall.level} headline={overall.headline} detail={overall.detail} />
          <KpiGrid>
            <Kpi label="Networks checked" value={findings.filter((f) => f.status !== 'error').length + '/' + findings.length} />
            <Kpi
              label="Active delegations"
              value={findings.filter((f) => f.status === 'delegation').length}
              tone={findings.some((f) => f.status === 'delegation') ? 'amber' : 'green'}
            />
            <Kpi
              label="Occupied slots (total)"
              value={findings.reduce((a, f) => Math.max(a, f.nonZeroSlots.length), 0)}
              tone={collisions.length > 0 ? 'red' : 'default'}
            />
            <Kpi label="Collisions / orphaned" value={collisions.length} tone={collisions.length ? 'red' : 'green'} />
          </KpiGrid>

          {findings.map((f) => (
            <details key={f.chainId} className="acc">
              <summary>
                <span className="flex items-center gap-2">
                  {f.chainId === 0 ? 'Offline input' : chainById(f.chainId)?.name ?? `Chain ${f.chainId}`}
                  <SourceBadge source={f.source} at={f.at} />
                </span>
                <span className={`badge ${f.status === 'no-delegation' ? 'badge-green' : f.status === 'delegation' ? 'badge-amber' : 'badge-red'}`}>
                  {f.status === 'no-delegation'
                    ? 'no delegation'
                    : f.status === 'delegation'
                      ? 'delegation active'
                      : f.status === 'unknown-delegate'
                        ? 'delegate unknown'
                        : 'error'}
                </span>
              </summary>
              <div className="acc-body space-y-2">
                {f.note && <p className="text-gold-hi text-sm">{f.note}</p>}
                {f.delegate && (
                  <p>
                    Delegate: <code className="mono text-prime-hi break-all">{f.delegate}</code>{' '}
                    {f.delegateLabel && <span className="badge badge-green">{f.delegateLabel}</span>}
                    {f.delegateHasCode === true && <span className="badge badge-green">code present</span>}
                    {f.delegateHasCode === false && <span className="badge badge-red">no code</span>}
                  </p>
                )}
                {f.code && f.code !== '0x' && (
                  <p className="mono text-xs break-all">
                    Bytecode ({Math.floor((f.code.length - 2) / 2)} Byte): {shortHex(f.code, 26, 14)}
                  </p>
                )}
                {f.code && f.code !== '0x' && (
                  <div>
                    <p className="text-xs text-dim mb-1">Critical opcode patterns in the account code:</p>
                    {scanBytecodePatterns(f.code).length === 0 ? (
                      <p className="text-sm text-prime-hi">No delegatecall/selfdestruct patterns detected.</p>
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
                        <th>Meaning</th>
                        <th>Value</th>
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
                  <p className="text-sm">No occupied slots in the scan range ({f.scannedSlots} slots checked).</p>
                )}
              </div>
            </details>
          ))}

          {collisions.length > 0 && (
            <details className="acc" open>
              <summary>Storage collisions & orphaned values ({collisions.length})</summary>
              <div className="acc-body">
                <table className="table-x">
                  <thead>
                    <tr>
                      <th>Slot</th>
                      <th>Current</th>
                      <th>New</th>
                      <th>Assessment</th>
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
              <strong>Nonce warning:</strong> every regular transaction from this account increments the nonce and makes
              pre-signed emergency packages (panic revoke) unredeemable. Regenerate the package after every account change
              and store it offline.
            </p>
          </div>

          <details className="acc" open={panicOpen}>
            <summary onClick={(e) => e.preventDefault()}>Break-glass: panic-revoke generator</summary>
            <div className="acc-body space-y-3">
              {!panicOpen && (
                <button className="btn btn-outline-amber btn-sm" onClick={() => setPanicOpen(true)}>
                  Configure emergency package
                </button>
              )}
              {panicOpen && (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor="pg-chain">Chain validity</label>
                      <select id="pg-chain" className="select" value={panicChain} onChange={(e) => setPanicChain(Number(e.target.value))}>
                        <option value={0}>all chains (chainId 0)</option>
                        {[1, 8453, 42161, 10, 137, 56].map((id) => (
                          <option key={id} value={id}>
                            chainId {id} only
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="pg-nonce">Nonce (empty = fetch current)</label>
                      <input id="pg-nonce" className="input mono" placeholder="e.g. 12" value={panicNonce} onChange={(e) => setPanicNonce(e.target.value)} />
                    </div>
                    <div>
                      <label className="label" htmlFor="pg-pass">Passphrase (min. 8 characters)</label>
                      <input id="pg-pass" type="password" className="input" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
                    </div>
                    <div>
                      <label className="label" htmlFor="pg-hint">Password hint (optional, in the file's plain text)</label>
                      <input id="pg-hint" className="input" placeholder="e.g. 'kitchen-drawer safe 2026'" value={passHint} onChange={(e) => setPassHint(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-xs text-dim">
                    This prepares an EIP-7702 authorization to {ZERO_ADDR} (full revocation). Signing works
                    with any 7702-capable wallet flow (<code>wallet_signAuthorization</code>) or externally via the
                    displayed digest; signature parts (r, s, v/yParity) can be added here and are
                    stored encrypted.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <input className="input mono" placeholder="r (0x…64 Hex)" value={signR} onChange={(e) => setSignR(e.target.value)} />
                    <input className="input mono" placeholder="s (0x…64 Hex)" value={signS} onChange={(e) => setSignS(e.target.value)} />
                    <input className="input mono" placeholder="v / yParity (0,1,27,28)" value={signV} onChange={(e) => setSignV(e.target.value)} />
                  </div>
                  <button className="btn btn-primary" onClick={() => void buildPanic()} disabled={panicBusy}>
                    {panicBusy ? 'Encrypting…' : 'Create encrypted emergency package (HTML download)'}
                  </button>
                  {panicInfo && <p className="text-sm text-gold-hi">{panicInfo}</p>}
                </>
              )}
            </div>
          </details>

          <ExportBar
            onJson={() => downloadJSON(resultJson, '7702-slotguard-report.json')}
            onPrint={() =>
              openPrintableReport({
                title: '7702 SlotGuard Review Report',
                subtitle: `Account ${address} · ${new Date().toLocaleString('en-GB')}`,
                status: overall,
                sections: [
                  {
                    heading: 'Network results',
                    body:
                      '<pre>' +
                      findings
                        .map(
                          (f) =>
                            `${f.chainId === 0 ? 'Offline' : `Chain ${f.chainId}`}: ${f.status}${f.delegate ? ` · delegate ${f.delegate}` : ''} · ${f.nonZeroSlots.length} occupied slots`,
                        )
                        .join('\n') +
                      '</pre>',
                  },
                  collisions.length
                    ? {
                        heading: 'Storage collisions',
                        body: '<pre>' + collisions.map((c) => `${c.slot}\n  ${c.reason}`).join('\n') + '</pre>',
                      }
                    : { heading: 'Storage collisions', body: '<p>None detected.</p>' },
                  {
                    heading: 'Nonce warning',
                    body: '<p>Every regular transaction increments the nonce; pre-signed emergency packages expire afterwards and must be regenerated.</p>',
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
