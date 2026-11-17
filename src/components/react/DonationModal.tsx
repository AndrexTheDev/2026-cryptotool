import { useEffect, useMemo, useState } from 'react';
import { useFocusTrap } from './useFocusTrap';
import QrCode from './QrCode';
import { DONATION_CHAINS, donationUri, type DonationChain } from '../../lib/donation';
import { chunkAddress } from '../../config/site';
import { discoverWallets, switchChain, type Eip1193Provider } from '../../lib/wallet';

export const DONATE_EVENT = 'atd:donate:open';

export function openDonationModal() {
  window.dispatchEvent(new CustomEvent(DONATE_EVENT));
}

const SUGGESTED: Record<DonationChain, string[]> = {
  eth: ['0.005', '0.02'],
  sol: ['0.05', '0.2'],
  btc: ['0.0002', '0.001'],
};

export default function DonationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  // also usable as a standalone page: /donate (static shell via wrapper)
  const [chain, setChain] = useState<DonationChain>('eth');
  const [amount, setAmount] = useState('');
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [sendMsg, setSendMsg] = useState('');

  const entry = DONATION_CHAINS.find((c) => c.id === chain)!;
  const uri = useMemo(() => donationUri(chain, amount || undefined, raw && chain === 'eth'), [chain, amount, raw]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setSendState('idle');
      setSendMsg('');
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the selection stays visible */
    }
  };

  const directSend = async () => {
    setSendState('sending');
    setSendMsg('');
    try {
      const wallets = await discoverWallets();
      if (wallets.length === 0) {
        setSendState('error');
        setSendMsg('No wallet found in the browser. Use the QR code or copy instead.');
        return;
      }
      if (chain !== 'eth') {
        setSendState('error');
        setSendMsg(
          `Direct sending is only implemented for Ethereum/EVM here, because no ${entry.symbol} provider was injected. Please scan the QR code with your ${entry.symbol} wallet.`,
        );
        return;
      }
      const w0 = wallets[0];
      if (!w0) {
        setSendState('error');
        setSendMsg('No wallet provider found. Use the QR code or copy instead.');
        return;
      }
      const provider: Eip1193Provider = w0.provider;
      if (!amount || Number(amount) <= 0) {
        setSendState('error');
        setSendMsg('Please enter an amount first.');
        return;
      }
      try {
        await switchChain(provider, 1);
      } catch {
        /* wallet stays on the current chain — the user decides there */
      }
      const accounts = (await provider.request<string[]>({ method: 'eth_requestAccounts' })) as string[];
      const wei = BigInt(Math.round(Number(amount) * 1e6)) * 10n ** 12n;
      await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: accounts[0], to: entry.address, value: '0x' + wei.toString(16) }],
      });
      setSendState('done');
      setSendMsg('Transaction handed to your wallet. Thank you for the support!');
    } catch (e) {
      setSendState('error');
      setSendMsg((e as Error).message || 'Signature aborted.');
    }
  };

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Support StackAutopsy"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-b-xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg">Support StackAutopsy</h2>
            <p className="text-sm mt-1">
              The suite is funded by voluntary on-chain support from the community. Independent, no account,
              no tracking.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex gap-2 mt-4" role="tablist" aria-label="Choose network">
          {DONATION_CHAINS.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={chain === c.id}
              className={`btn btn-sm flex-1 ${chain === c.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => {
                setChain(c.id);
                setSendState('idle');
                setSendMsg('');
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-col items-center gap-4">
          <QrCode value={uri} />
          <p className="text-xs text-dim break-all text-center mono max-w-md">{uri}</p>
          {chain === 'eth' && (
            <label className="flex items-center gap-2 text-xs text-dim cursor-pointer">
              <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
              Raw address only in the QR — more reliable for some mobile wallets
            </label>
          )}
        </div>

        <div className="mt-4">
          <span className="label">Recipient address ({entry.symbol})</span>
          <div className="flex flex-wrap gap-1.5 justify-center rounded-lg border border-line bg-obsidian p-3">
            {chunkAddress(entry.address).map((part, i) => (
              <span key={i} className="mono text-sm text-ink tracking-wide">
                {part}
              </span>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-ghost btn-sm flex-1" onClick={() => void copy(entry.address)}>
              {copied ? '✓ Copied — please verify visually' : 'Copy address'}
            </button>
          </div>
          <p className="text-xs text-dim mt-2">
            Anti-phishing: always check the first and last characters — {entry.address.slice(0, 6)} …{' '}
            {entry.address.slice(-4)}.
          </p>
        </div>

        <div className="mt-4">
          <span className="label">Amount ({entry.symbol}, optional)</span>
          <div className="flex gap-2">
            {SUGGESTED[chain].map((s) => (
              <button
                key={s}
                className={`btn btn-sm ${amount === s ? 'btn-outline-amber' : 'btn-ghost'}`}
                onClick={() => setAmount(s)}
              >
                {s}
              </button>
            ))}
            <input
              className="input flex-1"
              inputMode="decimal"
              placeholder="Custom amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
            />
          </div>
        </div>

        <button className="btn btn-primary w-full mt-4" onClick={() => void directSend()} disabled={sendState === 'sending'}>
          {sendState === 'sending' ? 'Wallet signature in progress…' : 'Send directly from your own wallet'}
        </button>
        {sendMsg && (
          <p className={`text-sm mt-2 ${sendState === 'done' ? 'text-prime-hi' : 'text-gold-hi'}`}>{sendMsg}</p>
        )}

        <p className="text-xs text-dim mt-4 leading-relaxed border-t border-line pt-3">
          Legal clarification: donations are 100&nbsp;% voluntary, create no entitlement to support,
          SLAs or consideration, and unlock no gated features. On-chain transactions are technically
          final and cannot be charged back. Full details: see the terms (AGB) and disclaimer.
        </p>
      </div>
    </div>
  );
}
