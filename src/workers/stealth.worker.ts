// StealthAudit-Worker: EIP-5564 (Schema 1) elliptische-Kurven-Scan-Schleifen.
// Krypto: @noble/curves secp256k1 + @noble/hashes keccak (deterministisch).
import { secp256k1 } from '@noble/curves/secp256k1.js';

// secp256k1 Gruppenordnung (Curve25519-Konstante n) - hart kodiert fuer Worker-Nutzung
const CURVE_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
import { keccak_256 } from '@noble/hashes/sha3.js';

export interface RawAnnouncement {
  schemeId: number;
  stealthAddress: string; // 0x + 40 hex
  ephemeralPubKey: string; // 0x + 66 hex (komprimiert, 33 B)
  metadata: string; // 0x…
  blockNumber: number;
  txHash?: string;
  caller?: string;
}

export interface StealthHit {
  schemeId: number;
  stealthAddress: string;
  ephemeralPubKey: string;
  viewTag: string; // hex 1 Byte
  blockNumber: number;
  txHash?: string;
  caller?: string;
  sharedSecretHash: string; // Zuordnungsnachweis (kein Viewing Key!)
}

const hex = (s: string) => {
  const c = s.startsWith('0x') ? s.slice(2) : s;
  const out = new Uint8Array(c.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(c.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const hexStr = (b: Uint8Array) => '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function pubToAddress(uncompressedNoPrefix: Uint8Array): string {
  return '0x' + Array.from(keccak_256(uncompressedNoPrefix).slice(12), (x) => x.toString(16).padStart(2, '0')).join('');
}

export function scanAnnouncements(
  viewingPrivHex: string,
  spendingPubHex: string,
  announcements: RawAnnouncement[],
  minBlock?: number,
  maxBlock?: number,
): { hits: StealthHit[]; checked: number; tagFiltered: number } {
  const t0 = Date.now();
  const vPriv = BigInt(viewingPrivHex);
  const P_spend = secp256k1.Point.fromBytes(hex(spendingPubHex));
  const hits: StealthHit[] = [];
  let tagFiltered = 0;
  let checked = 0;

  for (const a of announcements) {
    if (a.schemeId !== 1) continue;
    if (minBlock != null && a.blockNumber < minBlock) continue;
    if (maxBlock != null && a.blockNumber > maxBlock) continue;
    checked++;
    let eph: InstanceType<typeof secp256k1.Point>;
    try {
      eph = secp256k1.Point.fromBytes(hex(a.ephemeralPubKey));
    } catch {
      continue;
    }
    // Shared secret: c = ephemeralPub * viewingPriv (komprimiert)
    const shared = eph.multiply(vPriv).toBytes(true);
    const h = keccak_256(shared);
    const viewTag = h[0];

    const md = hex(a.metadata);
    const tagInMeta = md.length > 0 ? md[0] : undefined;
    if (tagInMeta !== undefined && tagInMeta !== viewTag) {
      tagFiltered++;
      continue; // View-Tag-Filter: billige Vorselektion
    }

    // Vollverifikation: stealthPub = P_spend + h*G
    const hPoint = secp256k1.Point.BASE.multiply(BigInt('0x' + Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('')));
    const stealth = P_spend.add(hPoint);
    const addr = pubToAddress(stealth.toBytes(false).slice(1));
    if (addr.toLowerCase() === a.stealthAddress.toLowerCase()) {
      hits.push({
        schemeId: a.schemeId,
        stealthAddress: a.stealthAddress,
        ephemeralPubKey: a.ephemeralPubKey,
        viewTag: '0x' + (viewTag ?? 0).toString(16).padStart(2, '0'),
        blockNumber: a.blockNumber,
        txHash: a.txHash,
        caller: a.caller,
        sharedSecretHash: hexStr(h),
      });
    }
    if (Date.now() - t0 > 500) {
      // Dem Event-Loop Luft lassen (Fortschritt) — Chunks ohnehin klein gehalten
    }
  }
  return { hits, checked, tagFiltered };
}

/** Demo-Generator: baut synthetische Announcements mit echter EIP-5564-Mathe. */
/** Deterministischer, gueltiger Skalar aus Bytes: Reduktion mod n, Retry bei 0. */
function scalarFromBytes(seed: Uint8Array): bigint {
  let counter = 0n;
  for (;;) {
    const input = new Uint8Array(seed.length + 1);
    input.set(seed);
    input[seed.length] = Number(counter & 0xffn);
    const k = BigInt('0x' + Array.from(keccak_256(input), (x) => x.toString(16).padStart(2, '0')).join('')) % CURVE_N;
    if (k > 0n) return k;
    counter++;
  }
}

export function genDemo(viewingPrivHex: string, spendingPubHex: string, count = 8, hitsWanted = 3): RawAnnouncement[] {
  const vPriv = BigInt(viewingPrivHex);
  if (!secp256k1.utils.isValidSecretKey(hex(viewingPrivHex))) throw new Error('Ungueltiger Viewing Key (nur Viewing Key, nie Spending Key).');
  const P_spend = secp256k1.Point.fromBytes(hex(spendingPubHex));
  const out: RawAnnouncement[] = [];
  let hits = 0;
  for (let i = 0; i < count; i++) {
    const hit = i % Math.max(1, Math.floor(count / hitsWanted)) === 0 && hits < hitsWanted;
    const ephPriv = scalarFromBytes(new TextEncoder().encode('demo-eph-' + i));
    const ephPub = secp256k1.Point.BASE.multiply(ephPriv);
    let stealth = P_spend;
    let viewTag = 0;
    if (hit) {
      const shared = ephPub.multiply(vPriv).toBytes(true);
      const h = keccak_256(shared);
      viewTag = h[0] ?? 0;
      const hPoint = secp256k1.Point.BASE.multiply(BigInt('0x' + Array.from(h, (x) => x.toString(16).padStart(2, '0')).join('')));
      stealth = P_spend.add(hPoint);
      hits++;
    } else {
      const rnd = keccak_256(new TextEncoder().encode('noise-' + i));
      viewTag = rnd[0] ?? 0;
      stealth = secp256k1.Point.BASE.multiply(scalarFromBytes(new TextEncoder().encode('noise-scalar-' + i)));
    }
    const addr = pubToAddress(stealth.toBytes(false).slice(1));
    out.push({
      schemeId: 1,
      stealthAddress: addr,
      ephemeralPubKey: hexStr(ephPub.toBytes(true)),
      metadata: '0x' + viewTag.toString(16).padStart(2, '0') + '00c0ffee',
      blockNumber: 21_000_000 + i * 137,
      txHash: '0x' + Array.from(keccak_256(new TextEncoder().encode('demo-tx-' + i)), (x) => x.toString(16).padStart(2, '0')).join(''),
      caller: '0x000000000000000000000000000000000000dE10',
    });
  }
  return out;
}

const gself: unknown = typeof self !== 'undefined' ? self : undefined;
if (gself) (gself as Worker).onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: 'scan'; viewingPrivHex: string; spendingPubHex: string; announcements: RawAnnouncement[]; minBlock?: number; maxBlock?: number }
    | { type: 'demo' };
  if (msg.type === 'demo') {
    // Demo-Schluessel: oeffentlich bekannte Testwerte (viewing 0x02, spending 0x03)
    const viewingPrivHex = '0x' + '0'.repeat(63) + '2';
    const spendingPub = secp256k1.Point.BASE.multiply(2n).toBytes(false); // spending unkomprimiert abgeleitet aus 0x03? -> wir nutzen priv 0x03:
    void spendingPub;
    const spendingPubHex = hexStr(secp256k1.Point.BASE.multiply(3n).toBytes(false));
    const announcements = genDemo(viewingPrivHex, spendingPubHex);
    (gself as unknown as Worker).postMessage({ type: 'demo', viewingPrivHex, spendingPubHex, announcements });
    return;
  }
  const { hits, checked, tagFiltered } = scanAnnouncements(msg.viewingPrivHex, msg.spendingPubHex, msg.announcements, msg.minBlock, msg.maxBlock);
  (gself as unknown as Worker).postMessage({ type: 'result', hits, checked, tagFiltered });
};
