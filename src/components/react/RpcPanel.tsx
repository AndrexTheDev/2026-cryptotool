import { useState } from 'react';
import { useFocusTrap } from './useFocusTrap';
import { CHAINS } from '../../config/chains';
import { getUserRpc, setUserRpc, rpcCall } from '../../lib/rpc';
import { wipeLocalData } from '../../lib/idb';

export const RPC_EVENT = 'atd:rpc:open';
export function openRpcPanel() {
  window.dispatchEvent(new CustomEvent(RPC_EVENT));
}

/**
 * Network/RPC status panel: configure custom endpoints (localStorage),
 * test the connection, wipe local data with one click.
 * Providers are never shown by name (specification).
 */
export default function RpcPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const [chainId, setChainId] = useState(1);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<string>('');
  const [testing, setTesting] = useState(false);

  if (!open) return null;

  const current = getUserRpc(chainId);

  const save = () => {
    setUserRpc(chainId, value || null);
    setStatus(value ? 'Custom endpoint saved (only locally in your browser).' : 'Custom endpoint removed.');
  };

  const test = async () => {
    setTesting(true);
    setStatus('');
    const t0 = performance.now();
    try {
      await rpcCall(chainId, 'eth_blockNumber', [], { noCache: true });
      setStatus(`Connection ok — response in ${Math.round(performance.now() - t0)} ms.`);
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const wipe = async () => {
    await wipeLocalData();
    setStatus('All local suite data (cache, progress, endpoints) has been deleted.');
  };

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Network and data sources"
    >
      <div className="card w-full max-w-lg p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg">Network & data sources</h2>
            <p className="text-sm mt-1">
              All checks run in your browser. When reading blockchain data, your browser connects directly to a public
              blockchain reader (RPC node)—or a custom one you enter below.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="label" htmlFor="rpc-chain">
              Blockchain network
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
              Your own reader address / RPC URL (optional)
            </label>
            <input
              id="rpc-url"
              className="input mono"
              placeholder={current ?? 'https://… (leave empty to use public readers)'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-dim mt-1">
              Tip: you can also set this via URL: <code>?ds-rpc-{chainId}=https://…</code>
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm flex-1" onClick={save}>
              Save
            </button>
            <button className="btn btn-ghost btn-sm flex-1" onClick={() => void test()} disabled={testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
          </div>
          {status && <p className="text-sm text-gold-hi">{status}</p>}
          <div className="border-t border-line pt-3">
            <button className="btn btn-ghost btn-sm w-full" onClick={() => void wipe()}>
              Delete all saved browser data
            </button>
            <p className="text-xs text-dim mt-2">
              Clears the local cache (IndexedDB), saved scan progress, and custom network addresses from this browser
              right away.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
