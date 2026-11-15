// ENS-Aufloesung + Governance-Pruefung (rein via eth_call, clientseitig).
import { ethCall, getCode } from './rpc';

export const ENS_REGISTRY = '0x00000000000C2E13eAa9B0DC45C480Ff132742Da';
// ENS Universal Resolver (kanonische Mainnet-Adresse)
export const UNIVERSAL_RESOLVER = '0xeeeeeeee14d718c2b47d9923deab1335e144eeee';

/** DNS-kodierte ENS-Namen (wire format) fuer den Universal Resolver. */
export function dnsEncodeName(name: string): string {
  const bytes: number[] = [];
  for (const label of name.toLowerCase().replace(/\.$/, '').split('.')) {
    const enc = new TextEncoder().encode(label);
    bytes.push(enc.length, ...enc);
  }
  bytes.push(0);
  return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface EnsResolution {
  name: string;
  contenthash?: string;
  resolverAddress?: string;
  owner?: string;
  error?: string;
}

/**
 * Liest contenthash ueber den Universal Resolver: resolve(dnsName, contenthash(namehash(name)))
 * und den Owner ueber das Registry-Contract (ownerOf(node)).
 */
export async function resolveEns(name: string): Promise<EnsResolution> {
  const v = await import('viem');
  const node = v.namehash(name);
  const out: EnsResolution = { name };

  // contenthash ueber Universal Resolver
  const contenthashCall = v.encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'contenthash',
        stateMutability: 'view',
        inputs: [{ name: 'node', type: 'bytes32' }],
        outputs: [{ name: '', type: 'bytes' }],
      },
    ] as const,
    functionName: 'contenthash',
    args: [node],
  });
  const resolveCall = v.encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'resolve',
        stateMutability: 'view',
        inputs: [
          { name: 'name', type: 'bytes' },
          { name: 'data', type: 'bytes' },
        ],
        outputs: [
          { name: 'result', type: 'bytes' },
          { name: 'resolver', type: 'address' },
        ],
      },
    ] as const,
    functionName: 'resolve',
    args: [dnsEncodeName(name) as `0x${string}`, contenthashCall],
  });

  try {
    const res = await ethCall(1, UNIVERSAL_RESOLVER, resolveCall);
    if (res.data && res.data !== '0x') {
      const decoded = v.decodeAbiParameters(
        [
          { type: 'bytes', name: 'result' },
          { type: 'address', name: 'resolver' },
        ],
        res.data as `0x${string}`,
      );
      const [result, resolver] = decoded as [string, string];
      if (result && result !== '0x') {
        // inneres ABI: dynamisches bytes
        const inner = v.decodeAbiParameters([{ type: 'bytes', name: 'ch' }], result as `0x${string}`) as unknown as [string];
        out.contenthash = inner[0];
      }
      out.resolverAddress = resolver;
    }
  } catch (e) {
    out.error = 'ENS/contenthash nicht lesbar: ' + (e as Error).message;
  }

  // Owner via Registry
  try {
    const ownerCall = v.encodeFunctionData({
      abi: [
        {
          type: 'function',
          name: 'owner',
          stateMutability: 'view',
          inputs: [{ name: 'node', type: 'bytes32' }],
          outputs: [{ name: '', type: 'address' }],
        },
      ] as const,
      functionName: 'owner',
      args: [node],
    });
    const res = await ethCall(1, ENS_REGISTRY, ownerCall);
    if (res.data && res.data.length >= 66) out.owner = '0x' + res.data.slice(-40);
  } catch (e) {
    out.error = (out.error ? out.error + ' ' : '') + 'Owner nicht lesbar: ' + (e as Error).message;
  }
  return out;
}

export interface GovernanceResult {
  owner: string;
  kind: 'multisig-contract' | 'contract' | 'eoa' | 'unknown';
  ownerCount?: number;
  detail: string;
}

/** Prueft, ob der ENS-Owner ein Multisig (Safe-Interface) oder ein einzelner EOA ist. */
export async function checkGovernance(owner: string): Promise<GovernanceResult> {
  const v = await import('viem');
  try {
    const code = await getCode(1, owner);
    if (!code.data || code.data === '0x') {
      return {
        owner,
        kind: 'eoa',
        detail: 'Ein einzelner EOA kontrolliert den ENS-Namen — ein kompromittierter Schluessel reicht, um das Frontend umzulenken.',
      };
    }
    // Vertrag: Safe-getOwners() probieren
    try {
      const getOwners = v.encodeFunctionData({
        abi: [{ type: 'function', name: 'getOwners', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address[]' }] }] as const,
        functionName: 'getOwners',
      });
      const res = await ethCall(1, owner, getOwners);
      if (res.data && res.data !== '0x') {
        const decoded = v.decodeAbiParameters([{ type: 'address[]', name: 'owners' }], res.data as `0x${string}`) as unknown as [string[]];
        return {
          owner,
          kind: 'multisig-contract',
          ownerCount: decoded[0].length,
          detail: `Contract mit Safe-aehnlichem getOwners(): ${decoded[0].length} Owner. Multisig-Exposition niedriger, aber Threshold pruefen.`,
        };
      }
    } catch {
      /* kein Safe-Interface */
    }
    return { owner, kind: 'contract', detail: 'Contract als Owner (Multisig-Ablesewidertest fehlgeschlagen oder anderes Schema). Manuell verifizieren.' };
  } catch (e) {
    return { owner, kind: 'unknown', detail: 'Governance nicht bestimmbar: ' + (e as Error).message };
  }
}

/** sha256 hex eines Textes (WebCrypto). */
export async function sha256Hex(text: string | Uint8Array): Promise<string> {
  const data = typeof text === 'string' ? new TextEncoder().encode(text) : new Uint8Array(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
