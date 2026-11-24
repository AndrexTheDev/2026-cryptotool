// Central brand and suite configuration.
// Character-exact operator and donation data per specification (section 2.1).

export const SITE_URL = (
  (import.meta.env.PUBLIC_SITE_URL as string | undefined) ?? 'https://suite.andrexthe.dev'
).replace(/\/$/, '');

export const BRAND = 'StackAutopsy';
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
  plainSummary: string;
  example: string;
  problem: string;
  solution: string;
  timeSaved: string;
  category: Category;
  audiences: Audience[];
  seoTitle: string;
  seoDesc: string;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  'smart-account': 'Wallets & Smart Accounts',
  'bitcoin-compliance': 'Bitcoin & Tax Proofs',
  'agents-intents-privacy': 'AI Agents, Swaps & Privacy',
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  coldwallet: 'Everyday Holders & Taxes',
  multisig: 'Teams & Security',
  builder: 'Developers & AI Agents',
};

export const TOOLS: ToolDef[] = [
  {
    id: 1,
    slug: '7702-slotguard',
    name: '7702-SlotGuard',
    tagline: 'Check if hidden code controls your wallet',
    plainSummary:
      'Checks whether your normal Ethereum wallet has hidden program code ("a delegate") attached via EIP-7702, warns if stored data could clash, and builds an encrypted emergency undo file.',
    example:
      'You signed a sketchy airdrop claim and worry a hidden script might drain any ETH you deposit later. Enter your public wallet address (no private key needed) to spot attached code and save an undo file.',
    problem:
      'With Ethereum EIP-7702, a single signature can attach hidden code ("a delegate") to your wallet that quietly drains coins later.',
    solution:
      'Checks your wallet across networks for attached delegates and data clashes, and creates an encrypted emergency undo file.',
    timeSaved: '30 seconds instead of digging through raw chain data',
    category: 'smart-account',
    audiences: ['multisig', 'coldwallet'],
    seoTitle: 'Check wallet delegations easily: 7702-SlotGuard',
    seoDesc:
      'Spot hidden EIP-7702 wallet delegations, check data clashes and build an encrypted emergency undo file — locally in your browser.',
  },
  {
    id: 2,
    slug: 'stva-upgradediff',
    name: 'STVA-UpgradeDiff',
    tagline: 'See what a wallet or app update changes before you sign',
    plainSummary:
      'Translates confusing hex update data into plain steps: what your signature approves, what actually runs on-chain, and what risks stay hidden.',
    example:
      'Your team Safe wallet asks you to approve an upgrade shown only as raw hex letters (0x4f1ef286…). Paste it here to see which new contract replaces the old one and whether it is an official Safe version.',
    problem:
      'Team wallet (multisig) signers often approve "upgrade" transactions blindly without seeing what the new code actually replaces.',
    solution:
      'Decodes update data into plain English, compares old vs. new contract code, and separates what you sign from what runs and what is assumed.',
    timeSaved: '1 minute instead of comparing raw code by hand',
    category: 'smart-account',
    audiences: ['multisig', 'builder'],
    seoTitle: 'Check proxy and Safe updates before signing: STVA-UpgradeDiff',
    seoDesc:
      'Plain-English check for multisig and proxy updates: what you sign, what executes, and what risks remain — right in your browser.',
  },
  {
    id: 3,
    slug: 'dac8-selfproof',
    name: 'DAC8-SelfProof',
    tagline: 'Prove a wallet belongs to you for tax & exchange checks',
    plainSummary:
      'Creates a short "I own this wallet" statement tied to one Bitcoin or Ethereum transfer, verifies your signature locally, and exports a clean proof report—without uploading your wallet history.',
    example:
      'You moved 0.38 BTC from an exchange to your hardware wallet, and now your exchange or tax advisor asks for EU DAC8 ownership proof. Generate the text statement here, sign it in your wallet, and export the PDF.',
    problem:
      'Under EU tax reporting rules (DAC8) and Travel Rule checks, exchanges and tax offices ask for proof that a self-custody wallet is yours.',
    solution:
      'Builds an ownership statement for one transfer, verifies Bitcoin (BIP-322) and Ethereum signatures locally, and exports a print-ready proof.',
    timeSaved: '2 minutes instead of endless back-and-forth with support',
    category: 'bitcoin-compliance',
    audiences: ['coldwallet', 'multisig'],
    seoTitle: 'Prove wallet ownership for DAC8 taxes: DAC8-SelfProof',
    seoDesc:
      'Create a self-transfer ownership proof for DAC8 & Travel Rule checks locally in your browser and export a print-ready dossier.',
  },
  {
    id: 4,
    slug: 'bitvault-stress',
    name: 'BitVault-Stress',
    tagline: 'Test if your Bitcoin savings or inheritance vault works at high fees',
    plainSummary:
      'Simulates high Bitcoin network fees on your vault or inheritance plan to show if small coin pieces ("UTXOs") would cost too much to spend—and makes an offline practice guide for heirs.',
    example:
      'You set up a Bitcoin inheritance vault and hold small deposits like 3,400 or 21,000 sats. Move the fee slider up to see when fees eat those coins—and download a step-by-step practice sheet for your family.',
    problem:
      'When Bitcoin fees spike, small coin pieces or complex backup and inheritance paths can cost more in fees than they are worth.',
    solution:
      'Calculates transaction weight per spending path, flags coins near the "dust cliff" (too costly to spend), and creates an offline heir drill.',
    timeSaved: '3 minutes instead of manual fee spreadsheets',
    category: 'bitcoin-compliance',
    audiences: ['coldwallet'],
    seoTitle: 'Stress-test Bitcoin inheritance vaults: BitVault-Stress',
    seoDesc:
      'Test Bitcoin miniscript and inheritance vaults against high fees, spot unspendable small coins, and build an offline heir practice guide.',
  },
  {
    id: 5,
    slug: 'passkey-continuity',
    name: 'Passkey-Continuity',
    tagline: 'Check if your FaceID / passkey wallet works on every chain',
    plainSummary:
      'Tests whether your chosen blockchains support standard passkey (FaceID / TouchID) verification natively or via a backup contract, and scores your recovery setup with a 5-point checklist.',
    example:
      'You unlock your smart wallet with FaceID on Base and want to use the same wallet on another network. Run this check to see if that chain verifies passkeys—or if your wallet would silently fail there.',
    problem:
      'Passkey smart wallets can silently stop working on blockchains that lack built-in passkey support or if the app website domain goes down.',
    solution:
      'Tests each selected chain with a real passkey test signature, checks backup verifier contracts, and scores your recovery readiness.',
    timeSaved: '45 seconds instead of guessing across networks',
    category: 'smart-account',
    audiences: ['multisig', 'builder'],
    seoTitle: 'Test FaceID / passkey wallets across blockchains: Passkey-Continuity',
    seoDesc:
      'Check if WebAuthn / FaceID passkey smart wallets work on Ethereum, Base, Arbitrum and Optimism — plus a 5-point backup checklist.',
  },
  {
    id: 6,
    slug: 'userop-autopsy',
    name: 'UserOp-Autopsy',
    tagline: 'Spot hidden extra fees on smart-wallet transactions',
    plainSummary:
      'Breaks down smart-wallet (ERC-4337) receipts to compare the real blockchain fee against what the bundler or token paymaster actually billed you.',
    example:
      'Your smart wallet charged you $3 in gas or USDC for a simple swap even though the network was quiet. Paste the transaction hash to see the exact extra percentage added by the bundler or paymaster.',
    problem:
      'Smart wallets bundle actions and let you pay fees in tokens, making it hard to see how much extra fee middlemen added.',
    solution:
      'Separates real network gas costs from bundler gas-price markups and token paymaster spreads using the transaction receipt.',
    timeSaved: '30 seconds instead of decoding raw transaction logs',
    category: 'agents-intents-privacy',
    audiences: ['builder', 'multisig'],
    seoTitle: 'Check smart-wallet hidden fee markups: UserOp-Autopsy',
    seoDesc:
      'See real network fees vs. bundler and paymaster markups on ERC-4337 smart-wallet transactions — locally in your browser.',
  },
  {
    id: 7,
    slug: 'x402-paywallguard',
    name: 'x402-PaywallGuard',
    tagline: 'Check AI agent payment code & spending limits for bugs',
    plainSummary:
      'Scans AI agent payment packages (x402), login/payment code, spending-limit rules, and request logs for known security bugs and paid-but-failed API calls.',
    example:
      'You run an AI agent that pays for API data automatically with USDC. Paste your lockfile, middleware snippet, or permission rules to catch vulnerable package versions, missing replay checks, or failed deliveries.',
    problem:
      'AI agents that pay automatically over HTTP 402 (x402) often ship with unpatched security bugs or overly broad spending limits.',
    solution:
      'Checks package versions live against npm and known 2026 bugs, scans payment code, scores spending rules, and checks failed deliveries.',
    timeSaved: '2 minutes instead of half a day of manual security checks',
    category: 'agents-intents-privacy',
    audiences: ['builder'],
    seoTitle: 'Audit AI agent x402 payments safely: x402-PaywallGuard',
    seoDesc:
      'Check x402 AI agent payment code, npm package versions, ERC-7715 spending limits and paid API delivery logs locally in your browser.',
  },
  {
    id: 8,
    slug: 'intentlens-7683',
    name: 'IntentLens-7683',
    tagline: 'Check fees in cross-chain swaps and rescue stuck funds',
    plainSummary:
      'Reads cross-chain intent swaps (ERC-7683) in plain language, shows how much fee spread the solver takes, checks if the deadline expired, and prepares refund lookup data.',
    example:
      'You bridged 1,000 USDC from Ethereum to Base using an intent bridge and got less back—or the swap timed out. Paste the order JSON or transaction hash to see the fee spread and refund details.',
    problem:
      'Cross-chain "intent" swaps hide the solver fee spread, and if a swap expires before filling, users rarely know where refunds go.',
    solution:
      'Decodes ERC-7683 orders in plain language, calculates the solver spread, checks the destination chain deadline, and builds refund calldata.',
    timeSaved: '1 minute instead of decoding complex swap bytes by hand',
    category: 'agents-intents-privacy',
    audiences: ['builder'],
    seoTitle: 'Decode cross-chain swaps & refunds: IntentLens-7683',
    seoDesc:
      'Understand ERC-7683 cross-chain intent swaps: view hidden solver spreads, check deadlines and prepare refund calldata locally.',
  },
  {
    id: 9,
    slug: 'stealthaudit-5564',
    name: 'StealthAudit-5564',
    tagline: 'Find private incoming payments for taxes—without risking funds',
    plainSummary:
      'Uses only your read-only viewing key to scan a chosen block range for private EIP-5564 stealth payments and exports a clean report for taxes or heirs—never touching your spending key.',
    example:
      'Someone paid you using a privacy stealth address and your tax advisor needs a list of incoming payments. Enter your read-only viewing key and block window to export hits safely without exposing spending power.',
    problem:
      'Private stealth addresses hide incoming payments so well that finding them later for taxes or inheritance is tedious and risky.',
    solution:
      'Scans a selected block window locally in a background worker using only your viewing key and exports results with zero key material.',
    timeSaved: '5 minutes instead of setting up complex command-line scanners',
    category: 'agents-intents-privacy',
    audiences: ['coldwallet'],
    seoTitle: 'Scan private EIP-5564 stealth payments safely: StealthAudit-5564',
    seoDesc:
      'Scan EIP-5564 stealth payments in your browser using only a read-only viewing key — pause/resume locally and export key-free reports.',
  },
  {
    id: 10,
    slug: 'bundlewatch-ens',
    name: 'BundleWatch-ENS',
    tagline: 'Check if a Web3 app website matches its official ENS release',
    plainSummary:
      'Compares the scripts running on a Web3 app website against its official ENS record and release file hashes, and warns if a single wallet controls the ENS domain.',
    example:
      'Before signing a big swap on a DeFi website, you want to be sure hackers did not alter its front-end scripts. Compare the live page script hashes with the official ENS release to spot swapped files or new domains.',
    problem:
      'Even when smart contracts are safe, attackers can tamper with a Web3 app website or ENS domain to trick users into signing bad transactions.',
    solution:
      'Compares live website script hashes against the official ENS contenthash and release manifest, and checks ENS owner governance risk.',
    timeSaved: '1 minute instead of comparing script hashes by hand',
    category: 'agents-intents-privacy',
    audiences: ['multisig', 'builder'],
    seoTitle: 'Check Web3 app website integrity: BundleWatch-ENS',
    seoDesc:
      'Verify a dApp website against its official ENS contenthash and release files, spot injected domains and check ENS governance risk.',
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
