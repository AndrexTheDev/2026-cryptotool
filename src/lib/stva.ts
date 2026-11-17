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

/** Safe v1.3.x typed data for safeTxHash (contract version with chainId in the domain). */
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

/** Parses a Safe web app JSON export (tolerant of spelling variants). */
export function parseSafeExport(text: string): { safeTx: SafeTx; safeAddress: string; chainId: number; safeTxHash?: string | undefined } | null {
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
// (registry excerpt, bundled locally — no network fetch). Format modeled on
// ERC-7730: selector -> human-readable field description.
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
    riskNote: 'Replaces the entire execution logic of the proxy.',
  },
  {
    selector: '0x4f1ef286',
    label: 'UUPS-Proxy: Implementierung wechseln + Initialisierungsaufruf (upgradeToAndCall)',
    fields: [
      { path: 'newImplementation', label: 'Neue Implementierung' },
      { path: 'data', label: 'Initialisierungs-Calldata' },
    ],
    riskNote: 'Replaces the logic AND immediately executes code in the proxy context.',
  },
  {
    selector: '0x6a761202',
    label: 'Safe multisig: execute transaction (execTransaction)',
    fields: [
      { path: 'to', label: 'Target' },
      { path: 'value', label: 'ETH amount (wei)' },
      { path: 'operation', label: 'Operation (0=Call, 1=DelegateCall)' },
    ],
    riskNote: 'operation=1 (DelegateCall) executes foreign code with multisig privileges.',
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
  descriptor?: ClearSignDescriptor | undefined;
}

export async function decodeUpgradeCalldata(calldata: string): Promise<DecodedCall | null> {
  const cd = calldata.trim();
  if (!/^0x([0-9a-fA-F]{2})+$/.test(cd) || cd.length < 10) return null;
  const selector = cd.slice(0, 10).toLowerCase();
  try {
    const v = await import('viem');
    const decoded = v.decodeFunctionData({ abi: UPGRADE_ABIS as unknown as never[], data: cd as `0x${string}` });
    // args is a positional array → map onto the parameter names of the ABI used
    const abiEntry = (UPGRADE_ABIS as readonly { name: string; inputs: readonly { name: string }[] }[]).find(
      (a) => a.name === decoded.functionName,
    );
    const argsArr = Array.isArray(decoded.args) ? decoded.args : decoded.args != null ? [decoded.args] : [];
    const args: Record<string, unknown> = {};
    (abiEntry?.inputs ?? []).forEach((inp, i) => {
      const val = argsArr[i];
      args[inp.name] = typeof val === 'bigint' ? val.toString() : val;
    });
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
    const hashDomainLoose = v.hashDomain as unknown as (x: unknown) => string;
    const hashStructLoose = v.hashStruct as unknown as (x: unknown) => string;
    const hashTypedDataLoose = v.hashTypedData as unknown as (x: unknown) => string;
    const domainSeparator = hashDomainLoose({ domain, types });
    const messageHash = hashStructLoose({ data: td.message, primaryType: td.primaryType, types });
    const digest = hashTypedDataLoose({ domain, types, primaryType: td.primaryType, message: td.message });
    return { domainSeparator, messageHash, digest };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Kanonische Safe-Singleton-Registry (Quelle: safe-global/safe-deployments,
// Stand 2026-11; v1.5.0 seit 03.07.2025 onchain, seit 09/2026 offiziell als
// Upgrade-Empfehlung in Safe{Wallet}).
// addresses are stored lowercase-normalized (checksum verification via
// im Upstream-Repo).
export interface SafeSingleton {
  version: string;
  variant: 'Safe' | 'SafeL2' | 'SafeMigration';
  deployment: 'canonical' | 'eip155' | 'zksync';
}

export const SAFE_SINGLETONS: Record<string, SafeSingleton> = {
  '0xd9db270c1b5e3bd161e8c8503c55ceabee709552': { version: '1.3.0', variant: 'Safe', deployment: 'canonical' },
  '0x69f4d1788e39c87893c980c06edf4b7f686e2938': { version: '1.3.0', variant: 'Safe', deployment: 'eip155' },
  '0x3e5c63644e683549055b9be8653de26e0b4cd36e': { version: '1.3.0', variant: 'SafeL2', deployment: 'canonical' },
  '0xfb1bffc9d739b8d520daf37df666da4c687191ea': { version: '1.3.0', variant: 'SafeL2', deployment: 'eip155' },
  '0x41675c099f32341bf84bfc5382af534df5c7461a': { version: '1.4.1', variant: 'Safe', deployment: 'canonical' },
  '0x29fcb43b46531bca003ddc8fcb67ffe91900c762': { version: '1.4.1', variant: 'SafeL2', deployment: 'canonical' },
  '0xff51a5898e281db6dfc7855790607438df2ca44b': { version: '1.5.0', variant: 'Safe', deployment: 'canonical' },
  '0xedd160febbd92e350d4d398fb636302fccd67c7e': { version: '1.5.0', variant: 'SafeL2', deployment: 'canonical' },
  '0x6439e7abd8bb915a5263094784c5cf561c4172ac': { version: '1.5.0', variant: 'SafeMigration', deployment: 'canonical' },
};

export function lookupSafeSingleton(address: string): SafeSingleton | undefined {
  return SAFE_SINGLETONS[address.toLowerCase()];
}
