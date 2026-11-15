// Globaler RPC-Manager (Zero-Budget-Datenbeschaffung, Pflichtvorgabe 2.3).
// Prioritaetskette pro Abruf:
//   1) Nutzerdefinierter Endpunkt (URL-Query ?ds-rpc-<chainId>=... oder localStorage)
//   2) Injizierter Wallet-Provider (window.ethereum, sofern Chain passt)
//   3) Rotation CORS-faehiger oeffentlicher Endpunkte mit Backoff
// Alle Lesezugriffe laufen direkt aus dem Browser; es existiert kein
// betreibereigener Proxy, keine Datenbank, keine API-Schluessel.
import { chainById } from '../config/chains';
import { idbGet, idbSet } from './idb';

const LS_PREFIX = 'ds-rpc-';
const urlOverrides = new Map<number, string>();
let overridesParsed = false;

function parseUrlOverrides() {
  if (overridesParsed || typeof window === 'undefined') return;
  overridesParsed = true;
  try {
    const params = new URLSearchParams(window.location.search);
    params.forEach((value, key) => {
      if (key.startsWith(LS_PREFIX)) {
        const id = Number(key.slice(LS_PREFIX.length));
        if (Number.isFinite(id) && /^https?:\/\//i.test(value)) urlOverrides.set(id, value.trim());
      }
    });
    // Hash-Variante (fuer Server ohne Query-Durchreiche)
    if (window.location.hash.includes('?')) {
      const h = window.location.hash.slice(window.location.hash.indexOf('?'));
      new URLSearchParams(h).forEach((value, key) => {
        if (key.startsWith(LS_PREFIX)) {
          const id = Number(key.slice(LS_PREFIX.length));
          if (Number.isFinite(id) && /^https?:\/\//i.test(value)) urlOverrides.set(id, value.trim());
        }
      });
    }
  } catch {
    /* ignore */
  }
}

export function getUserRpc(chainId: number): string | null {
  parseUrlOverrides();
  const o = urlOverrides.get(chainId);
  if (o) return o;
  try {
    const v = window.localStorage.getItem(LS_PREFIX + chainId);
    return v && /^https?:\/\//i.test(v) ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setUserRpc(chainId: number, url: string | null) {
  try {
    if (url && /^https?:\/\//i.test(url)) window.localStorage.setItem(LS_PREFIX + chainId, url.trim());
    else window.localStorage.removeItem(LS_PREFIX + chainId);
  } catch {
    /* ignore */
  }
}

export type RpcSource = 'user' | 'wallet' | 'public' | 'cache';

export interface RpcResult<T = unknown> {
  data: T;
  source: RpcSource;
  endpoint?: string; // intern; niemals namentlich in der UI zeigen
}

// ---------------- In-Flight-Deduplizierung & TTL-Cache ----------------
const inflight = new Map<string, Promise<unknown>>();

// TTL in Sekunden pro Methode (immutable Daten: sehr grosszuegig)
function ttlFor(method: string, params: unknown[]): number {
  switch (method) {
    case 'eth_getCode':
    case 'eth_getStorageAt':
      return 3600;
    case 'eth_getTransactionReceipt':
    case 'eth_getTransactionByHash':
      return 86400; // Receipts sind final
    case 'eth_getBlockByNumber':
    case 'eth_getBlockByHash':
      return params[0] === 'latest' || params[0] === 'pending' ? 8 : 3600;
    case 'eth_call':
      return 60;
    case 'eth_getLogs':
      return 120;
    case 'eth_blockNumber':
      return 8;
    default:
      return 20;
  }
}

function cacheKey(chainId: number, method: string, params: unknown[]): string {
  return `rpc:${chainId}:${method}:${JSON.stringify(params)}`;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export class RpcError extends Error {
  constructor(
    message: string,
    public readonly allFailed = false,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

let reqId = 0;

async function postJson(url: string, method: string, params: unknown[], timeoutMs = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++reqId, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as JsonRpcResponse;
    if (json.error) throw new Error(json.error.message || `RPC-Fehler ${json.error.code}`);
    return json.result;
  } finally {
    clearTimeout(t);
  }
}

interface InjectEip1193 {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
}

function injectedProvider(): InjectEip1193 | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { ethereum?: InjectEip1193 };
  return w.ethereum ?? null;
}

async function injectedChainId(p: InjectEip1193): Promise<number | null> {
  try {
    const hex = (await p.request({ method: 'eth_chainId' })) as string;
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}

/**
 * Fuehrt einen JSON-RPC-Leseaufruf aus. Endpoint-Namen werden niemals in
 * UI-Texte oder Logs exportiert (nur interne Quelle als generische Kategorie).
 */
export async function rpcCall<T = unknown>(
  chainId: number,
  method: string,
  params: unknown[] = [],
  opts: { noCache?: boolean; preferWallet?: boolean } = {},
): Promise<RpcResult<T>> {
  const key = cacheKey(chainId, method, params);
  if (!opts.noCache) {
    const hit = await idbGet<{ t: number; v: T }>('rpc-cache', key);
    if (hit && Date.now() - hit.t < ttlFor(method, params) * 1000) {
      return { data: hit.v, source: 'cache' };
    }
    const existing = inflight.get(key);
    if (existing) {
      return (await existing) as { data: T; source: RpcSource };
    }
  }

  const run = (async (): Promise<{ data: T; source: RpcSource }> => {
    const chain = chainById(chainId);
    const candidates: { url: string; source: RpcSource }[] = [];
    const userUrl = getUserRpc(chainId);
    if (userUrl) candidates.push({ url: userUrl, source: 'user' });
    for (const u of chain?.fallbackRpc ?? []) candidates.push({ url: u, source: 'public' });

    // 2) Injizierter Wallet-Provider, sofern auf derselben Chain
    if (opts.preferWallet !== false) {
      const p = injectedProvider();
      if (p) {
        const cid = await injectedChainId(p);
        if (cid === chainId) {
          try {
            const v = (await p.request({ method, params })) as T;
            return { data: v, source: 'wallet' };
          } catch {
            /* Wallet-Kanal nicht nutzbar — weiter mit HTTPS */
          }
        }
      }
    }

    // 1)/3) Direkte HTTPS-Endpunkte mit Rotation + exponentiellem Backoff
    let attempt = 0;
    for (const c of candidates) {
      try {
        const v = (await postJson(c.url, method, params)) as T;
        if (!opts.noCache) {
          void idbSet('rpc-cache', key, { t: Date.now(), v });
        }
        return { data: v, source: c.source };
      } catch {
        attempt += 1;
        await sleep(Math.min(400 * 2 ** attempt, 4000));
      }
    }
    throw new RpcError(
      `Alle verfuegbaren Endpunkte fuer Chain ${chainId} sind aktuell nicht erreichbar oder gedrosselt. ` +
        'Hinterlegen Sie einen eigenen Endpunkt oder nutzen Sie den Offline-Modus (manuelle Daten-Eingabe).',
      true,
    );
  })();

  if (!opts.noCache) inflight.set(key, run as Promise<unknown>);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

// Bequemlichkeits-Wrapper fuer gaengige Calls ---------------------------

export async function getCode(chainId: number, address: string, block: 'latest' | string = 'latest') {
  return rpcCall<string>(chainId, 'eth_getCode', [address, block]);
}

export async function getStorageAt(chainId: number, address: string, slot: string, block: 'latest' | string = 'latest') {
  return rpcCall<string>(chainId, 'eth_getStorageAt', [address, slot, block]);
}

export async function getTxReceipt(chainId: number, hash: string) {
  return rpcCall<Record<string, unknown> | null>(chainId, 'eth_getTransactionReceipt', [hash]);
}

export async function getTx(chainId: number, hash: string) {
  return rpcCall<Record<string, unknown> | null>(chainId, 'eth_getTransactionByHash', [hash]);
}

export async function getBlockByNumber(chainId: number, tag: string | number, full = false) {
  const n = typeof tag === 'number' ? ('0x' + tag.toString(16)) : tag;
  return rpcCall<Record<string, unknown> | null>(chainId, 'eth_getBlockByNumber', [n, full]);
}

export async function blockNumber(chainId: number) {
  const r = await rpcCall<string>(chainId, 'eth_blockNumber', [], { noCache: false });
  return Number(BigInt(r.data as string));
}

export async function ethCall(chainId: number, to: string, data: string, block: 'latest' | string = 'latest') {
  return rpcCall<string>(chainId, 'eth_call', [{ to, data }, block]);
}

export async function getLogs(
  chainId: number,
  filter: { address?: string; topics?: (string | string[] | null)[]; fromBlock: number; toBlock: number | string },
) {
  const fb = '0x' + filter.fromBlock.toString(16);
  const tb = typeof filter.toBlock === 'number' ? '0x' + filter.toBlock.toString(16) : filter.toBlock;
  return rpcCall<unknown[]>(chainId, 'eth_getLogs', [
    { address: filter.address, topics: filter.topics, fromBlock: fb, toBlock: tb },
  ]);
}
