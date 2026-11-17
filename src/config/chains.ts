// Multi-chain configuration for the global RPC manager.
// Note: the public fallback endpoints configured here are never
// shown by name in the user interface (see specification 2.2/5).

export interface ChainDef {
  chainId: number;
  name: string;
  short: string;
  nativeSymbol: string;
  blockTimeHint: number; // Sekunden, heuristisch fuer Block<->Zeit Umrechnung
  fallbackRpc: string[];
  explorerTx?: string; // {hash}-Platzhalter
  explorerAddress?: string;
}

export const CHAINS: ChainDef[] = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    short: 'Ethereum',
    nativeSymbol: 'ETH',
    blockTimeHint: 12,
    fallbackRpc: [
      'https://eth.llamarpc.com',
      'https://ethereum-rpc.publicnode.com',
      'https://1rpc.io/eth',
      'https://cloudflare-eth.com',
    ],
    explorerTx: 'https://etherscan.io/tx/{hash}',
    explorerAddress: 'https://etherscan.io/address/{hash}',
  },
  {
    chainId: 8453,
    name: 'Base',
    short: 'Base',
    nativeSymbol: 'ETH',
    blockTimeHint: 2,
    fallbackRpc: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'],
    explorerTx: 'https://basescan.org/tx/{hash}',
    explorerAddress: 'https://basescan.org/address/{hash}',
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    short: 'Arbitrum',
    nativeSymbol: 'ETH',
    blockTimeHint: 1,
    fallbackRpc: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com', 'https://1rpc.io/arb'],
    explorerTx: 'https://arbiscan.io/tx/{hash}',
    explorerAddress: 'https://arbiscan.io/address/{hash}',
  },
  {
    chainId: 10,
    name: 'OP Mainnet',
    short: 'Optimism',
    nativeSymbol: 'ETH',
    blockTimeHint: 2,
    fallbackRpc: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com', 'https://1rpc.io/op'],
    explorerTx: 'https://optimistic.etherscan.io/tx/{hash}',
    explorerAddress: 'https://optimistic.etherscan.io/address/{hash}',
  },
  {
    chainId: 137,
    name: 'Polygon PoS',
    short: 'Polygon',
    nativeSymbol: 'POL',
    blockTimeHint: 2,
    fallbackRpc: ['https://polygon-rpc.com', 'https://polygon-bor-rpc.publicnode.com', 'https://1rpc.io/matic'],
    explorerTx: 'https://polygonscan.com/tx/{hash}',
    explorerAddress: 'https://polygonscan.com/address/{hash}',
  },
  {
    chainId: 56,
    name: 'BNB Smart Chain',
    short: 'BNB Chain',
    nativeSymbol: 'BNB',
    blockTimeHint: 3,
    fallbackRpc: ['https://bsc-dataseed.binance.org', 'https://bnb-rpc.publicnode.com', 'https://1rpc.io/bnb'],
    explorerTx: 'https://bscscan.com/tx/{hash}',
    explorerAddress: 'https://bscscan.com/address/{hash}',
  },
];

export const chainById = (id: number): ChainDef | undefined => CHAINS.find((c) => c.chainId === id);

// ERC-4337 EntryPoint addresses (canonical, identical across chains)
export const ENTRYPOINT_V06 = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789' as const;
export const ENTRYPOINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;

// ERC-5564 Announcer — kanonische Singleton-Deployment (ScopeLift-Referenz-Contracts,
// identisch auf Ethereum Mainnet, Polygon, Scroll u. a.)
export const STEALTH_ANNOUNCER = '0x55649E01B5Df198D18D95b5cc5051630cfD45564' as const;

// ERC-6538 Stealth Meta-Address Registry — kanonische Singleton-Deployment
export const STEALTH_REGISTRY = '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538' as const;

// Bitcoin-Datenquellen (CORS-faehige, schluessellose Lese-Endpunkte)
export const BTC_APIS = ['https://mempool.space/api', 'https://blockstream.info/api'];
