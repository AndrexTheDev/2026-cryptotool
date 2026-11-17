// Schlankes EVM-Hilfsmodul: keccak/RLP/Slot-Computation ohne HTTP-Layer.

/** EIP-1967 Slots (hart kodiert, oeffentlich dokumentierte Konstanten). */
export const EIP1967 = {
  IMPLEMENTATION: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  ADMIN: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d2a717850b5d6103',
  BEACON: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
} as const;

let _viem: typeof import('viem') | null = null;
export async function viemLazy() {
  if (!_viem) _viem = await import('viem');
  return _viem;
}

/** ERC-7201 Namespace-Root-Slot: keccak256(abi.encode(uint256(keccak256(id)) - 1)) & ~0xff */
export async function erc7201Slot(namespaceId: string): Promise<string> {
  const v = await viemLazy();
  const inner = v.keccak256(v.toBytes(namespaceId));
  const n = BigInt(inner) - 1n;
  const encoded = v.encodeAbiParameters([{ type: 'uint256' }], [n]);
  const slot = BigInt(v.keccak256(encoded)) & ~0xffn;
  return '0x' + slot.toString(16).padStart(64, '0');
}

export async function keccakHex(hex: string): Promise<string> {
  const v = await viemLazy();
  return v.keccak256(hex as `0x${string}`);
}

/** EIP-7702 Authorization-Digest: keccak256(0x05 || rlp([chainId, address, nonce])) */
export async function authorizationDigest(chainId: number, address: string, nonce: number): Promise<string> {
  const v = await viemLazy();
  const rlp = v.toRlp([v.toHex(chainId), address as `0x${string}`, v.toHex(nonce)]);
  return v.keccak256(v.concat(['0x05', rlp]));
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
export { ZERO_ADDR };

/** Extracts the delegate from EIP-7702 delegation bytecode (0xef0100 || addr). */
export function extract7702Delegate(code: string): string | null {
  const c = code.toLowerCase();
  if (!c.startsWith('0xef0100')) return null;
  const addrHex = c.slice(8);
  if (addrHex.length !== 40) return null;
  return '0x' + addrHex;
}

export interface StorageEntry {
  slot: string;
  value: string;
}

/** Parses manual storage dumps: one line per entry "slot value" (hex preferred) or JSON. */
export function parseStorageDump(text: string): StorageEntry[] {
  const t = text.trim();
  if (!t) return [];
  try {
    const j = JSON.parse(t) as Record<string, string> | StorageEntry[];
    if (Array.isArray(j)) return j.filter((e) => e && 'slot' in e && 'value' in e);
    return Object.entries(j).map(([slot, value]) => ({ slot, value: String(value) }));
  } catch {
    const lines = t.split(/\r?\n/);
    const out: StorageEntry[] = [];
    for (const line of lines) {
      const m = line.match(/^\s*(0x[0-9a-fA-F]+|\d+)\s*[:=,;\s]\s*(0x[0-9a-fA-F]+)/);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        const slotRaw = BigInt(m[1]);
        out.push({ slot: '0x' + slotRaw.toString(16).padStart(64, '0'), value: m[2] });
      }
    }
    return out;
  }
}

/** Static bytecode risk scan: skip PUSH data and search for critical opcodes. */
export function scanBytecodePatterns(code: string): { opcode: string; label: string; count: number }[] {
  const bytes = (code.startsWith('0x') ? code.slice(2) : code).toLowerCase();
  const found: { f4: number; ff: number; f0: number } = { f4: 0, ff: 0, f0: 0 };
  let i = 0;
  while (i < bytes.length / 2) {
    const b = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
    if (b >= 0x60 && b <= 0x7f) {
      i += 1 + (b - 0x5f); // skip PUSHn
      continue;
    }
    if (b === 0xf4) found.f4 += 1; // DELEGATECALL
    if (b === 0xff) found.ff += 1; // SELFDESTRUCT
    if (b === 0xf0) found.f0 += 1; // CREATE
    i += 1;
  }
  const out = [
    { opcode: 'DELEGATECALL (0xf4)', label: 'Delegierte Ausfuehrung fremden Codes', count: found.f4 },
    { opcode: 'SELFDESTRUCT (0xff)', label: 'Selbstzerstoerungs-Pfad vorhanden', count: found.ff },
    { opcode: 'CREATE (0xf0)', label: 'Kann neue Contracts erzeugen', count: found.f0 },
  ] as const;
  return out.filter((o) => o.count > 0);
}
