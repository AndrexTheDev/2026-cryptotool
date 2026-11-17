// Central brand and suite configuration.
// Character-exact operator and donation data per specification (section 2.1).

export const SITE_URL = (
  (import.meta.env.PUBLIC_SITE_URL as string | undefined) ?? 'https://suite.andrexthe.dev'
).replace(/\/$/, '');

export const BRAND = 'AndrexTheDev';
export const CONTACT_EMAIL = 'hippie.highho@gmail.com';
export const SUITE_NAME = 'Web3 Security & Forensics Suite';

export const DONATION = {
  sol: '79KsqtJJdhKFJ9woxnYgtf3nq7HxQveafWBCtC3mxWi8',
  btc: 'bc1qeqzrlfg3edrydk4s0hecakc82gp26n5p7hkc7f',
  eth: '0xBC3fab34f69bc9f6661608C3FB36dDdC313C42F7',
} as const;

export type Audience = 'coldwallet' | 'multisig' | 'builder';
export type Category = 'smart-account' | 'bitcoin-compliance' | 'agents-intents-privacy';

export interface ToolDef {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  problem: string;
  solution: string;
  timeSaved: string;
  category: Category;
  audiences: Audience[];
  seoTitle: string;
  seoDesc: string;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  'smart-account': 'Smart Account Security',
  'bitcoin-compliance': 'Bitcoin & Compliance',
  'agents-intents-privacy': 'Agents, Intents & Privacy',
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  coldwallet: 'Cold Wallet & Tax',
  multisig: 'Multisig & Security',
  builder: 'Builders & Agents',
};

export const TOOLS: ToolDef[] = [
  {
    id: 1,
    slug: '7702-slotguard',
    name: '7702-SlotGuard',
    tagline: 'Detect delegation sweepers & storage collisions',
    problem: 'EIP-7702 delegations can silently bind your EOA to malicious sweep contracts.',
    solution: 'Reads delegate, storage slots and nonce directly from the chain and generates an encrypted panic-revoke emergency package.',
    timeSaved: '30 seconds instead of manual slot forensics',
    category: 'smart-account',
    audiences: ['multisig', 'coldwallet'],
    seoTitle: 'Check EIP-7702 delegations: 7702-SlotGuard',
    seoDesc: 'Detect EIP-7702 delegations, check storage collisions and generate an encrypted panic-revoke emergency package — locally in the browser.',
  },
  {
    id: 2,
    slug: 'stva-upgradediff',
    name: 'STVA-UpgradeDiff',
    tagline: 'End blind signing on proxy upgrades',
    problem: 'Multisig signatures on proxy upgrades blindly authorize complete contract replacement.',
    solution: 'Decodes calldata and Safe payloads, compares implementations and separates the signature, execution and assumption layers per the STVA model.',
    timeSaved: '1 minute instead of hours of bytecode diffing',
    category: 'smart-account',
    audiences: ['multisig', 'builder'],
    seoTitle: 'Verify proxy upgrades before signing: STVA-UpgradeDiff',
    seoDesc: 'Three-layer verification for multisig and proxy upgrades: signature intent, execution effect and assumptions with block snapshot — client-side.',
  },
  {
    id: 3,
    slug: 'dac8-selfproof',
    name: 'DAC8-SelfProof',
    tagline: 'Self-transfer proof without data upload',
    problem: 'DAC8 and the Travel Rule demand evidence for self-transfers to self-custody wallets.',
    solution: 'Generates a deterministic ownership challenge and verifies BIP-322, EIP-191, EIP-712 and ERC-1271 signatures locally in the browser.',
    timeSaved: '2 minutes instead of hours of tax-advisor ping-pong',
    category: 'bitcoin-compliance',
    audiences: ['coldwallet', 'multisig'],
    seoTitle: 'Prove DAC8 self-transfers: DAC8-SelfProof',
    seoDesc: 'Ownership and self-transfer proof for DAC8: verify BIP-322, EIP-191/712 and ERC-1271 locally, export a print-ready dossier.',
  },
  {
    id: 4,
    slug: 'bitvault-stress',
    name: 'BitVault-Stress',
    tagline: 'Stress-test miniscript vaults against dust cliffs',
    problem: 'Inheritance paths in miniscript vaults become economically unspendable at high fees.',
    solution: 'Computes exact vByte weights per spending path and tests every UTXO against the 1/3 dust cliff and the total-loss point.',
    timeSaved: '3 minutes instead of spreadsheets with script bytes',
    category: 'bitcoin-compliance',
    audiences: ['coldwallet'],
    seoTitle: 'Miniscript vault stress test: BitVault-Stress',
    seoDesc: 'Check Bitcoin miniscript vaults and inheritance setups: vByte weights, dust cliff, fee heatmap and heir practice file — locally.',
  },
  {
    id: 5,
    slug: 'passkey-continuity',
    name: 'Passkey-Continuity',
    tagline: 'Keep WebAuthn smart accounts alive multi-chain',
    problem: 'Passkey accounts silently die on chains without a P-256 precompile or with a domain-bound rpId.',
    solution: 'Tests all target chains via eth_call with a cryptographically valid P-256 vector, checks fallback contracts and low-S malleability.',
    timeSaved: '45 seconds instead of cross-chain spot checks',
    category: 'smart-account',
    audiences: ['multisig', 'builder'],
    seoTitle: 'Test passkey smart accounts multi-chain',
    seoDesc: 'Test WebAuthn/P-256 smart accounts multi-chain: RIP-7212 detection with a 160-byte test vector, malleability check and recovery scorecard.',
  },
  {
    id: 6,
    slug: 'userop-autopsy',
    name: 'UserOp-Autopsy',
    tagline: 'Dissect hidden markups in UserOps',
    problem: 'Bundler and paymaster markups in ERC-4337 are opaque to users.',
    solution: 'Splits the bundler margin into gas-price and gas-unit markups and computes the effective token spread of ERC-20 paymasters.',
    timeSaved: '30 seconds instead of receipt log arithmetic',
    category: 'agents-intents-privacy',
    audiences: ['builder', 'multisig'],
    seoTitle: 'Analyze ERC-4337 fees: UserOp-Autopsy',
    seoDesc: 'Fee forensics for account abstraction: bundler margin, gas-price markup and paymaster token spread from receipts and EntryPoint logs.',
  },
  {
    id: 7,
    slug: 'x402-paywallguard',
    name: 'x402-PaywallGuard',
    tagline: 'Audit AI agent payments before they burn',
    problem: 'x402 and SIWX integrations contain critical gaps missing from standard audits.',
    solution: 'Checks lockfiles against known vulnerabilities, scans SIWX code patterns and rates ERC-7715 policies against eight protection dimensions.',
    timeSaved: '2 minutes instead of half a day of manual dependency forensics',
    category: 'agents-intents-privacy',
    audiences: ['builder'],
    seoTitle: 'Audit x402 agent payments: x402-PaywallGuard',
    seoDesc: 'Auditor for HTTP 402 agent payments: vulnerability check, SIWX pattern scanner, ERC-7715 policy radar, delivery reconciliation — locally.',
  },
  {
    id: 8,
    slug: 'intentlens-7683',
    name: 'IntentLens-7683',
    tagline: 'Decode and rescue cross-chain intents',
    problem: 'ERC-7683 orders hide solver spreads and timeout refunds often go unclaimed.',
    solution: 'Decodes GaslessCrossChainOrder data vendor-independently, quantifies the solver spread and generates refund calldata after deadline expiry.',
    timeSaved: '1 minute instead of ABI guessing games',
    category: 'agents-intents-privacy',
    audiences: ['builder'],
    seoTitle: 'Decode ERC-7683 intents: IntentLens-7683',
    seoDesc: 'Decode cross-chain intents (ERC-7683): compute solver spread, check deadline status and generate refund calldata — locally.',
  },
  {
    id: 9,
    slug: 'stealthaudit-5564',
    name: 'StealthAudit-5564',
    tagline: 'Export stealth inbound payments time-boxed',
    problem: 'Stealth addresses are a black hole for tax and inheritance evidence.',
    solution: 'Scans EIP-5564 announcements in a WebWorker strictly within the chosen time and block window and exports only the bounded excerpt.',
    timeSaved: '5 minutes instead of a full-scan toolchain',
    category: 'agents-intents-privacy',
    audiences: ['coldwallet'],
    seoTitle: 'Check EIP-5564 stealth addresses: StealthAudit',
    seoDesc: 'Viewing-key scanner for stealth addresses (EIP-5564): time-boxed scan in a worker, attribution proofs, export without keys.',
  },
  {
    id: 10,
    slug: 'bundlewatch-ens',
    name: 'BundleWatch-ENS',
    tagline: 'Verify dApp frontends against the ENS reference',
    problem: 'Manipulated dApp frontends redirect signatures to the wrong contracts.',
    solution: 'Reconciles live bundle hashes against the ENS contenthash (EIP-1577) and release archives, and shows governance risks of the ENS name.',
    timeSaved: '1 minute instead of a manual script-hash puzzle',
    category: 'agents-intents-privacy',
    audiences: ['multisig', 'builder'],
    seoTitle: 'Check dApp frontend integrity: BundleWatch-ENS',
    seoDesc: 'dApp frontend integrity: compare script hashes against ENS contenthash and releases — governance traffic light and domain diffs.',
  },
];

export const toolBySlug = (slug: string): ToolDef | undefined => TOOLS.find((t) => t.slug === slug);

/** Formats an address visually into groups of four (anti-error display). */
export function chunkAddress(addr: string): string[] {
  const clean = addr.trim();
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += 4) parts.push(clean.slice(i, i + 4));
  return parts;
}
