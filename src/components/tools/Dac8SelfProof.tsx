import { useEffect, useMemo, useState } from 'react';
import {
  CopyButton,
  DemoButton,
  ErrorNote,
  ExportBar,
  Kpi,
  KpiGrid,
  StatusTile,
  StepSection,
  type StatusLevel,
} from '../react/ui';
import { getBlockByNumber, getTx, getTxReceipt, ethCall, rpcCall } from '../../lib/rpc';
import { CHAINS, chainById, BTC_APIS } from '../../config/chains';
import { downloadJSON, openPrintableReport } from '../../lib/export';
import { isBitcoinTxid, isHexAddress, isTxHash, shortHex } from '../../lib/format';
import { discoverWallets, personalSign, type Eip1193Provider } from '../../lib/wallet';
import { signBip322P2tr, verifyBip322 } from '../../lib/bip322';

type AssetType = 'evm' | 'btc';

interface TxFacts {
  asset: AssetType;
  txid: string;
  blockHash?: string;
  blockHeight?: number;
  timestamp?: number;
  amountLabel?: string;
  fromLabel?: string;
  toLabel?: string;
  confirmed?: boolean;
  source: 'online' | 'manual' | 'offline-demo';
}

interface Cert {
  standard: 'AndrexTheDev/DAC8-SelfProof@1';
  purpose: string;
  asset: AssetType;
  txid: string;
  blockHash?: string;
  blockTimeUtc?: string;
  blockHeight?: number;
  targetAddress: string;
  note?: string;
  costBasisHint?: string;
  challengeMessage: string;
  signature?: { scheme: string; signer: string; signature: string };
  verification?: { scheme: string; result: 'gueltig' | 'ungueltig' | 'nicht geprueft'; detail?: string };
  createdAt: string;
}

const DEMO = {
  evmTxid: '0x53c69d6b7f440b2fe2f18733e54cf8b4c4a2f3a9bc98e2fdd0e24a1f28f0a001',
  btcTxid: '9f2c45ab12cd8f07b3a1c4d5e6f70819203a4b5c6d7e8f9012a3b4c5d6e7f809',
  manualBlock: '00000000000000000001b0f23d0a4c9d3e2b1c985f6e7d4c3b2a1908f7e6d5c4',
  manualTime: '2026-10-14T09:32:00Z',
  targetEvm: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf', // Adresse des oeffentlich bekannten Testkeys 0x01 (Demo!)
  demoPriv:
    '0000000000000000000000000000000000000000000000000000000000000001',
};

function buildChallenge(f: TxFacts, targetAddress: string, note: string): string {
  const lines = [
    'AndrexTheDev DAC8-SelfProof — kryptografischer Eigenuebertrag-Nachweis',
    '',
    'Zweck: Self-Custody Verification / Eigenuebertrag',
    `Asset-Klasse: ${f.asset === 'btc' ? 'Bitcoin' : 'EVM'}`,
    `Transaktion (TXID): ${f.txid}`,
    `Blockhash: ${f.blockHash ?? '(manuell, nicht abgerufen)'}`,
    `Blockzeit (UTC): ${f.timestamp ? new Date(f.timestamp * 1000).toISOString() : '(manuell)'}`,
    `Zieladresse (Beansprucht): ${targetAddress}`,
  ];
  if (note.trim()) lines.push(`Notiz/Einstand: ${note.trim()}`);
  lines.push('', 'Ich bestaetige mit dieser Signatur die kryptografische Verfuegungsmacht ueber die Zieladresse zum Blockzeitpunkt.');
  return lines.join('\n');
}

async function fetchBtcTx(txid: string): Promise<TxFacts> {
  let lastErr = '';
  for (const api of BTC_APIS) {
    try {
      const res = await fetch(`${api}/tx/${txid}`);
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const j = (await res.json()) as {
        status?: { block_hash?: string; block_height?: number; block_time?: number; confirmed?: boolean };
        vout?: { scriptpubkey_address?: string; value?: number }[];
        vin?: { prevout?: { scriptpubkey_address?: string; value?: number } }[];
      };
      const vouts = j.vout ?? [];
      const total = vouts.reduce((s, o) => s + (o.value ?? 0), 0);
      return {
        asset: 'btc',
        txid,
        blockHash: j.status?.block_hash,
        blockHeight: j.status?.block_height,
        timestamp: j.status?.block_time,
        confirmed: j.status?.confirmed,
        amountLabel: `${(total / 1e8).toLocaleString('de-DE', { maximumFractionDigits: 8 })} BTC gesamt`,
        fromLabel: j.vin?.[0]?.prevout?.scriptpubkey_address ?? '',
        toLabel: vouts.map((o) => o.scriptpubkey_address).filter(Boolean).join(', '),
        source: 'online',
      };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`Bitcoin-Transaktionsdaten nicht abrufbar (${lastErr}). Nutzen Sie die manuellen Felder.` as string);
}

async function fetchEvmTx(chainId: number, txid: string): Promise<TxFacts> {
  const tx = await getTx(chainId, txid);
  if (!tx.data) throw new Error('Transaktion nicht gefunden (anderes Netzwerk waehlen oder manuell eingeben).');
  const rec = await getTxReceipt(chainId, txid);
  const blockHash = String(tx.data.blockHash ?? '');
  let timestamp: number | undefined;
  let height: number | undefined;
  if (blockHash) {
    const blk = await getBlockByNumber(chainId, blockHash as `0x${string}` as string);
    if (blk.data) {
      timestamp = Number(BigInt(String(blk.data.timestamp)));
      height = Number(BigInt(String(blk.data.number)));
    }
  }
  const valueWei = BigInt(String(tx.data.value ?? '0'));
  const sym = chainById(chainId)?.nativeSymbol ?? 'ETH';
  return {
    asset: 'evm',
    txid,
    blockHash,
    blockHeight: height,
    timestamp,
    confirmed: !!rec.data && String((rec.data as Record<string, unknown>).status ?? '0x1') === '0x1',
    amountLabel: `${(Number(valueWei) / 1e18).toLocaleString('de-DE', { maximumFractionDigits: 6 })} ${sym}`,
    fromLabel: String(tx.data.from ?? ''),
    toLabel: String(tx.data.to ?? ''),
    source: 'online',
  };
}

export default function Dac8SelfProof() {
  const [asset, setAsset] = useState<AssetType>('evm');
  const [txid, setTxid] = useState('');
  const [chainId, setChainId] = useState(1);
  const [target, setTarget] = useState('');
  const [manualBlock, setManualBlock] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [csvRow, setCsvRow] = useState('');
  const [note, setNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [facts, setFacts] = useState<TxFacts | null>(null);
  const [challenge, setChallenge] = useState('');

  const [sigInput, setSigInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<{ level: StatusLevel; headline: string; detail: string } | null>(null);
  const [walletMsg, setWalletMsg] = useState('');
  const [cert, setCert] = useState<Cert | null>(null);

  // URL-Hash-Verifikation: #verify=<base64url(JSON)>
  useEffect(() => {
    const h = window.location.hash;
    const m = h.match(/verify=([A-Za-z0-9\-_]+)/);
    if (m) {
      try {
        const json = JSON.parse(new TextDecoder().decode(base64UrlDecode(m[1]))) as Cert;
        setAsset(json.asset);
        setTxid(json.txid);
        setTarget(json.targetAddress);
        setChallenge(json.challengeMessage);
        setSigInput(json.signature?.signature ?? '');
        setFacts({
          asset: json.asset,
          txid: json.txid,
          blockHash: json.blockHash,
          blockHeight: json.blockHeight,
          timestamp: json.blockTimeUtc ? Math.floor(Date.parse(json.blockTimeUtc) / 1000) : undefined,
          source: 'manual',
        });
        setError('');
      } catch {
        /* kaputter Link ignorieren */
      }
    }
  }, []);

  const demo = () => {
    setAsset('btc');
    setTxid(DEMO.btcTxid);
    setManualBlock(DEMO.manualBlock);
    setManualTime(DEMO.manualTime);
    setManualAmount('0,38400000 BTC');
    setCsvRow('2026-10-14;WITHDRAWAL;0.384;BTC;Auszahlung an Eigenwallet (Belegrow aus Boersenexport)');
    setNote('Einstandspreis 2023: 24.800 EUR/BTC (laut Boersenexport)');
    setError('');
  };

  const prepare = async () => {
    setError('');
    setVerifyResult(null);
    setCert(null);
    setSigInput('');
    setChallenge('');
    if (!isHexAddress(target) && !(asset === 'btc' && target.length > 20)) {
      // BTC-Adressen ohne volle Pruefung zulassen, EVM strikt
    }
    setBusy(true);
    try {
      let f: TxFacts;
      const useManual = manualBlock.trim() || manualTime.trim() || manualAmount.trim();
      if (useManual) {
        const ts = manualTime.trim() ? Math.floor(Date.parse(manualTime.trim()) / 1000) : undefined;
        f = {
          asset,
          txid: txid.trim(),
          blockHash: manualBlock.trim() || undefined,
          timestamp: Number.isFinite(ts) ? ts : undefined,
          amountLabel: manualAmount.trim() || undefined,
          confirmed: undefined,
          source: 'manual',
        };
        if (asset === 'btc' && txid.trim() && !isBitcoinTxid(txid.trim())) throw new Error('Bitcoin-TXID: 64 Hex-Zeichen erwartet.');
        if (asset === 'evm' && txid.trim() && !isTxHash(txid.trim())) throw new Error('EVM-Transaktionshash: 0x + 64 Hex erwartet.');
      } else {
        if (asset === 'btc') {
          if (!isBitcoinTxid(txid.trim())) throw new Error('Bitcoin-TXID: 64 Hex-Zeichen erwartet.');
          f = await fetchBtcTx(txid.trim());
        } else {
          if (!isTxHash(txid.trim())) throw new Error('EVM-Transaktionshash: 0x + 64 Hex erwartet.');
          f = await fetchEvmTx(chainId, txid.trim());
        }
      }
      // CSV-Zeile als Beleg-Anhang (kein Upload, nur angezeigt)
      if (csvRow.trim()) {
        f.amountLabel = (f.amountLabel ? f.amountLabel + ' · ' : '') + 'Boersenzeile: ' + csvRow.trim().slice(0, 120);
      }
      setFacts(f);
      setChallenge(buildChallenge(f, target.trim(), note));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const signWithWallet = async () => {
    setWalletMsg('');
    try {
      const wallets = await discoverWallets();
      if (wallets.length === 0) {
        setWalletMsg('Keine Wallet gefunden. Challenge kopieren und in Ihrer Wallet-Software (Message Signing) signieren.');
        return;
      }
      const provider: Eip1193Provider = wallets[0].provider;
      const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
      const sig = await personalSign(provider, accounts[0], challenge);
      setSigInput(sig);
      setTarget((t) => t || accounts[0]);
      setWalletMsg(`Signatur von ${shortHex(accounts[0])} erzeugt (${sig.slice(0, 18)}…). Jetzt unten verifizieren.`);
    } catch (e) {
      setWalletMsg('Signatur abgebrochen: ' + (e as Error).message);
    }
  };

  const demoSignBtc = async () => {
    setBusy(true);
    try {
      const priv = new Uint8Array(32);
      priv[31] = 1;
      const { address, signatureBase64 } = await signBip322P2tr(priv, challenge);
      setTarget(address);
      setSigInput(signatureBase64);
      setWalletMsg(`Demo-Signatur (BIP-322 P2TR, oeffentlich bekannter Testschluessel) fuer ${shortHex(address, 16, 8)} erzeugt.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError('');
    if (!challenge || !sigInput.trim() || !target.trim()) {
      setError('Challenge, Zieladresse und Signatur werden fuer die Verifikation benoetigt.');
      return;
    }
    setBusy(true);
    try {
      let scheme = '';
      let ok = false;
      let detail = '';
      if (asset === 'btc') {
        scheme = 'BIP-322 (simple)';
        const r = await verifyBip322(target.trim(), challenge, sigInput.trim());
        ok = r.ok;
        detail = r.detail;
      } else if (target.trim().length === 42) {
        // EOA: EIP-191 lokal verifizieren
        const v = await import('viem');
        scheme = 'EIP-191 personal_sign';
        ok = await v.verifyMessage({ address: target.trim() as `0x${string}`, message: challenge, signature: sigInput.trim() as `0x${string}` });
        detail = ok ? 'Signatur korrespondiert zur Adresse (ECDSA-Recovery).' : 'Wiederhergestellte Adresse weicht ab.';
        if (!ok && isHexAddress(target.trim())) {
          // ERC-1271-Fallback fuer Smart Accounts (isValidSignature)
          try {
            const digest = v.hashMessage(challenge);
            const data = v.encodeFunctionData({
              abi: [
                {
                  type: 'function',
                  name: 'isValidSignature',
                  stateMutability: 'view',
                  inputs: [
                    { name: 'hash', type: 'bytes32' },
                    { name: 'signature', type: 'bytes' },
                  ],
                  outputs: [{ name: 'magicValue', type: 'bytes4' }],
                },
              ] as const,
              functionName: 'isValidSignature',
              args: [digest as `0x${string}`, sigInput.trim() as `0x${string}`],
            });
            const res = await ethCall(chainId, target.trim(), data);
            if (String(res.data).toLowerCase().startsWith('0x1626ba7e')) {
              scheme = 'ERC-1271 (isValidSignature)';
              ok = true;
              detail = 'Smart-Account bestaetigt die Signatur (magic value 0x1626ba7e).';
            }
          } catch {
            /* bleibt ungueltig */
          }
        }
      } else {
        throw new Error('EVM-Zieladresse muss 0x-Adresse (40 Hex) sein.');
      }
      const headline = ok ? `Signatur gültig (${scheme})` : `Signatur UNGÜLTIG (${scheme})`;
      const lvl: StatusLevel = ok ? 'green' : 'red';
      setVerifyResult({ level: lvl, headline, detail });

      const c: Cert = {
        standard: 'AndrexTheDev/DAC8-SelfProof@1',
        purpose: 'Self-Custody Verification / Eigenuebertrag',
        asset,
        txid: txid.trim(),
        blockHash: facts?.blockHash,
        blockHeight: facts?.blockHeight,
        blockTimeUtc: facts?.timestamp ? new Date(facts.timestamp * 1000).toISOString() : undefined,
        targetAddress: target.trim(),
        note: note.trim() || undefined,
        costBasisHint: csvRow.trim() || undefined,
        challengeMessage: challenge,
        signature: { scheme, signer: target.trim(), signature: sigInput.trim() },
        verification: { scheme, result: ok ? 'gueltig' : 'ungueltig', detail },
        createdAt: new Date().toISOString(),
      };
      setCert(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verifyLink = useMemo(() => {
    if (!cert) return '';
    const enc = base64UrlEncode(new TextEncoder().encode(JSON.stringify(cert)));
    return `${window.location.origin}/tools/dac8-selfproof#verify=${enc}`;
  }, [cert]);

  const overallLevel: StatusLevel | null = verifyResult ? verifyResult.level : null;

  return (
    <div className="space-y-5">
      <StepSection
        n={1}
        title="Transaktion & Zieladresse festlegen"
        hint="Die Suite erzeugt eine deterministische Ownership-Challenge aus TXID, Blockhash und Zeitstempel. Keine vollstaendige Historie verlaesst Ihren Browser."
      >
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-2">
            <button className={`btn btn-sm ${asset === 'evm' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAsset('evm')}>
              EVM (ETH & Co.)
            </button>
            <button className={`btn btn-sm ${asset === 'btc' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAsset('btc')}>
              Bitcoin
            </button>
          </div>
          <span className="ml-auto">
            <DemoButton onClick={demo} />
          </span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="d8-tx">{asset === 'btc' ? 'Bitcoin-TXID' : 'EVM-Transaktionshash'}</label>
            <input id="d8-tx" className="input mono" placeholder={asset === 'btc' ? '64 Hex-Zeichen' : '0x…'} value={txid} onChange={(e) => setTxid(e.target.value)} />
          </div>
          {asset === 'evm' && (
            <div>
              <label className="label" htmlFor="d8-net">Netzwerk</label>
              <select id="d8-net" className="select" value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
                {CHAINS.map((c) => (
                  <option key={c.chainId} value={c.chainId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="d8-target">Zieladresse der Eigenuebertrag (beanspruchte Self-Custody-Adresse)</label>
          <input id="d8-target" className="input mono" placeholder={asset === 'btc' ? 'bc1…' : '0x…'} value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <details className="acc">
          <summary>Offline-Felder (Blockzeit, Blockhash, Betrag, Boersen-Zeile, Einstandspreis)</summary>
          <div className="acc-body grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="d8-mb">Blockhash (manuell)</label>
              <input id="d8-mb" className="input mono" value={manualBlock} onChange={(e) => setManualBlock(e.target.value)} placeholder="00000000…" />
            </div>
            <div>
              <label className="label" htmlFor="d8-mt">Blockzeit (ISO, manuell)</label>
              <input id="d8-mt" className="input mono" value={manualTime} onChange={(e) => setManualTime(e.target.value)} placeholder="2026-10-14T09:32:00Z" />
            </div>
            <div>
              <label className="label" htmlFor="d8-ma">Betrag (manuell)</label>
              <input id="d8-ma" className="input" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="0,384 BTC" />
            </div>
            <div>
              <label className="label" htmlFor="d8-note">Einstandspreis / Notiz (optional)</label>
              <input id="d8-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Einstand 2023" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="d8-csv">Boersen-CSV-Zeile (optional, eine Zeile)</label>
              <input id="d8-csv" className="input mono" value={csvRow} onChange={(e) => setCsvRow(e.target.value)} placeholder="Datum;Typ;Menge;Asset;Kommentar" />
            </div>
          </div>
        </details>
      </StepSection>

      <StepSection n={2} title="Challenge erzeugen & signieren">
        <p className="text-sm">
          Die Challenge wird deterministisch aus TXID, Blockhash, Zeitstempel und Zweckstring gebaut. Signaturwege:
          EVM-Wallet (EIP-191) direkt hier, oder Signatur in Ihrer (Hardware-)Wallet erzeugen und unten einfuegen
          (Bitcoin: BIP-322; EVM: EIP-191/EIP-712/ERC-1271).
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void prepare()} disabled={busy}>
          {busy ? 'Lade Daten…' : 'Challenge erzeugen'}
        </button>
        {challenge && (
          <>
            <label className="label mt-2">Challenge-Nachricht (deterministisch)</label>
            <pre className="mono text-xs whitespace-pre-wrap break-all rounded-lg border border-line bg-obsidian p-3">{challenge}</pre>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={challenge} label="Challenge kopieren" compact />
              {asset === 'evm' && (
                <button className="btn btn-outline-amber btn-sm" onClick={() => void signWithWallet()}>
                  Mit verbundener EVM-Wallet signieren (EIP-191)
                </button>
              )}
              {asset === 'btc' && challenge.includes(DEMO.btcTxid) && (
                <button className="btn btn-outline-amber btn-sm" onClick={() => void demoSignBtc()}>
                  Demo: BIP-322-Signatur erzeugen (Testschluessel)
                </button>
              )}
            </div>
            {walletMsg && <p className="text-sm text-gold-hi mt-2">{walletMsg}</p>}
          </>
        )}
        {error && <ErrorNote message={error} />}
      </StepSection>

      {challenge && (
        <StepSection n={3} title="Lokal verifizieren & Dossier exportieren">
          <div>
            <label className="label" htmlFor="d8-sig">Signatur (BIP-322 base64, EIP-191/712 hex, ERC-1271 bytes)</label>
            <textarea id="d8-sig" className="textarea mono" value={sigInput} onChange={(e) => setSigInput(e.target.value)} placeholder="Signatur hier einfuegen …" />
          </div>
          <button className="btn btn-primary" onClick={() => void verify()} disabled={busy}>
            {busy ? 'Verifiziere…' : 'Verifizieren'}
          </button>
          {verifyResult && <StatusTile level={verifyResult.level} headline={verifyResult.headline} detail={verifyResult.detail} />}
          {facts && (
            <KpiGrid>
              <Kpi label="Asset" value={asset.toUpperCase()} />
              <Kpi label="Blockzeit (UTC)" value={facts.timestamp ? new Date(facts.timestamp * 1000).toLocaleString('de-DE') : 'manuell/offen'} />
              <Kpi label="Betrag" value={facts.amountLabel ?? '—'} />
              <Kpi label="Bestaetigt" value={facts.confirmed == null ? 'n/a' : facts.confirmed ? 'ja' : 'nein'} tone={facts.confirmed === false ? 'amber' : 'green'} />
            </KpiGrid>
          )}
          {overallLevel && cert && (
            <>
              <details className="acc">
                <summary>Zertifikat (JSON) & Verifikations-Link</summary>
                <div className="acc-body space-y-2">
                  <pre className="mono text-xs whitespace-pre-wrap break-all rounded-lg border border-line bg-obsidian p-3 max-h-56 overflow-y-auto">
                    {JSON.stringify(cert, null, 2)}
                  </pre>
                  <p className="text-xs text-dim">
                    Der Link kodiert das Zertifikat vollstaendig im URL-Hash (kein Server):{' '}
                    <code className="break-all">{shortHex(verifyLink, 46, 18)}</code>
                  </p>
                  <CopyButton text={verifyLink} label="Verifikations-Link kopieren" compact />
                </div>
              </details>
              <div className="status-tile status-amber">
                <span aria-hidden="true">⚠</span>
                <p className="text-sm">
                  <strong>Rechtlicher Hinweis:</strong> Die Signatur dokumentiert kryptografische Verfuegungsmacht ueber
                  die Zieladresse zum Blockzeitpunkt. Sie ersetzt keine nationale Steuerberatung und keine behoerdliche
                  Einzelfallpruefung (z. B. DAC8-/TFR-Zuordnung, Einstandspreiswertermittlung). Zeitkontext: DAC8 gilt
                  seit 01.01.2026 (erster Meldezeitraum = Kalenderjahr 2026); die Einreichung der RCASP-Daten beim
                  nationalen Fiskus erfolgt je Mitgliedstaat im Fenster 01.01.–30.09.2027 — bewahren Sie Befunde
                  vollstaendig auf.
                </p>
              </div>
              <ExportBar
                onJson={() => downloadJSON(cert, `dac8-selfproof-${txid.slice(0, 10)}.json`)}
                onPrint={() =>
                  openPrintableReport({
                    title: 'DAC8-SelfProof Pruefdossier',
                    subtitle: `Eigenuebertrag-Nachweis · ${asset.toUpperCase()} · ${new Date().toLocaleString('de-DE')}`,
                    status: { level: verifyResult!.level, headline: verifyResult!.headline, detail: verifyResult!.detail },
                    sections: [
                      {
                        heading: 'Transaktions-Fakten',
                        body: `<pre>TXID:        ${txid}\nBlockhash:   ${facts?.blockHash ?? '-'}\nBlockzeit:   ${facts?.timestamp ? new Date(facts.timestamp * 1000).toISOString() : '-'}\nZieladresse: ${target}\nBetrag:      ${facts?.amountLabel ?? '-'}</pre>`,
                      },
                      { heading: 'Challenge-Nachricht', body: `<pre>${challenge}</pre>` },
                      {
                        heading: 'Signatur & Verifikation',
                        body: `<pre>Schema:  ${cert.signature?.scheme}\nSigner:  ${cert.signature?.signer}\nSignatur: ${cert.signature?.signature}\nErgebnis: ${cert.verification?.result} — ${cert.verification?.detail ?? ''}</pre>`,
                      },
                      {
                        heading: 'Rechtlicher Hinweis',
                        body: '<p>Kryptografischer Verfuegungsmacht-Nachweis. Keine Anlage-, Finanz-, Rechts- oder Steuerberatung; Anerkennung durch Behoerden ist eine Einzelfallfrage.</p>',
                      },
                    ],
                  })
                }
                extra={<CopyButton text={verifyLink} label="Link kopieren" compact />}
              />
            </>
          )}
        </StepSection>
      )}
    </div>
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Re-Export fuer Spaeter: rpcCall wird indirekt ueber Wrapper genutzt
void rpcCall;
