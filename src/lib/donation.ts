// Spenden-URI-Builder (BIP-21, Solana Pay, EIP-681) - rein clientseitig.
import { DONATION } from '../config/site';

export type DonationChain = 'sol' | 'btc' | 'eth';

export const DONATION_CHAINS: { id: DonationChain; label: string; symbol: string; address: string }[] = [
  { id: 'sol', label: 'Solana', symbol: 'SOL', address: DONATION.sol },
  { id: 'btc', label: 'Bitcoin', symbol: 'BTC', address: DONATION.btc },
  { id: 'eth', label: 'Ethereum / EVM', symbol: 'ETH', address: DONATION.eth },
];

export function donationUri(chain: DonationChain, amount?: string, rawAddressOnly = false): string {
  const entry = DONATION_CHAINS.find((c) => c.id === chain)!;
  const amt = amount && Number(amount) > 0 ? amount.trim() : undefined;
  if (rawAddressOnly) return entry.address;
  switch (chain) {
    case 'btc': {
      const params = new URLSearchParams({ label: 'StackAutopsy' });
      if (amt) params.set('amount', amt);
      return `bitcoin:${entry.address}?${params.toString()}`;
    }
    case 'sol': {
      const params = new URLSearchParams({ label: 'StackAutopsy' });
      if (amt) params.set('amount', amt);
      return `solana:${entry.address}?${params.toString()}`;
    }
    case 'eth': {
      // EIP-681: value in wei as hex is optional; amount in ETH as value param
      // -> we use the plain payment payload (address), amount via ?value in wei.
      if (amt) {
        try {
          const wei = BigInt(Math.round(Number(amt) * 1e6)) * 10n ** 12n;
          return `ethereum:${entry.address}?value=${wei.toString()}`;
        } catch {
          return `ethereum:${entry.address}`;
        }
      }
      return `ethereum:${entry.address}`;
    }
  }
}
