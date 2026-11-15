import { useState } from 'react';
import { CHAINS } from '../../config/chains';
import { getUserRpc, setUserRpc, rpcCall } from '../../lib/rpc';
import { wipeLocalData } from '../../lib/idb';

export const RPC_EVENT = 'atd:rpc:open';
export function openRpcPanel() {
  window.dispatchEvent(new CustomEvent(RPC_EVENT));
}

/**
 * Netzwerk-/RPC-Status-Panel: eigene Endpunkte hinterlegen (localStorage),
 * Verbindung testen, lokale Daten mit einem Klick loeschen.
 * Anbieter werden niemals namentlich angezeigt (Pflichtvorgabe).
 */
export default function RpcPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [chainId, setChainId] = useState(1);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<string>('');
  const [testing, setTesting] = useState(false);

  if (!open) return null;

  const current = getUserRpc(chainId);

  const save = () => {
    setUserRpc(chainId, value || null);
    setStatus(value ? 'Eigener Endpunkt gespeichert (nur lokal in Ihrem Browser).' : 'Eigener Endpunkt entfernt.');
  };

  const test = async () => {
    setTesting(true);
    setStatus('');
    const t0 = performance.now();
    try {
      await rpcCall(chainId, 'eth_blockNumber', [], { noCache: true });
      setStatus(`Verbindung ok — Antwort in ${Math.round(performance.now() - t0)} ms.`);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const wipe = async () => {
    await wipeLocalData();
    setStatus('Alle lokalen Suite-Daten (Cache, Fortschritte, Endpunkte) wurden geloescht.');
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Netzwerk und Datenquellen"
    >
      <div className="card w-full max-w-lg p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg">Netzwerk & Datenquellen</h2>
            <p className="text-sm mt-1">
              Die Suite laeuft vollständig in Ihrem Browser. Lesezugriffe erfolgen direkt an Blockchain-Endpunkte Ihrer
              Wahl — ohne zentrale Datenspeicherung.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Schliessen">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="rpc-chain">
              Netzwerk
            </label>
            <select
              id="rpc-chain"
              className="select"
              value={chainId}
              onChange={(e) => {
                setChainId(Number(e.target.value));
                setStatus('');
              }}
            >
              {CHAINS.map((c) => (
                <option key={c.chainId} value={c.chainId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rpc-url">
              Eigener RPC-Endpunkt (optional)
            </label>
            <input
              id="rpc-url"
              className="input mono"
              placeholder={current ?? 'https://… (Ihr eigener Endpunkt)'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-dim mt-1">
              Alternativ per URL fuer alle Werkzeuge: <code>?ds-rpc-{chainId}=https://…</code>
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm flex-1" onClick={save}>
              Speichern
            </button>
            <button className="btn btn-ghost btn-sm flex-1" onClick={() => void test()} disabled={testing}>
              {testing ? 'Teste…' : 'Verbindung testen'}
            </button>
          </div>
          {status && <p className="text-sm text-gold-hi">{status}</p>}
          <div className="border-t border-line pt-3">
            <button className="btn btn-ghost btn-sm w-full" onClick={() => void wipe()}>
              Alle lokalen Suite-Daten loeschen
            </button>
            <p className="text-xs text-dim mt-2">
              Loeschen Cache (IndexedDB), Scan-Fortschritte und hinterlegte Endpunkte (localStorage) — sofort und
              vollstaendig auf diesem Geraet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
