// BIP-322-Minimalhelfer (P2TR/P2WPKH simple signatures).
//
// Verifikation laeuft ueber bip322-js (lazy, mit dokumentiertem feross/buffer-
// Shim). Zusaetzlich enthaelt dieses Modul einen eigenen deterministischen
// P2TR-Signer (Noble secp256k1/schnorr) - ausschliesslich fuer das lokale
// Demo-Szenario mit dem oeffentlich bekannten Testschluessel 0x01 gedacht.
// NIEMALS echte private Schluessel hier eingeben.

const concat = (...a: Uint8Array[]): Uint8Array => {
  const n = a.reduce((s, b) => s + b.length, 0);
  const o = new Uint8Array(n);
  let p = 0;
  for (const b of a) {
    o.set(b, p);
    p += b.length;
  }
  return o;
};
const le32 = (n: number): Uint8Array => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const le64 = (n: bigint | number): Uint8Array => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n), true);
  return b;
};
const vi = (n: number): Uint8Array => {
  if (n < 0xfd) return Uint8Array.of(n);
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return concat(Uint8Array.of(0xfd), b);
};

async function noble() {
  const curves = await import('@noble/curves/secp256k1.js');
  const sha2 = await import('@noble/hashes/sha2.js');
  return { curves, sha2 };
}

function taggedHash(tag: string, msg: Uint8Array, sha256: (m: Uint8Array) => Uint8Array): Uint8Array {
  const t = sha256(new TextEncoder().encode(tag));
  return sha256(concat(t, t, msg));
}

export async function bip322MessageHash(message: string): Promise<Uint8Array> {
  const { sha2 } = await noble();
  return taggedHash('BIP0322-signed-message', new TextEncoder().encode(message), sha2.sha256);
}

/** x-only-P2TR-Adresse (bech32m) aus internem Pubkey. */
export async function p2trAddress(xOnlyPub: Uint8Array): Promise<string> {
  const { bech32m } = await import('@scure/base');
  return bech32m.encode('bc', [1, ...bech32m.toWords(xOnlyPub)]);
}

/**
 * Signiert eine Nachricht per BIP-322 simple (P2TR key-path, SIGHASH_DEFAULT).
 * NUR fuer Demo-/Testzwecke mit bekannten Testschluesseln.
 */
export async function signBip322P2tr(privKey: Uint8Array, message: string): Promise<{ address: string; signatureBase64: string }> {
  const { curves, sha2 } = await noble();
  const { schnorr } = curves;
  const pubX = schnorr.getPublicKey(privKey);
  const address = await p2trAddress(pubX);
  const scriptPubKey = concat(Uint8Array.of(0x51, 0x20), pubX);

  const msgHash = await bip322MessageHash(message);
  const scriptSig = concat(Uint8Array.of(0x00, 0x20), msgHash);
  const toSpend = concat(
    le32(0),
    vi(1),
    new Uint8Array(32),
    le32(0xffffffff),
    vi(scriptSig.length),
    scriptSig,
    le32(0),
    vi(1),
    le64(0),
    vi(scriptPubKey.length),
    scriptPubKey,
    le32(0),
  );
  const toSpendTxid = sha2.sha256(sha2.sha256(toSpend));
  const sighash = taggedHash(
    'TapSighash',
    concat(
      Uint8Array.of(0x00), // epoch
      concat(
        Uint8Array.of(0x00), // SIGHASH_DEFAULT
        le32(0), // nVersion
        le32(0), // nLockTime
        sha2.sha256(concat(toSpendTxid, le32(0))), // sha_prevouts
        sha2.sha256(le64(0)), // sha_amounts
        sha2.sha256(concat(vi(scriptPubKey.length), scriptPubKey)), // sha_scriptpubkeys
        sha2.sha256(le32(0)), // sha_sequences
        sha2.sha256(concat(le64(0), vi(1), Uint8Array.of(0x6a))), // sha_outputs (OP_RETURN UTXO)
        Uint8Array.of(0), // spend_type
        le32(0), // input index
      ),
    ),
    sha2.sha256,
  );
  const sig = await schnorr.sign(sighash, privKey);
  const witness = concat(vi(1), vi(sig.length), sig);
  const { base64 } = await import('@scure/base');
  // BIP-322 Complete (v1.0.0, 04/2026): smp-Praefix ist Pflicht fuer Signer.
  return { address, signatureBase64: 'smp' + base64.encode(witness) };
}

/** Stellt sicher, dass bitcoinjs-lib-basierte Pakete (bip322-js) Buffer vorfinden. */
export async function ensureBufferShim(): Promise<void> {
  const g = globalThis as unknown as { Buffer?: unknown };
  if (!g.Buffer) {
    const m = await import('buffer');
    g.Buffer = m.Buffer;
  }
}

// ---------------------------------------------------------------------------
// BIP-322 v1.0.0 (Complete, 15.04.2026): Signatur-Varianten mit Klartext-Praefix.
// Signer MUESSEN 'smp' | 'ful' | 'pof' direkt vor das Base64 setzen (ohne
// Trennzeichen); Verifier duerfen bei fehlendem Praefix 'simple' annehmen
// (Backward-Compatibility-Klausel des BIP). Erkennung ist hier sicher, da
// simple/full-Payloads ihrerseits stets mit kompaktem Zaehler- bzw.
// Transaktionsversions-Byte beginnen (erster Base64-Lauf startet mit 'A'/'B').
export type Bip322Variant = 'simple-prefixed' | 'simple-legacy' | 'full' | 'pof';

export function classifyBip322Signature(signature: string): { variant: Bip322Variant; payload: string } {
  const s = signature.trim();
  if (s.startsWith('smp')) return { variant: 'simple-prefixed', payload: s.slice(3) };
  if (s.startsWith('ful')) return { variant: 'full', payload: s.slice(3) };
  if (s.startsWith('pof')) return { variant: 'pof', payload: s.slice(3) };
  return { variant: 'simple-legacy', payload: s };
}

export interface PofInspection {
  inputs: number;
  message?: string;
  keyTypes: number[];
}

/**
 * Liegt ein finalisiertes PSBT (BIP-174) vor: Proof-of-Funds-Variante der
 * finalen BIP-322-Spezifikation. Liest offline: Eingabe-Anzahl aus der
 * unsignedTx (Global-Key 0x00) und das optionale Message-Feld
 * PSBT_GLOBAL_GENERIC_SIGNED_MESSAGE (0x09, UTF-8).
 * UTXO-Ausgabestatus ist offline nicht pruefbar — das meldet der Caller.
 */
export function inspectPofPsbt(payloadBase64: string): PofInspection | null {
  try {
    const b64 = /[^A-Za-z0-9+/=]/.test(payloadBase64) ? null : payloadBase64;
    if (!b64 || b64.length % 4 !== 0) return null;
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (bytes.length < 6 || bytes[0] !== 0x70 || bytes[1] !== 0x73 || bytes[2] !== 0x62 || bytes[3] !== 0x74 || bytes[4] !== 0xff) return null;
    let off = 5;
    const readVi = (): number => {
      const b = bytes[off++];
      if (b < 0xfd) return b;
      const dv = new DataView(bytes.buffer, bytes.byteOffset);
      if (b === 0xfd) { const v = dv.getUint16(off, true); off += 2; return v; }
      if (b === 0xfe) { const v = dv.getUint32(off, true); off += 4; return v; }
      const v = Number(dv.getBigUint64(off, true)); off += 8; return v;
    };
    const out: PofInspection = { inputs: 0, keyTypes: [] };
    while (off < bytes.length) {
      const klen = readVi();
      if (klen === 0) break; // Global-Map-Separator
      const key = bytes.slice(off, off + klen);
      off += klen;
      const vlen = readVi();
      const value = bytes.slice(off, off + vlen);
      off += vlen;
      const keyType = key[0];
      out.keyTypes.push(keyType);
      if (keyType === 0x09) out.message = new TextDecoder().decode(value);
      if (keyType === 0x00) {
        // unsigned tx: version(4) + [keine segwit-marker in PSBT] + vin-count
        out.inputs = value.length >= 5 ? value[4] : 0;
      }
    }
    return out;
  } catch {
    return null;
  }
}

export interface Bip322VerifyResult {
  ok: boolean;
  detail: string;
  variant: Bip322Variant;
  pof?: PofInspection;
}

/** Verifiziert eine BIP-322-Signatur (simple/full; PoF wird format-inspektiert). */
export async function verifyBip322(address: string, message: string, signature: string): Promise<Bip322VerifyResult> {
  await ensureBufferShim();
  const cls = classifyBip322Signature(signature);
  if (cls.variant === 'pof') {
    const pof = inspectPofPsbt(cls.payload);
    if (!pof)
      return {
        ok: false,
        variant: 'pof',
        detail: 'pof-Payload ist kein gueltiges Base64-PSBT (Magic psbt\xff fehlt oder Map korrupt).',
      };
    const msgHit = pof.message != null ? (pof.message === message ? 'eingebettete Nachricht stimmt mit der Challenge ueberein' : 'eingebettete Nachricht WEICHT von der Challenge ab') : 'kein PSBT_GLOBAL_GENERIC_SIGNED_MESSAGE (0x09) eingebettet';
    return {
      ok: pof.message === message,
      variant: 'pof',
      pof,
      detail: `Proof-of-Funds-PSBT (BIP-322 v1.0.0): ${pof.inputs} Eingabe(n), ${msgHit}. Hinweis: Unspent-Status der UTXOs ist offline nicht pruefbar — zusaetzlich im Explorer/Node verifizieren.`,
    };
  }
  try {
    const { Verifier } = await import('bip322-js');
    // bip322-js 4.0.1 kennt die Praefixe nicht — Payload selbst abstreifen.
    const ok = await Verifier.verifySignature(address, message, cls.payload);
    const label = cls.variant === 'full' ? 'full' : cls.variant === 'simple-prefixed' ? 'simple (smp-Praefix, finale Spec)' : 'simple (Legacy ohne Praefix)';
    return {
      ok: !!ok,
      variant: cls.variant,
      detail: ok ? `BIP-322 ${label} Signatur gueltig.` : `Signatur (Variante ${label}) mathematisch ungueltig fuer diese Adresse und Nachricht.`,
    };
  } catch (e) {
    return { ok: false, variant: cls.variant, detail: 'Pruefung nicht moeglich: ' + (e as Error).message };
  }
}
