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
  return { address, signatureBase64: base64.encode(witness) };
}

/** Stellt sicher, dass bitcoinjs-lib-basierte Pakete (bip322-js) Buffer vorfinden. */
export async function ensureBufferShim(): Promise<void> {
  const g = globalThis as unknown as { Buffer?: unknown };
  if (!g.Buffer) {
    const m = await import('buffer');
    g.Buffer = m.Buffer;
  }
}

/** Verifiziert eine BIP-322-simple-Signatur (P2WPKH / P2SH-P2WPKH / P2TR) via bip322-js. */
export async function verifyBip322(address: string, message: string, signatureBase64: string): Promise<{ ok: boolean; detail: string }> {
  await ensureBufferShim();
  try {
    const { Verifier } = await import('bip322-js');
    const ok = await Verifier.verifySignature(address, message, signatureBase64);
    return { ok: !!ok, detail: ok ? 'BIP-322 simple Signatur gueltig.' : 'Signatur mathematisch ungueltig fuer diese Adresse und Nachricht.' };
  } catch (e) {
    return { ok: false, detail: 'Pruefung nicht moeglich: ' + (e as Error).message };
  }
}
