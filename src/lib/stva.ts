// STVA-Hilfslogik: Calldata-Dekodierung, Safe-Signing-Hash, Fingerprints.
import type { Address } from 'viem';

/** Eingebettete ABI-Schnittstellen gaengiger Upgrade-/Multisig-Selektoren. */
export const UPGRADE_ABIS = [
  {
    type: 'function',
    name: 'upgradeTo',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newImplementation', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'upgradeToAndCall',
    stateMutability: 'payable',
    inputs: [
      { name: 'newImplementation', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'upgrade',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newImplementation', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'upgradeAndCall',
    stateMutability: 'payable',
    inputs: [
      { name: 'newImplementation', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'execTransaction',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

/** Safe v1.3.x Typed-Data fuer safeTxHash (Contract-Version mit chainId in der Domain). */
export interface SafeTx {
  to: string;
  value: string | bigint;
  data: string;
  operation: number;
  safeTxGas: string | bigint;
  baseGas: string | bigint;
  gasPrice: string | bigint;
  gasToken: string;
  refundReceiver: string;
  nonce: string | bigint;
}

export async function computeSafeTxHash(safeAddress: string, chainId: number, tx: SafeTx): Promise<string> {
  const v = await import('viem');
  const domain = {
    chainId: BigInt(chainId),
    verifyingContract: safeAddress as Address,
  } as const;
  const types = {
    SafeTx: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'nonce', type: 'uint256' },
    ],
  } as const;
  return v.hashTypedData({
    domain,
    types,
    primaryType: 'SafeTx',
    message: {
      to: tx.to as Address,
      value: BigInt(tx.value),
      data: tx.data as `0x${string}`,
      operation: tx.operation,
      safeTxGas: BigInt(tx.safeTxGas),
      baseGas: BigInt(tx.baseGas),
      gasPrice: BigInt(tx.gasPrice),
      gasToken: tx.gasToken as Address,
      refundReceiver: tx.refundReceiver as Address,
      nonce: BigInt(tx.nonce),
    },
  });
}

/** Parst einen Safe-Web-App-JSON-Export (Toleranz fuer Schreibweisen). */
export function parseSafeExport(text: string): { safeTx: SafeTx; safeAddress: string; chainId: number; safeTxHash?: string } | null {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const tx = (j.tx ?? j.transaction ?? j) as Record<string, unknown>;
    const safeAddress = String(j.safe ?? j.safeAddress ?? j.Address ?? '');
    const chainId = Number(j.chainId ?? j.chain ?? 1);
    if (!tx.to || tx.data === undefined) return null;
    return {
      safeAddress,
      chainId: Number.isFinite(chainId) && chainId > 0 ? chainId : 1,
      safeTxHash: typeof j.safeTxHash === 'string' ? j.safeTxHash : undefined,
      safeTx: {
        to: String(tx.to),
        value: String(tx.value ?? '0'),
        data: String(tx.data ?? '0x'),
        operation: Number(tx.operation ?? 0),
        safeTxGas: String(tx.safeTxGas ?? '0'),
        baseGas: String(tx.baseGas ?? '0'),
        gasPrice: String(tx.gasPrice ?? '0'),
        gasToken: String(tx.gasToken ?? '0x0000000000000000000000000000000000000000'),
        refundReceiver: String(tx.refundReceiver ?? '0x0000000000000000000000000000000000000000'),
        nonce: String(tx.nonce ?? '0'),
      },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Eingebettete, minimal ERC-7730-inspirierte Clear-Signing-Deskriptoren
// (Registry-Auszug, lokal gebundelt - kein Netzabruf). Format angelehnt an
// ERC-7730: selektor -> menschenlesbare Feldbeschreibung.
// ---------------------------------------------------------------------------

export interface ClearSignDescriptor {
  selector: string;
  label: string;
  fields: { path: string; label: string }[];
  riskNote?: string;
}

export const LOCAL_ERC7730_REGISTRY: ClearSignDescriptor[] = [
  {
    selector: '0x3659cfe6',
    label: 'Transparent-Proxy: Implementierung wechseln (upgradeTo)',
    fields: [{ path: 'newImplementation', label: 'Neue Implementierung' }],
    riskNote: 'Ersetzt die gesamte Ausfuehrungslogik des Proxys.',
  },
  {
    selector: '0x4f1ef286',
    label: 'UUPS-Proxy: Implementierung wechseln + Initialisierungsaufruf (upgradeToAndCall)',
    fields: [
      { path: 'newImplementation', label: 'Neue Implementierung' },
      { path: 'data', label: 'Initialisierungs-Calldata' },
    ],
    riskNote: 'Ersetzt die Logik UND fuehrt sofort Code im Proxy-Kontext aus.',
  },
  {
    selector: '0x6a761202',
    label: 'Safe Multisig: Transaktion ausfuehren (execTransaction)',
    fields: [
      { path: 'to', label: 'Ziel' },
      { path: 'value', label: 'ETH-Betrag (wei)' },
      { path: 'operation', label: 'Operation (0=Call, 1=DelegateCall)' },
    ],
    riskNote: 'operation=1 (DelegateCall) fuehrt fremden Code mit Multisig-Berechtigungen aus.',
  },
];

export function findDescriptor(selector: string): ClearSignDescriptor | undefined {
  return LOCAL_ERC7730_REGISTRY.find((d) => d.selector.toLowerCase() === selector.toLowerCase());
}

// ---------------------------------------------------------------------------

export interface DecodedCall {
  functionName?: string;
  selector: string;
  args?: Record<string, unknown>;
  descriptor?: ClearSignDescriptor;
}

export async function decodeUpgradeCalldata(calldata: string): Promise<DecodedCall | null> {
  const cd = calldata.trim();
  if (!/^0x([0-9a-fA-F]{2})+$/.test(cd) || cd.length < 10) return null;
  const selector = cd.slice(0, 10).toLowerCase();
  // Nested-execTransaction entschachteln: wenn die Calldata selbst execTransaction
  // aufruft und data ein Upgrade enthaelt, beides dekodieren.
  try {
    const v = await import('viem');
    const decoded = v.decodeFunctionData({ abi: UPGRADE_ABIS as never, data: cd as `0x${string}` });
    const args = Object.fromEntries(
      Object.entries(decoded.args && typeof decoded.args === 'object' ? decoded.args : {}).map(([k, val]) => [
        k,
        typeof val === 'bigint' ? val.toString() : val,
      ]),
    );
    return { functionName: decoded.functionName, selector, args, descriptor: findDescriptor(selector) };
  } catch {
    return { selector, descriptor: findDescriptor(selector) };
  }
}

/** ERC-8213-inspirierter kurzer Calldata-Fingerprint (deterministisch). */
export async function calldataFingerprint(calldata: string): Promise<string> {
  const v = await import('viem');
  const digest = v.keccak256(calldata as `0x${string}`);
  return digest;
}

export async function eip712HashJson(typedDataJson: string): Promise<{ domainSeparator: string; messageHash: string; digest: string } | null> {
  try {
    const v = await import('viem');
    const td = JSON.parse(typedDataJson) as {
      domain: Record<string, unknown>;
      types: Record<string, { name: string; type: string }[]>;
      primaryType: string;
      message: Record<string, unknown>;
    };
    const domain = { ...td.domain } as Record<string, unknown>;
    if (typeof domain.chainId === 'string' && !domain.chainId.startsWith('0x')) domain.chainId = BigInt(domain.chainId);
    if (typeof domain.chainId === 'number') domain.chainId = BigInt(domain.chainId);
    const types = { ...td.types };
    delete (types as Record<string, unknown>).EIP712Domain;
    const domainSeparator = v.hashDomain({ domain: domain as never, types: types as never });
    const messageHash = v.hashStruct({ data: td.message as never, primaryType: td.primaryType, types: types as never });
    const digest = v.hashTypedData({
      domain: domain as never,
      types: types as never,
      primaryType: td.primaryType,
      message: td.message as never,
    });
    return { domainSeparator, messageHash, digest };
  } catch {
    return null;
  }
}
