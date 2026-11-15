// Minimaler EIP-1577-Contenthash-Decoder.
//
// Dokumentierter Bibliotheks-Ersatz (Phase-1-Recherche):
// Das Paket "content-hash" (letztes Release 2.5.x) zieht die veralteten
// cids/multibase/multihashes-Stapel mit harter Node-Buffer-Abhaengigkeit in
// den Browser-Bundle. Fuer den tatsaechlich benoetigten Umfang (ipfs/ipns mit
// sha2-256-Multihash, CIDv0/v1) genuegt dieser schlanke Decoder auf Basis von
// @scure/base - ohne Buffer-Polyfills und < 2 KB Bundle.
import { base58, hex } from '@scure/base';

export type DecodedContenthash =
  | { kind: 'ipfs'; cid: string }
  | { kind: 'ipns'; cid: string }
  | { kind: 'unknown'; raw: string };

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let i = offset;
  while (i < bytes.length) {
    const b = bytes[i];
    value |= (b & 0x7f) << shift;
    i += 1;
    if ((b & 0x80) === 0) return { value, next: i };
    shift += 7;
  }
  throw new Error('Varint abgeschnitten');
}

/**
 * Dekodiert den ABI-Hex eines ENS-contenthash-Feldes.
 * Akzeptiert rohen contenthash-Hex (0xe30101...) oder umhuelltes bytes-ABI.
 */
export function decodeContenthash(input: string): DecodedContenthash {
  let bytes: Uint8Array;
  try {
    bytes = hex.decode((input.startsWith('0x') ? input.slice(2) : input).toLowerCase());
  } catch {
    return { kind: 'unknown', raw: input };
  }
  if (bytes.length === 0) return { kind: 'unknown', raw: input };

  // Ggf. dynamische bytes-Umhuellung (offset 0x20 + length) abschuelen
  if (bytes.length > 64 && Number(BigInt('0x' + hex.encode(bytes.slice(0, 32)))) === 32) {
    const len = Number(BigInt('0x' + hex.encode(bytes.slice(32, 64))));
    if (bytes.length >= 64 + len) bytes = bytes.slice(64, 64 + len);
  }

  const codec = readVarint(bytes, 0);
  // 0xe3 = ipfs-ns, 0xe5 = ipns-ns, 0xf2 = kad? (nicht benoetigt)
  if (codec.value !== 0xe3 && codec.value !== 0xe5) return { kind: 'unknown', raw: input };
  let rest = bytes.slice(codec.next);

  // CIDv0 ist direkt ein Multihash: 0x12 0x20 <32 Byte sha2-256>
  if (rest[0] === 0x12 && rest[1] === 0x20 && rest.length >= 34) {
    const cid = base58.encode(rest.slice(0, 34)); // CIDv0 ist plain base58 (Qm...)
    return { kind: codec.value === 0xe3 ? 'ipfs' : 'ipns', cid };
  }

  // CIDv1: version(1) + codec(varint) + multihash
  if (rest[0] === 0x01) {
    const mh = rest.slice(1);
    const mcodec = readVarint(mh, 0);
    const body = mh.slice(mcodec.next);
    // als base32-cidv1-Text ausgeben (nur lesbar, kein Gateway-Fetch noetig)
    const cidBytes = rest.slice(0, 1 + mcodec.next + body.length);
    // base32 (cidv1 konvention: 'b' + rfc4648-base32-lower)
    const b32 = base32LowerEncode(cidBytes);
    return { kind: codec.value === 0xe3 ? 'ipfs' : 'ipns', cid: 'b' + b32 };
  }

  return { kind: 'unknown', raw: input };
}

/** RFC-4648 Base32 lower-case ohne Padding (fuer CIDv1 'b...'). */
function base32LowerEncode(data: Uint8Array): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const byte of data) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(acc << (5 - bits)) & 31];
  return out;
}

/** Baut eine lesbare Gateway-URL (nur clientseitiger Abruf, kein Proxy). */
export function ipfsGatewayUrl(cid: string, subpath = ''): string {
  const path = cid.startsWith('b') ? cid : cid;
  return `https://ipfs.io/ipfs/${path}${subpath ? `/${subpath}` : ''}`;
}
