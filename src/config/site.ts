// Zentrale Marken- und Suite-Konfiguration.
// Zeichengenaue Betreiber- und Spenden-Daten gemaess Pflichtvorgabe (Abschnitt 2.1).

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
  'smart-account': 'Smart-Account-Sicherheit',
  'bitcoin-compliance': 'Bitcoin & Compliance',
  'agents-intents-privacy': 'Agenten, Intents & Privacy',
};

export const AUDIENCE_LABEL: Record<Audience, string> = {
  coldwallet: 'Cold-Wallet & Steuer',
  multisig: 'Multisig & Security',
  builder: 'Builder & Agenten',
};

export const TOOLS: ToolDef[] = [
  {
    id: 1,
    slug: '7702-slotguard',
    name: '7702-SlotGuard',
    tagline: 'Delegations-Sweepers & Storage-Kollisionen erkennen',
    problem: 'EIP-7702-Delegationen koennen Ihre EOA still an boesartige Sweep-Contracts binden.',
    solution: 'Liest Delegate, Storage-Slots und Nonce direkt aus der Chain und erzeugt ein verschluesseltes Panic-Revoke-Notfallpaket.',
    timeSaved: '30 Sekunden statt manueller Slot-Forensik',
    category: 'smart-account',
    audiences: ['multisig', 'coldwallet'],
    seoTitle: 'EIP-7702 Delegation pruefen: 7702-SlotGuard',
    seoDesc: 'EIP-7702-Delegationen erkennen, Storage-Kollisionen beim Delegate-Wechsel pruefen und ein verschluesseltes Panic-Revoke-Notfallpaket erzeugen. Lokal im Browser.',
  },
  {
    id: 2,
    slug: 'stva-upgradediff',
    name: 'STVA-UpgradeDiff',
    tagline: 'Blind Signing bei Proxy-Upgrades beenden',
    problem: 'Multisig-Signaturen auf Proxy-Upgrades autorisieren blind vollstaendige Contract-Ersetzung.',
    solution: 'Dekodiert Calldata und Safe-Payloads, vergleicht Implementierungen und trennt Signatur-, Ausfuehrungs- und Annahmeebene nach dem STVA-Modell.',
    timeSaved: '1 Minute statt Stunden an Bytecode-Diffing',
    category: 'smart-account',
    audiences: ['multisig', 'builder'],
    seoTitle: 'Proxy-Upgrade pruefen vor der Signatur: STVA-UpgradeDiff',
    seoDesc: 'STVA-konforme Drei-Ebenen-Verifizierung fuer Multisig- und Proxy-Upgrades: Signatur-Absicht, Ausfuehrungs-Effekt und Annahmen mit Block-Snapshot. Clientseitig.',
  },
  {
    id: 3,
    slug: 'dac8-selfproof',
    name: 'DAC8-SelfProof',
    tagline: 'Eigenübertrags-Nachweis ohne Daten-Upload',
    problem: 'DAC8 und Travel Rule verlangen Belege fuer Eigenübertragungen an Self-Custody-Wallets.',
    solution: 'Erzeugt eine deterministische Ownership-Challenge und verifiziert BIP-322-, EIP-191-, EIP-712- und ERC-1271-Signaturen lokal im Browser.',
    timeSaved: '2 Minuten statt mehrstuendigem Steuerberater-Ping-Pong',
    category: 'bitcoin-compliance',
    audiences: ['coldwallet', 'multisig'],
    seoTitle: 'DAC8 Eigenübertrag nachweisen: DAC8-SelfProof',
    seoDesc: 'Datensparsamer Eigentums- und Eigenübertragsnachweis fuer DAC8 und Travel Rule: BIP-322, EIP-191/712 und ERC-1271 lokal pruefen, druckfertiges Dossier exportieren.',
  },
  {
    id: 4,
    slug: 'bitvault-stress',
    name: 'BitVault-Stress',
    tagline: 'Miniscript-Tresore gegen Dust-Klippen stress-testen',
    problem: 'Erbschafts-Pfade in Miniscript-Tresoren werden bei hohen Gebuehren oekonomisch unausgebbar.',
    solution: 'Berechnet exakte vByte-Gewichte pro Ausgabepfad und testet jeden UTXO gegen die 1/3-Dust-Klippe und den Totalverlust-Punkt.',
    timeSaved: '3 Minuten statt Tabellenkalkulation mit Script-Bytes',
    category: 'bitcoin-compliance',
    audiences: ['coldwallet'],
    seoTitle: 'Miniscript Tresor Stress-Test: BitVault-Stress',
    seoDesc: 'Bitcoin-Miniscript-Tresore und Erbschaftskonzepte pruefen: vByte-Gewichte, Dust-Klippe (Bitcoin-Core), Gebuehren-Heatmap, Konsolidierungsrechner und Erben-Uebungsdatei.',
  },
  {
    id: 5,
    slug: 'passkey-continuity',
    name: 'Passkey-Continuity',
    tagline: 'WebAuthn-Smart-Accounts multi-chain ueberleben lassen',
    problem: 'Passkey-Accounts sterben still auf Chains ohne P-256-Precompile oder mit Domain-hoeingel bound rpId.',
    solution: 'Testet per eth_call mit einem kryptografisch gueltigen P-256-Vektor alle Ziel-Chains, prueft Fallback-Contracts und Low-S-Malleability.',
    timeSaved: '45 Sekunden statt Cross-Chain-Stichproben',
    category: 'smart-account',
    audiences: ['multisig', 'builder'],
    seoTitle: 'Passkey Smart Account Multi-Chain pruefen',
    seoDesc: 'WebAuthn-/P-256-Smart-Accounts multi-chain testen: RIP-7212-Precompile-Erkennung mit echtem 160-Byte-Testvektor, Malleability-Check und Recovery-Scorecard.',
  },
  {
    id: 6,
    slug: 'userop-autopsy',
    name: 'UserOp-Autopsy',
    tagline: 'Versteckte Aufschlaege in UserOps sezieren',
    problem: 'Bundler- und Paymaster-Aufschlaege in ERC-4337 sind fuer Nutzer undurchsichtig.',
    solution: 'Zerlegt Bundler-Marge in Gaspreis- und Gaseinheiten-Aufschlag und berechnet den effektiven Token-Spread von ERC-20-Paymastern.',
    timeSaved: '30 Sekunden statt Receipt-Log-Arithmetik',
    category: 'agents-intents-privacy',
    audiences: ['builder', 'multisig'],
    seoTitle: 'ERC-4337 Gebuehren analysieren: UserOp-Autopsy',
    seoDesc: 'Forensische Gebuehrenanalyse fuer Account Abstraction: Bundler-Marge, Gaspreis-Aufschlag und Paymaster-Token-Spread aus Receipts und EntryPoint-Logs berechnen.',
  },
  {
    id: 7,
    slug: 'x402-paywallguard',
    name: 'x402-PaywallGuard',
    tagline: 'KI-Agenten-Zahlungen auditieren, bevor sie brennen',
    problem: 'x402- und SIWX-Integrationen enthalten kritische Luecken, die in Standard-Audits fehlen.',
    solution: 'Prueft Lockfiles gegen bekannte Schwachstellen, scannt SIWX-Code-Patterns und bewertet ERC-7715-Policies gegen acht Schutzdimensionen.',
    timeSaved: '2 Minuten statt halbtagemanueller Dependency-Forensik',
    category: 'agents-intents-privacy',
    audiences: ['builder'],
    seoTitle: 'x402 Agentenzahlungen auditieren: x402-PaywallGuard',
    seoDesc: 'Sicherheits-Auditor fuer HTTP-402-Agentenzahlungen: Schwachstellen-Check, SIWX-Pattern-Scanner, ERC-7715-Policy-Radar und Delivery-Abgleich. Lokal im Browser.',
  },
  {
    id: 8,
    slug: 'intentlens-7683',
    name: 'IntentLens-7683',
    tagline: 'Cross-Chain-Intents dekodieren und retten',
    problem: 'ERC-7683-Orders verstecken Solver-Spreads und Timeout-Refunds bleiben oft ungehoben.',
    solution: 'Dekodiert GaslessCrossChainOrder-Daten herstellerunabhaengig, beziffert den Solver-Spread und generiert Refund-Calldata nach Deadline-Ablauf.',
    timeSaved: '1 Minute statt ABI-Ratespiel',
    category: 'agents-intents-privacy',
    audiences: ['builder'],
    seoTitle: 'ERC-7683 Intents dekodieren: IntentLens-7683',
    seoDesc: 'Cross-Chain-Intents (ERC-7683) herstellerunabhaengig dekodieren: Solver-Spread berechnen, Deadline-Status pruefen und Refund-Calldata zum Selbstabsenden erzeugen.',
  },
  {
    id: 9,
    slug: 'stealthaudit-5564',
    name: 'StealthAudit-5564',
    tagline: 'Stealth-Eingaenge zeitlich eingegrenzt exportieren',
    problem: 'Stealth-Adressen sind fuer Steuer- und Erbfallnachweise ein schwarzes Loch.',
    solution: 'Scannt EIP-5564-Announcements im WebWorker strikt im gewaehlten Zeit- und Blockfenster und exportiert nur den begrenzten Ausschnitt.',
    timeSaved: '5 Minuten statt Voll-Scan-Toolchain',
    category: 'agents-intents-privacy',
    audiences: ['coldwallet'],
    seoTitle: 'EIP-5564 Stealth-Adressen pruefen: StealthAudit',
    seoDesc: 'Lokaler Viewing-Key-Scanner fuer Stealth-Adressen (EIP-5564/ERC-6538): zeitlich eingegrenzter Scan im WebWorker, Zuordnungsnachweise, CSV-/JSON-Export ohne Schluessel.',
  },
  {
    id: 10,
    slug: 'bundlewatch-ens',
    name: 'BundleWatch-ENS',
    tagline: 'dApp-Frontends gegen ENS-Referenz verifizieren',
    problem: 'Manipulierte dApp-Frontends leiten Signaturen auf falsche Contracts um.',
    solution: 'Gleicht Live-Bundle-Hashes gegen ENS-contenthash (EIP-1577) und Release-Archive ab und zeigt Governance-Risiken des ENS-Namens.',
    timeSaved: '1 Minute statt manuellem Skript-Hash-Puzzle',
    category: 'agents-intents-privacy',
    audiences: ['multisig', 'builder'],
    seoTitle: 'dApp Frontend Integritaet pruefen: BundleWatch-ENS',
    seoDesc: 'Externe Integritaetspruefung von dApp-Frontends: Skript-Hashes gegen ENS-contenthash (EIP-1577) und Release-Archive vergleichen, Governance-Ampel und Domain-Diffs.',
  },
];

export const toolBySlug = (slug: string): ToolDef | undefined => TOOLS.find((t) => t.slug === slug);

/** Formatiert eine Adresse visuell in Vierer-Bloecke (Anti-Fehler-Darstellung). */
export function chunkAddress(addr: string): string[] {
  const clean = addr.trim();
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += 4) parts.push(clean.slice(i, i + 4));
  return parts;
}
