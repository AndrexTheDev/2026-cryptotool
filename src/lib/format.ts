// Formatierungs- und Hex-Helfer.

export function shortHex(v: string, head = 8, tail = 6): string {
  if (!v) return '';
  const s = v.startsWith('0x') ? v : '0x' + v;
  if (s.length <= head + tail + 3) return s;
  return s.slice(0, head) + '…' + s.slice(-tail);
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error('Hex hat ungerade Laenge');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array, prefix = true): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return prefix ? '0x' + s : s;
}

export function utf8ToHex(text: string): string {
  return bytesToHex(new TextEncoder().encode(text));
}

export function hexToUtf8(hex: string): string {
  try {
    return new TextDecoder().decode(hexToBytes(hex));
  } catch {
    return '';
  }
}

export function weiToEth(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 6);
  return `${whole}.${frac.replace(/0+$/, '') || '0'}`;
}

export function formatGwei(wei: bigint): string {
  const g = Number(wei) / 1e9;
  return g >= 100 ? g.toFixed(0) : g >= 1 ? g.toFixed(2) : g.toFixed(4);
}

export function pct(value: number, digits = 2): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' %';
}

export function num(n: number | bigint, digits = 0): string {
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits: digits });
}

export function satsFmt(sats: number): string {
  return sats.toLocaleString('de-DE') + ' sats';
}

export function isHexAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

export function isHexBytes(v: string): boolean {
  const c = v.trim();
  return /^0x([0-9a-fA-F]{2})+$/.test(c);
}

export function isTxHash(v: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(v.trim());
}

export function isBitcoinTxid(v: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(v.trim());
}

export function timeAgo(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}
