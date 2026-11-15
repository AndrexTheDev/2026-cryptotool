// Leichtgewichtige Wallet-Erkennung nach EIP-6963 (RDN-basiert, kein SDK).
import { useEffect, useState } from 'react';

export interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface Eip1193Provider {
  request<T = unknown>(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<T>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface DiscoveredWallet {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

interface AnnounceDetail {
  info: Eip6963ProviderInfo;
  provider: Eip1193Provider;
}

export function discoverWallets(timeoutMs = 400): Promise<DiscoveredWallet[]> {
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredWallet>();
    const onAnnounce = (ev: Event) => {
      const detail = (ev as CustomEvent<AnnounceDetail>).detail;
      if (detail?.info?.uuid) found.set(detail.info.uuid, detail);
    };
    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      // Fallback: window.ethereum (vor-EIP-6963-Wallets)
      const w = window as unknown as { ethereum?: Eip1193Provider };
      if (found.size === 0 && w.ethereum) {
        found.set('legacy-injected', {
          info: { uuid: 'legacy-injected', name: 'Injizierte Wallet', icon: '', rdns: '' },
          provider: w.ethereum,
        });
      }
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

export function useWallets() {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  useEffect(() => {
    let alive = true;
    void discoverWallets().then((w) => {
      if (alive) setWallets(w);
    });
    return () => {
      alive = false;
    };
  }, []);
  return wallets;
}

export async function requestAccounts(provider: Eip1193Provider): Promise<string[]> {
  return provider.request<string[]>({ method: 'eth_requestAccounts' });
}

export async function personalSign(provider: Eip1193Provider, account: string, messageUtf8: string): Promise<string> {
  const enc = new TextEncoder().encode(messageUtf8);
  const hex = '0x' + Array.from(enc, (b) => b.toString(16).padStart(2, '0')).join('');
  return provider.request<string>({ method: 'personal_sign', params: [hex, account] });
}

export async function switchChain(provider: Eip1193Provider, chainId: number): Promise<void> {
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + chainId.toString(16) }] });
}

export async function currentChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    const hex = await provider.request<string>({ method: 'eth_chainId' });
    return parseInt(hex, 16);
  } catch {
    return null;
  }
}
