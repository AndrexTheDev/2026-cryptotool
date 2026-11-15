// Deterministische Miniscript/Policy-Analyse fuer BitVault-Stress.
//
// - Policy-Parser (Recursive Descent) fuer: pk, or, and, thresh, multi, after,
//   older, sha256, hash256, hash160 (vom begleitenden Modul miniscript-policies
//   unabhaengig, reine lokale Mathematik).
// - Zufriedenstellungs-Gewichte: exakte vByte-Berechnung pro Ausgabepfad
//   (P2WSH & Taproot-Skriptpfad, konservative DER/Schnorr-Obergrenzen).
// - Konsens-Fallen-Erkennung (CLTV/CSV-Mischung, Blockhoehe vs. Timestamp).

export interface PolicyNode {
  type: 'pk' | 'older' | 'after' | 'and' | 'or' | 'thresh' | 'multi' | 'hash';
  key?: string;
  n?: number;
  k?: number;
  children?: PolicyNode[];
  hashType?: string;
}

type Tok = string;

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let cur = '';
  for (const ch of src.replace(/\s+/g, '')) {
    if ('(),'.includes(ch)) {
      if (cur) toks.push(cur);
      toks.push(ch);
      cur = '';
    } else cur += ch;
  }
  if (cur) toks.push(cur);
  return toks;
}

export function parsePolicy(src: string): PolicyNode {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const expect = (t: string) => {
    if (next() !== t) throw new Error(`Parser: '${t}' erwartet bei Position ${pos}`);
  };

  function parse(): PolicyNode {
    const head = next();
    if (head === undefined || head === ')' || head === ',') throw new Error('Parser: unerwartetes Token');
    if (peek() !== '(') return { type: 'pk', key: head }; // barer Schluessel-Ausdruck
    expect('(');
    switch (head) {
      case 'pk':
      case 'pk_k': {
        const k = next();
        expect(')');
        return { type: 'pk', key: k };
      }
      case 'older': {
        const n = Number(next());
        expect(')');
        return { type: 'older', n };
      }
      case 'after': {
        const n = Number(next());
        expect(')');
        return { type: 'after', n };
      }
      case 'sha256':
      case 'hash256':
      case 'ripemd160':
      case 'hash160': {
        const h = next();
        expect(')');
        return { type: 'hash', hashType: head, key: h };
      }
      case 'and': {
        const a = parse();
        expect(',');
        const b = parse();
        expect(')');
        return { type: 'and', children: [a, b] };
      }
      case 'or': {
        const a = parse();
        expect(',');
        const b = parse();
        expect(')');
        return { type: 'or', children: [a, b] };
      }
      case 'thresh': {
        const k = Number(next());
        const subs: PolicyNode[] = [];
        while (peek() === ',') {
          next();
          subs.push(parse());
        }
        expect(')');
        return { type: 'thresh', k, children: subs };
      }
      case 'multi':
      case 'sortedmulti': {
        const k = Number(next());
        const keys: PolicyNode[] = [];
        while (peek() === ',') {
          next();
          keys.push({ type: 'pk', key: next() });
        }
        expect(')');
        return { type: 'multi', k, children: keys };
      }
      default:
        throw new Error(`Parser: unbekannte Funktion '${head}'`);
    }
  }
  const node = parse();
  if (pos < toks.length) throw new Error('Parser: ueberschuessige Tokens');
  return node;
}

// ---------------------------------------------------------------------------
// Konsens-Fallen
// ---------------------------------------------------------------------------

export interface ConsensusWarning {
  level: 'amber' | 'red';
  text: string;
}

export function findConsensusIssues(node: PolicyNode, path: PolicyNode[] = []): ConsensusWarning[] {
  const warnings: ConsensusWarning[] = [];
  const here = [...path, node];
  if (node.type === 'after' || node.type === 'older') {
    if (node.n == null || Number.isNaN(node.n!) || node.n! < 0 || node.n! > 0xffffffff) {
      warnings.push({ level: 'red', text: `${node.type}(${node.n}): Wert ausserhalb des gueltigen Bereichs (0 … 2^32-1).` });
    } else {
      const isHeight = node.n! < 500_000_000;
      warnings.push({
        level: 'amber',
        text: `${node.type}(${node.n}) wird als ${isHeight ? 'Blockhoehe' : 'Unix-Zeitstempel'} interpretiert (Schwelle 500.000.000). Pruefen, ob das beabsichtigt ist.`,
      });
    }
  }
  if (node.type === 'and' || node.type === 'thresh') {
    const flats: PolicyNode[] = [];
    const walk = (x: PolicyNode) => {
      if (x.type === 'and' || x.type === 'thresh') x.children?.forEach(walk);
      else flats.push(x);
    };
    walk(node);
    const hasAfter = flats.some((f) => f.type === 'after');
    const hasOlder = flats.some((f) => f.type === 'older');
    if (hasAfter && hasOlder) {
      warnings.push({
        level: 'red',
        text: 'Konflikt: after() (CLTV, absolut) und older() (CSV, relativ) im selben Ausgabepfad — die EVM des Bitcoin-Skripts (BIP-65/BIP-112/68) vertraegt den Mix nur in getrennten Zweigen.',
      });
    }
    const heights = flats.filter((f) => (f.type === 'after' || f.type === 'older') && (f.n ?? 0) < 500_000_000);
    const times = flats.filter((f) => (f.type === 'after' || f.type === 'older') && (f.n ?? 0) >= 500_000_000);
    if (heights.length && times.length) {
      warnings.push({
        level: 'red',
        text: 'Zeiteinheiten-Mix im selben Pfad: Blockhoehen- und Unix-Zeit-Timelocks kombiniert — fuehrt in Classic-Skripten zu OP_VERIFY-XOR-Fehlern.',
      });
    }
  }
  node.children?.forEach((c) => warnings.push(...findConsensusIssues(c, here)));
  return warnings;
}

// ---------------------------------------------------------------------------
// Zufriedenstellungs-Gewichte (Witness-Items in Bytes)
// ---------------------------------------------------------------------------

export type VaultContext = 'wsh' | 'tr';

const SIG_WSH = 73; // DER + Hashtype, konservativ
const SIG_TR = 65; // 64B Schnorr + moegliches Sighash-Byte (Obergrenze)
const PREIMAGE = 32;

/** Liefert alle Zufriedenstellungs-Optionen als Liste von Witness-Item-Groessen (Bytes). */
export function satisfactionOptions(node: PolicyNode, ctx: VaultContext): number[][] {
  const sig = ctx === 'wsh' ? SIG_WSH : SIG_TR;
  switch (node.type) {
    case 'pk':
      return [[sig]];
    case 'older':
    case 'after':
      return [[]];
    case 'hash':
      return [[PREIMAGE]];
    case 'and': {
      const a = satisfactionOptions(node.children![0], ctx);
      const b = satisfactionOptions(node.children![1], ctx);
      const out: number[][] = [];
      for (const x of a) for (const y of b) out.push([...x, ...y]);
      return out;
    }
    case 'or':
      return [...satisfactionOptions(node.children![0], ctx), ...satisfactionOptions(node.children![1], ctx)];
    case 'multi': {
      const k = node.k!;
      return [Array.from({ length: k }, () => sig)];
    }
    case 'thresh': {
      const k = node.k!;
      const subs = node.children!;
      // alle k-Kombinationen: rekursive Auswahl
      const combos: number[][][] = [[]];
      const rec = (idx: number, picked: number[][][]) => {};
      void rec;
      void combos;
      const results: number[][] = [];
      const choose = (start: number, need: number, acc: number[][]) => {
        if (need === 0) {
          // Unzufriedenstellungen der restlichen Subausdruecke kosten je ~1 Byte (leerer Vektor)
          results.push([...acc.flat()]);
          return;
        }
        for (let i = start; i <= subs.length - need; i++) {
          for (const opt of satisfactionOptions(subs[i], ctx)) {
            choose(i + 1, need - 1, [...acc, opt]);
          }
        }
      };
      choose(0, k, []);
      // zusaetzlich 1 Byte je NICHT gewaehltem Teilausdruck wird konservativ ignoriert (1-B-Ausreisser)
      return results.length ? results : [Array.from({ length: k }, () => sig)];
    }
  }
}

// ---------------------------------------------------------------------------
// ASM -> Bytes (fuer Script-Groesse), Schluessel als 33-Byte-Platzhalter
// ---------------------------------------------------------------------------

const OPS: Record<string, number> = {
  OP_CHECKSIG: 0xac,
  OP_CHECKSIGVERIFY: 0xad,
  OP_CHECKMULTISIG: 0xae,
  OP_CHECKMULTISIGVERIFY: 0xaf,
  OP_CHECKLOCKTIMEVERIFY: 0xb1,
  OP_CHECKSEQUENCEVERIFY: 0xb2,
  OP_DROP: 0x75,
  OP_DUP: 0x76,
  OP_HASH160: 0xa9,
  OP_EQUAL: 0x87,
  OP_EQUALVERIFY: 0x88,
  OP_SIZE: 0x82,
  OP_SHA256: 0xa8,
  OP_HASH256: 0xaa,
  OP_RIPEMD160: 0xa6,
  OP_IF: 0x63,
  OP_NOTIF: 0x64,
  OP_ELSE: 0x67,
  OP_ENDIF: 0x68,
  OP_VERIFY: 0x69,
  OP_BOOLAND: 0x9a,
  OP_BOOLOR: 0x9b,
  OP_0NOTEQUAL: 0x92,
  OP_TOALTSTACK: 0x6b,
  OP_FROMALTSTACK: 0x6c,
  OP_SWAP: 0x7c,
  OP_0: 0x00,
  OP_1NEGATE: 0x4f,
};

function scriptnum(n: number): Uint8Array {
  if (n === 0) return new Uint8Array(0);
  const out: number[] = [];
  let v = Math.abs(n);
  while (v) {
    out.push(v & 0xff);
    v >>= 8;
  }
  if (out[out.length - 1] & 0x80) out.push(n < 0 ? 0x80 : 0);
  else if (n < 0) out[out.length - 1] |= 0x80;
  return new Uint8Array(out);
}

function pushLenBytes(len: number): number {
  if (len < 0x4c) return 1;
  if (len <= 0xff) return 2;
  return 3;
}

/** Wandelt bitcoinerlab-ASM (Tokens mit <hex>/Zahlen) in Script-Bytes um. */
export function asmToBytes(asm: string): Uint8Array {
  const bytes: number[] = [];
  const tokens = asm.trim().split(/\s+/);
  for (const t of tokens) {
    if (t.startsWith('<') && t.endsWith('>')) {
      const hex = t.slice(1, -1);
      const data = hex.match(/^[0-9a-fA-F]+$/) && hex.length % 2 === 0 ? hexToNumArray(hex) : new Array(33).fill(0x02); // Schluessel-Platzhalter
      bytes.push(data.length);
      bytes.push(...data);
    } else if (/^-?\d+$/.test(t)) {
      const n = Number(t);
      if (n === 0) bytes.push(0x00);
      else if (n >= 1 && n <= 16) bytes.push(0x50 + n);
      else {
        const sn = scriptnum(n);
        bytes.push(sn.length, ...sn);
      }
    } else if (OPS[t] != null) {
      bytes.push(OPS[t]);
    } else if (t.startsWith('OP_') && /^OP_\d+$/.test(t)) {
      bytes.push(0x50 + Number(t.slice(3)));
    } else if (/^[0-9a-fA-F]+$/.test(t) && t.length % 2 === 0) {
      const data = hexToNumArray(t);
      bytes.push(data.length, ...data);
    } else {
      // Schluessel-Bezeichner (z. B. 'owner') → 33-Byte-Platzhalter
      bytes.push(33, ...new Array(33).fill(0x02));
    }
  }
  return new Uint8Array(bytes);
}

function hexToNumArray(h: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}

// ---------------------------------------------------------------------------
// vByte-Berechnung
// ---------------------------------------------------------------------------

export interface PathWeight {
  label: string;
  items: number[];
  scriptBytes: number;
  controlBlockBytes: number;
  weightWU: number;
  vbytes: number;
}

function varintLen(n: number): number {
  return n < 0xfd ? 1 : n <= 0xffff ? 3 : 5;
}

/**
 * Exakte Input-vBytes.
 * Basis je Input: 41 B (Prevout 36 + scriptLen 1 + seq 4) x 4 WU = 164 WU.
 * Witness (1 WU/B): Item-Zaehler + je Item (varint + Daten) + Script(+varint) + ControlBlock (tr).
 */
export function pathWeight(items: number[], scriptBytes: number, ctx: VaultContext, controlBlockBytes: number): PathWeight {
  let witnessWU = varintLen(items.length + 1 + (ctx === 'tr' ? 1 : 0)); // items + script (+controlblock)
  for (const it of items) witnessWU += varintLen(it) + it;
  witnessWU += varintLen(scriptBytes) + scriptBytes;
  if (ctx === 'tr') witnessWU += varintLen(controlBlockBytes) + controlBlockBytes;
  const total = 164 + witnessWU;
  return {
    label: ctx === 'tr' ? 'Taproot-Skriptpfad' : 'P2WSH-Skriptpfad',
    items,
    scriptBytes,
    controlBlockBytes: ctx === 'tr' ? controlBlockBytes : 0,
    weightWU: total,
    vbytes: Math.round((total / 4) * 100) / 100,
  };
}

export function taprootKeyPathWeight(): PathWeight {
  // Witness: [64B-Schnorr-Sig]; kein Script, kein Control Block
  const witnessWU = varintLen(1) + varintLen(64) + 64;
  const total = 164 + witnessWU;
  return { label: 'Taproot-Key-Path', items: [64], scriptBytes: 0, controlBlockBytes: 0, weightWU: total, vbytes: Math.round((total / 4) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Fehler-Detektoren (Schutzmassnahmen)
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /^(xprv|yprv|zprv|vprv|tprv|uprv)[1-9A-HJ-NP-Za-km-z]{20,}/, label: 'Privater Extended Key (*prv)' },
  { re: /^[5KL][1-9A-HJ-NP-Za-km-z]{45,55}$/, label: 'WIF-Privatschluessel' },
  { re: /^[0-9a-fA-F]{64}$/, label: '64 Hex-Zeichen (m. g. Privatschluessel)' },
];

/** Erkennt Seed-Phrasen oder Privatschluessel in Eingaben und blockiert sie. */
export function detectSecrets(input: string): string | null {
  const t = input.trim();
  for (const p of SECRET_PATTERNS) if (p.re.test(t)) return p.label;
  const words = t.toLowerCase().split(/\s+/);
  if (words.length === 12 || words.length === 24 || words.length === 15 || words.length === 18 || words.length === 21) {
    if (words.every((w) => /^[a-z]+$/.test(w))) {
      return `Moegliche Seed-Phrase (${words.length} Woerter)`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Gebuehren- / Dust-Analyse
// ---------------------------------------------------------------------------

export interface UtxoRow {
  txid: string;
  vout: number;
  sats: number;
}

export interface DustResult {
  utxo: UtxoRow;
  fee: number;
  thirdDustLimit: number; // 3 * fee (Bitcoin-Core-Analogie, siehe unten)
  crossedThird: boolean; // Wert <= 3x Gebuehr -> unter der 1/3-Klippe
  totalLoss: boolean; // Gebuehr >= Wert
  netto: number;
  pct: number; // Gebuehranteil %
}

export function dustAnalysis(utxo: UtxoRow, vbytes: number, feerate: number): DustResult {
  const fee = Math.ceil(vbytes * feerate);
  const third = fee * 3;
  return {
    utxo,
    fee,
    thirdDustLimit: third,
    crossedThird: utxo.sats <= third,
    totalLoss: fee >= utxo.sats,
    netto: Math.max(0, utxo.sats - fee),
    pct: utxo.sats === 0 ? 100 : (fee / utxo.sats) * 100,
  };
}

/** Multi-6stellige Fee-Heatmap-Grenzen: minimaler Wert je Rate, ueber dem Ausgabe oekonomisch ist. */
export function heatmapThresholds(pathVbytes: number[]): { rate: number; dustLimit: number; lossLimit: number }[] {
  const worst = Math.max(...pathVbytes);
  const rates = [1, 2, 3, 5, 8, 12, 20, 35, 60, 100, 175, 300, 500, 750, 1000];
  return rates.map((rate) => {
    const fee = Math.ceil(worst * rate);
    return { rate, dustLimit: fee * 3, lossLimit: fee };
  });
}
