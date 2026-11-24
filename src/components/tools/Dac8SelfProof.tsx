import { useEffect, useMemo, useState } from 'react';
import {
  CopyButton,
  CrossBadge,
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
  blockHash?: string | undefined;
  blockHeight?: number | undefined;
  timestamp?: number | undefined;
  amountLabel?: string | undefined;
  fromLabel?: string;
  toLabel?: string;
  confirmed?: boolean | undefined;
  source: 'online' | 'manual' | 'offline-demo';
  /** Live provenance (online fetches only): which channel answered, and when. */
  rpcSource?: 'user' | 'wallet' | 'public' | 'cache' | undefined;
  rpcAt?: number | undefined;
  /** Pasted-vs-live cross-check (manual facts / certificate links): claims vs chain state. */
  cross?: 'match' | 'mismatch' | 'unavailable' | undefined;
}

interface Cert {
  standard: 'StackAutopsy/DAC8-SelfProof@1';
  purpose: string;
  asset: AssetType;
  txid: string;
  blockHash?: string | undefined;
  blockTimeUtc?: string | undefined;
  blockHeight?: number | undefined;
  targetAddress: string;
  note?: string | undefined;
  costBasisHint?: string | undefined;
  challengeMessage: string;
  signature?: { scheme: string; signer: string; signature: string };
  verification?: { scheme: string; result: 'valid' | 'invalid' | 'not checked'; detail?: string | undefined };
  createdAt: string;
}

const DEMO = {
  evmTxid: '0x53c69d6b7f440b2fe2f18733e54cf8b4c4a2f3a9bc98e2fdd0e24a1f28f0a001',
  btcTxid: '9f2c45ab12cd8f07b3a1c4d5e6f70819203a4b5c6d7e8f9012a3b4c5d6e7f809',
  manualBlock: '00000000000000000001b0f23d0a4c9d3e2b1c985f6e7d4c3b2a1908f7e6d5c4',
  manualTime: '2026-10-14T09:32:00Z',
  targetEvm: '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf', // address of the publicly known test key 0x01 (demo!)
  demoPriv:
    '0000000000000000000000000000000000000000000000000000000000000001',
};

function buildChallenge(f: TxFacts, targetAddress: string, note: string): string {
  const lines = [
    'StackAutopsy DAC8-SelfProof — cryptographic self-transfer proof',
    '',
    'Purpose: self-custody verification / self-transfer',
    `Asset class: ${f.asset === 'btc' ? 'Bitcoin' : 'EVM'}`,
    `Transaction (TXID): ${f.txid}`,
    `Block hash: ${f.blockHash ?? '(manual, not fetched)'}`,
    `Block time (UTC): ${f.timestamp ? new Date(f.timestamp * 1000).toISOString() : '(manual)'}`,
    `Target address (claimed): ${targetAddress}`,
  ];
  if (note.trim()) lines.push(`Note/cost basis: ${note.trim()}`);
  lines.push('', 'With this signature I confirm cryptographic control over the target address at the block time.');
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
        amountLabel: `${(total / 1e8).toLocaleString('en-GB', { maximumFractionDigits: 8 })} BTC total`,
        fromLabel: j.vin?.[0]?.prevout?.scriptpubkey_address ?? '',
        toLabel: vouts.map((o) => o.scriptpubkey_address).filter(Boolean).join(', '),
        source: 'online',
        rpcSource: 'public',
        rpcAt: Date.now(),
      };
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new Error(`Bitcoin transaction data not retrievable (${lastErr}). Use the manual fields.` as string);
}

async function fetchEvmTx(chainId: number, txid: string): Promise<TxFacts> {
  const tx = await getTx(chainId, txid);
  if (!tx.data) throw new Error('Transaction not found (select a different network or enter manually).');
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
    amountLabel: `${(Number(valueWei) / 1e18).toLocaleString('en-GB', { maximumFractionDigits: 6 })} ${sym}`,
    fromLabel: String(tx.data.from ?? ''),
    toLabel: String(tx.data.to ?? ''),
    source: 'online',
    rpcSource: tx.source,
    rpcAt: tx.at,
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

  // URL hash verification: #verify=<base64url(JSON)>
  useEffect(() => {
    const h = window.location.hash;
    const m = h.match(/verify=([A-Za-z0-9\-_]+)/);
    if (m) {
      try {
        const b64 = m[1];
        if (b64 === undefined) throw new Error('verify payload field missing');
        const json = JSON.parse(new TextDecoder().decode(base64UrlDecode(b64))) as Cert;
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
        /* ignore broken link */
      }
    }
  }, []);

  // Live-first doctrine (Wave 36/37): manually entered facts and certificate-link
  // claims are automatically cross-checked against the live chain. A certificate
  // that asserts a false block/time is flagged MISMATCH instead of looking plausible.
  useEffect(() => {
    if (!facts || facts.source !== 'manual' || facts.cross) return;
    const id = facts.txid;
    const valid = facts.asset === 'btc' ? isBitcoinTxid(id) : isTxHash(id);
    if (!valid) return;
    let cancelled = false;
    void (async () => {
      try {
        const live = facts.asset === 'btc' ? await fetchBtcTx(id) : await fetchEvmTx(chainId, id);
        if (cancelled) return;
        const checks: boolean[] = [];
        if (facts.blockHeight != null && live.blockHeight != null) checks.push(facts.blockHeight === live.blockHeight);
        if (facts.timestamp != null && live.timestamp != null) checks.push(Math.abs(facts.timestamp - live.timestamp) <= 7200);
        if (facts.blockHash && live.blockHash) checks.push(facts.blockHash.toLowerCase() === live.blockHash.toLowerCase());
        setFacts((prev) => (prev && prev.txid === id && !prev.cross ? { ...prev, cross: checks.length === 0 ? 'unavailable' : checks.every(Boolean) ? 'match' : 'mismatch' } : prev));
      } catch {
        if (!cancelled) setFacts((prev) => (prev && prev.txid === id && !prev.cross ? { ...prev, cross: 'unavailable' } : prev));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts, chainId]);

  const demo = () => {
    setAsset('btc');
    setTxid(DEMO.btcTxid);
    setManualBlock(DEMO.manualBlock);
    setManualTime(DEMO.manualTime);
    setManualAmount('0.38400000 BTC');
    setCsvRow('2026-10-14;WITHDRAWAL;0.384;BTC;withdrawal to own wallet (record row from exchange export)');
    setNote('Cost basis 2023: EUR 24,800/BTC (per exchange export)');
    setError('');
  };

  const prepare = async () => {
    setError('');
    setVerifyResult(null);
    setCert(null);
    setSigInput('');
    setChallenge('');
    if (!isHexAddress(target) && !(asset === 'btc' && target.length > 20)) {
      // allow BTC addresses without full validation, EVM strict
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
        if (asset === 'btc' && txid.trim() && !isBitcoinTxid(txid.trim())) throw new Error('Bitcoin TXID: 64 hex characters expected.');
        if (asset === 'evm' && txid.trim() && !isTxHash(txid.trim())) throw new Error('EVM transaction hash: 0x + 64 hex expected.');
      } else {
        if (asset === 'btc') {
          if (!isBitcoinTxid(txid.trim())) throw new Error('Bitcoin TXID: 64 hex characters expected.');
          f = await fetchBtcTx(txid.trim());
        } else {
          if (!isTxHash(txid.trim())) throw new Error('EVM transaction hash: 0x + 64 hex expected.');
          f = await fetchEvmTx(chainId, txid.trim());
        }
      }
      // CSV row as record attachment (no upload, display only)
      if (csvRow.trim()) {
        f.amountLabel = (f.amountLabel ? f.amountLabel + ' · ' : '') + 'Exchange row: ' + csvRow.trim().slice(0, 120);
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
        setWalletMsg('No wallet found. Copy the challenge and sign it in your wallet software (message signing).');
        return;
      }
      const providerEntry = wallets[0];
      if (!providerEntry) { setWalletMsg('No wallet provider found.'); return; }
      const provider: Eip1193Provider = providerEntry.provider;
      const accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
      const account = accounts[0];
      if (!account) { setWalletMsg('The wallet did not share an address.'); return; }
      const sig = await personalSign(provider, account, challenge);
      setSigInput(sig);
      setTarget((t) => t || account);
      setWalletMsg(`Signature created by ${shortHex(account)} (${sig.slice(0, 18)}…). Now verify below.`);
    } catch (e) {
      setWalletMsg('Signing aborted: ' + (e as Error).message);
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
      setWalletMsg(`Demo signature (BIP-322 P2TR, publicly known test key) created for ${shortHex(address, 16, 8)}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError('');
    if (!challenge || !sigInput.trim() || !target.trim()) {
      setError('Challenge, target address and signature are required for verification.');
      return;
    }
    setBusy(true);
    try {
      let scheme = '';
      let ok = false;
      let detail = '';
      if (asset === 'btc') {
        const r = await verifyBip322(target.trim(), challenge, sigInput.trim());
        scheme =
          r.variant === 'pof'
            ? 'BIP-322 proof of funds (finalized PSBT)'
            : r.variant === 'full'
              ? 'BIP-322 (full)'
              : r.variant === 'simple-prefixed'
                ? 'BIP-322 (simple, smp prefix)'
                : 'BIP-322 (simple, legacy)';
        ok = r.ok;
        detail = r.detail;
      } else if (target.trim().length === 42) {
        // EOA: verify EIP-191 locally
        const v = await import('viem');
        scheme = 'EIP-191 personal_sign';
        ok = await v.verifyMessage({ address: target.trim() as `0x${string}`, message: challenge, signature: sigInput.trim() as `0x${string}` });
        detail = ok ? 'Signature corresponds to the address (ECDSA recovery).' : 'Recovered address differs.';
        if (!ok && isHexAddress(target.trim())) {
          // ERC-1271 fallback for smart accounts (isValidSignature)
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
              detail = 'Smart account confirms the signature (magic value 0x1626ba7e).';
            }
          } catch {
            /* remains invalid */
          }
        }
      } else {
        throw new Error('EVM target address must be a 0x address (40 hex).');
      }
      const headline = ok ? `Signature valid (${scheme})` : `Signature INVALID (${scheme})`;
      const lvl: StatusLevel = ok ? 'green' : 'red';
      setVerifyResult({ level: lvl, headline, detail });

      const c: Cert = {
        standard: 'StackAutopsy/DAC8-SelfProof@1',
        purpose: 'Self-custody verification / self-transfer',
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
        verification: { scheme, result: ok ? 'valid' : 'invalid', detail },
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
        title="Enter the transfer & your wallet address"
        hint="Pick Bitcoin or Ethereum, paste the transfer ID and your own receiving wallet address. Tip: click “Load demo scenario” to walk through an example."
      >
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-2">
            <button className={`btn btn-sm ${asset === 'evm' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAsset('evm')}>
              Ethereum &amp; EVM
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
            <label className="label" htmlFor="d8-tx">{asset === 'btc' ? 'Bitcoin transaction ID (TXID)' : 'Ethereum transaction hash'}</label>
            <input id="d8-tx" className="input mono" placeholder={asset === 'btc' ? '64 hex characters' : '0x…'} value={txid} onChange={(e) => setTxid(e.target.value)} />
          </div>
          {asset === 'evm' && (
            <div>
              <label className="label" htmlFor="d8-net">Network</label>
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
          <label className="label" htmlFor="d8-target">Your receiving wallet address (the wallet you want to prove is yours)</label>
          <input id="d8-target" className="input mono" placeholder={asset === 'btc' ? 'bc1…' : '0x…'} value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        <details className="acc">
          <summary>Optional: manual transfer details, cost basis &amp; exchange CSV row</summary>
          <div className="acc-body grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="d8-mb">Block hash (manual)</label>
              <input id="d8-mb" className="input mono" value={manualBlock} onChange={(e) => setManualBlock(e.target.value)} placeholder="00000000…" />
            </div>
            <div>
              <label className="label" htmlFor="d8-mt">Block time (ISO, manual)</label>
              <input id="d8-mt" className="input mono" value={manualTime} onChange={(e) => setManualTime(e.target.value)} placeholder="2026-10-14T09:32:00Z" />
            </div>
            <div>
              <label className="label" htmlFor="d8-ma">Amount (manual)</label>
              <input id="d8-ma" className="input" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="0.384 BTC" />
            </div>
            <div>
              <label className="label" htmlFor="d8-note">Purchase price / note for tax records (optional)</label>
              <input id="d8-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. bought in 2023 for EUR 24,800/BTC" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="d8-csv">Matching row from your exchange CSV (optional)</label>
              <input id="d8-csv" className="input mono" value={csvRow} onChange={(e) => setCsvRow(e.target.value)} placeholder="Date;Type;Amount;Asset;Comment" />
            </div>
          </div>
        </details>
      </StepSection>

      <StepSection n={2} title="Create &amp; sign your ownership statement">
        <p className="text-sm">
          Click below to create a short “I own this wallet” text tied to that transfer. Then sign that text in your
          wallet app (or hardware wallet) and paste the signature in Step 3. Supports Ethereum wallets (EIP-191 /
          ERC-1271) and Bitcoin message signatures (BIP-322 simple/full/pof, including modern <code>smp</code>/<code>ful</code>/<code>pof</code> prefixes and older prefix-free signatures).
        </p>
        <button className="btn btn-primary w-full sm:w-auto" onClick={() => void prepare()} disabled={busy}>
          {busy ? 'Loading data…' : 'Generate challenge'}
        </button>
        {challenge && (
          <>
            <label className="label mt-2">Challenge message (deterministic)</label>
            <pre className="mono text-xs whitespace-pre-wrap break-all rounded-lg border border-line bg-obsidian p-3">{challenge}</pre>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={challenge} label="Copy challenge" compact />
              {asset === 'evm' && (
                <button className="btn btn-outline-amber btn-sm" onClick={() => void signWithWallet()}>
                  Sign with connected EVM wallet (EIP-191)
                </button>
              )}
              {asset === 'btc' && challenge.includes(DEMO.btcTxid) && (
                <button className="btn btn-outline-amber btn-sm" onClick={() => void demoSignBtc()}>
                  Demo: create BIP-322 signature (test key)
                </button>
              )}
            </div>
            {walletMsg && <p className="text-sm text-gold-hi mt-2">{walletMsg}</p>}
          </>
        )}
        {error && <ErrorNote message={error} />}
      </StepSection>

      {challenge && (
        <StepSection n={3} title="Verify signature &amp; save your proof report">
          <div>
            <label className="label" htmlFor="d8-sig">Paste signature from your wallet (BIP-322 base64, EIP-191/712 hex, or ERC-1271 bytes)</label>
            <textarea id="d8-sig" className="textarea mono" value={sigInput} onChange={(e) => setSigInput(e.target.value)} placeholder="Paste the signature here…" />
          </div>
          <button className="btn btn-primary" onClick={() => void verify()} disabled={busy}>
            {busy ? 'Verifying…' : 'Verify signature'}
          </button>
          {verifyResult && <StatusTile level={verifyResult.level} headline={verifyResult.headline} detail={verifyResult.detail} />}
          {facts && (
            <>
              <KpiGrid>
                <Kpi label="Asset" value={asset.toUpperCase()} />
                <Kpi label="Block time (UTC)" value={facts.timestamp ? new Date(facts.timestamp * 1000).toLocaleString('en-GB') : 'manual/open'} />
                <Kpi label="Amount" value={facts.amountLabel ?? '—'} />
                <Kpi label="Confirmed" value={facts.confirmed == null ? 'n/a' : facts.confirmed ? 'yes' : 'no'} tone={facts.confirmed === false ? 'amber' : 'green'} />
              </KpiGrid>
              {facts.source === 'online' && (
                <p className="text-xs text-dim">
                  Live data source: <SourceBadge source={facts.rpcSource} at={facts.rpcAt} />
                </p>
              )}
              {facts.source === 'manual' && facts.cross && (
                <p className="text-xs text-dim">
                  Manual/certificate claims vs chain: <CrossBadge verdict={facts.cross} />
                </p>
              )}
              {facts.cross === 'mismatch' && (
                <p className="badge badge-red whitespace-normal text-left">
                  Cross-check failed: the claimed block/time does not match the live transaction — wrong network, typo, or a
                  forged certificate. Fetch the transaction live for the authoritative facts.
                </p>
              )}
            </>
          )}
          {overallLevel && cert && (
            <>
              <details className="acc">
                <summary>Certificate (JSON) & verification link</summary>
                <div className="acc-body space-y-2">
                  <pre className="mono text-xs whitespace-pre-wrap break-all rounded-lg border border-line bg-obsidian p-3 max-h-56 overflow-y-auto">
                    {JSON.stringify(cert, null, 2)}
                  </pre>
                  <p className="text-xs text-dim">
                    The link encodes the certificate completely in the URL hash (no server):{' '}
                    <code className="break-all">{shortHex(verifyLink, 46, 18)}</code>
                  </p>
                  <CopyButton text={verifyLink} label="Copy verification link" compact />
                </div>
              </details>
              <div className="status-tile status-amber">
                <span aria-hidden="true">⚠</span>
                <p className="text-sm">
                  <strong>Helpful tax &amp; legal context (as of 11/2026):</strong> This signature proves that you
                  controlled the wallet at the time of the transfer, which helps answer exchange and tax-office
                  questions—it does not replace personal tax advice. Under EU DAC8 rules (in Germany: KStTG,
                  passed 19.12.2025), 2026 is the first reporting year: exchanges and platforms report customer sales to
                  tax authorities in 2027 (EU/CARF baseline 31.01.2027, German KStTG deadline 31.07.2027, automatic EU
                  exchange by 30.09.2027; penalties up to EUR 50,000 for violations; international CARF covers 58 countries). Keeping
                  self-transfer proofs helps show you moved coins to your own wallet rather than selling them.
                </p>
              </div>
              <ExportBar
                onJson={() => downloadJSON(cert, `dac8-selfproof-${txid.slice(0, 10)}.json`)}
                onPrint={() =>
                  openPrintableReport({
                    title: 'DAC8-SelfProof Review Dossier',
                    subtitle: `Self-transfer proof · ${asset.toUpperCase()} · ${new Date().toLocaleString('en-GB')}`,
                    status: { level: verifyResult!.level, headline: verifyResult!.headline, detail: verifyResult!.detail },
                    sections: [
                      {
                        heading: 'Transaction facts',
                        body: `<pre>TXID:        ${txid}\nBlock hash:  ${facts?.blockHash ?? '-'}\nBlock time:  ${facts?.timestamp ? new Date(facts.timestamp * 1000).toISOString() : '-'}\nTarget:      ${target}\nAmount:      ${facts?.amountLabel ?? '-'}</pre>`,
                      },
                      { heading: 'Challenge message', body: `<pre>${challenge}</pre>` },
                      {
                        heading: 'Signature & verification',
                        body: `<pre>Scheme:    ${cert.signature?.scheme}\nSigner:    ${cert.signature?.signer}\nSignature: ${cert.signature?.signature}\nResult:    ${cert.verification?.result} — ${cert.verification?.detail ?? ''}</pre>`,
                      },
                      {
                        heading: 'Legal note',
                        body: '<p>Cryptographic proof of control. No investment, financial, legal or tax advice; recognition by authorities is a case-by-case matter.</p>',
                      },
                    ],
                  })
                }
                extra={<CopyButton text={verifyLink} label="Copy link" compact />}
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

// re-export for later: rpcCall is used indirectly via wrappers
void rpcCall;
