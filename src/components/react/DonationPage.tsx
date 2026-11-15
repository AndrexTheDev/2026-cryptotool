import { useState } from 'react';
import { DONATION_CHAINS, donationUri, type DonationChain } from '../../lib/donation';
import { chunkAddress } from '../../config/site';
import QrCode from './QrCode';

/**
 * Standalone-Spendenansicht fuer /donate (JS-freie Landing/Recht verlinken hierhin).
 * Identische Logik wie das Modal: QR lokal generiert (BIP-21 / Solana Pay / EIP-681),
 * Adressen in 4-Zeichen-Bloecken, Copy-Buttons. Freiwillig, ohne Gegenleistung.
 */
export default function DonationPage() {
  const [chain, setChain] = useState<DonationChain>('eth');
  const [amount, setAmount] = useState('');
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState<string>('');

  const entry = DONATION_CHAINS.find((c) => c.id === chain)!;
  const uri = donationUri(chain, amount || undefined, raw && chain === 'eth');

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* Clipboard blockiert */
    }
  };

  return (
    <div className="card p-6 max-w-2xl mx-auto">
      <div className="flex gap-2" role="tablist" aria-label="Netzwerk waehlen">
        {DONATION_CHAINS.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={chain === c.id}
            className={`btn btn-sm flex-1 ${chain === c.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setChain(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-center gap-4">
        <QrCode value={uri} />
        <p className="text-xs text-dim break-all text-center mono max-w-md">{uri}</p>
        {chain === 'eth' && (
          <label className="flex items-center gap-2 text-xs text-dim cursor-pointer">
            <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
            Nur Adresse (Raw) im QR
          </label>
        )}
      </div>

      <div className="mt-4">
        <label className="label">Betrag ({entry.symbol}, optional)</label>
        <input
          className="input mono"
          inputMode="decimal"
          placeholder="z. B. 0.05"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <span className="label">Empfaenger-Adresse ({entry.symbol})</span>
        <div className="flex flex-wrap gap-1.5 justify-center rounded-lg border border-line bg-obsidian p-3">
          {chunkAddress(entry.address).map((part: string, i: number) => (
            <span key={i} className="mono text-sm text-ink tracking-wide">
              {part}
            </span>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm mt-3 w-full" onClick={() => void copy(entry.address, 'addr')}>
          {copied === 'addr' ? '✓ Kopiert' : 'Adresse kopieren'}
        </button>
        <button className="btn btn-ghost btn-sm mt-2 w-full" onClick={() => void copy(uri, 'uri')}>
          {copied === 'uri' ? '✓ Kopiert' : 'URI kopieren'}
        </button>
      </div>

      <p className="text-xs text-dim mt-5 leading-relaxed">
        Unterstuetzungen sind freiwillig, nicht rueckerstattbar und begruenden keine Gegenleistung. Verifikation der
        Adressen: jede Adresse ist auf dieser Seite, im Footer und im Disclaimer zeichenidentisch.
      </p>
    </div>
  );
}
