import { useMemo } from 'react';
import { encode } from 'uqr';

/** Zero-dependency SVG QR (uqr), rendered entirely in the browser. */
export default function QrCode({ value, size = 168 }: { value: string; size?: number }) {
  const { d, n } = useMemo(() => {
    try {
      const q = encode(value, { ecc: 'M' });
      let dd = '';
      for (let y = 0; y < q.size; y++) {
        for (let x = 0; x < q.size; x++) {
          if (q.data[y]?.[x]) dd += `M${x},${y}h1v1h-1z `;
        }
      }
      return { d: dd, n: q.size };
    } catch {
      return { d: '', n: 0 };
    }
  }, [value]);

  if (!d) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-line bg-graphite-2 text-xs text-dim"
        style={{ width: size, height: size }}
      >
        QR cannot be generated
      </div>
    );
  }
  return (
    <svg
      role="img"
      aria-label="QR-Code"
      width={size}
      height={size}
      viewBox={`-2 -2 ${n + 4} ${n + 4}`}
      className="rounded-lg bg-white p-1"
    >
      <path d={d} fill="#0b0f14" />
    </svg>
  );
}
