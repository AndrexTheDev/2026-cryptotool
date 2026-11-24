import { useState, type ReactNode } from 'react';
import { CHAINS } from '../../config/chains';

/** Uniform 3-step layout scaffold of all suite modules. */

export function StepSection({
  n,
  title,
  hint,
  children,
}: {
  n: 1 | 2 | 3;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6" aria-label={`Step ${n}: ${title}`}>
      <div className="flex items-center gap-3 mb-4">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-prime-soft text-prime-hi font-bold text-sm border border-prime/40"
        >
          {n}
        </span>
        <h2 className="text-base sm:text-lg">{title}</h2>
      </div>
      {hint && <p className="text-sm -mt-2 mb-4 text-dim">{hint}</p>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export type StatusLevel = 'green' | 'amber' | 'red' | 'neutral';

export function StatusTile({ level, headline, detail }: { level: StatusLevel; headline: string; detail?: string | undefined }) {
  const icon = { green: '✓', amber: '⚠', red: '✕', neutral: 'ℹ' }[level];
  return (
    <div className={`status-tile status-${level}`} role="status" aria-live="polite">
      <span aria-hidden="true" className="text-xl leading-none mt-0.5">
        {icon}
      </span>
      <div>
        <h3 className="text-base font-bold">{headline}</h3>
        {detail && <p className="text-sm mt-1 leading-relaxed">{detail}</p>}
      </div>
    </div>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: 'default' | 'amber' | 'red' | 'green' }) {
  const cls = tone === 'red' ? 'text-danger' : tone === 'amber' ? 'text-gold-hi' : tone === 'green' ? 'text-prime-hi' : '';
  return (
    <div className="kpi">
      <div className={`kpi-v ${cls}`}>{value}</div>
      <div className="kpi-l">{label}</div>
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>;
}

export function CopyButton({ text, label = 'Copy', compact }: { text: string; label?: string; compact?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className={`btn btn-ghost ${compact ? 'btn-sm' : ''}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1600);
        } catch {
          /* ignore */
        }
      }}
    >
      {ok ? '✓ Copied' : label}
    </button>
  );
}

export function ExportBar({
  onJson,
  onCsv,
  onPrint,
  onHtml,
  extra,
}: {
  onJson?: () => void;
  onCsv?: () => void;
  onPrint?: () => void;
  onHtml?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {onJson && (
        <button className="btn btn-ghost btn-sm" onClick={onJson}>
          ⬇ JSON
        </button>
      )}
      {onCsv && (
        <button className="btn btn-ghost btn-sm" onClick={onCsv}>
          ⬇ CSV
        </button>
      )}
      {onPrint && (
        <button className="btn btn-ghost btn-sm" onClick={onPrint}>
          ⬇ Print / PDF (HTML)
        </button>
      )}
      {onHtml && (
        <button className="btn btn-ghost btn-sm" onClick={onHtml}>
          ⬇ Offline-HTML
        </button>
      )}
      {extra}
    </div>
  );
}

export function ChainMultiSelect({ selected, onChange }: { selected: number[]; onChange: (ids: number[]) => void }) {
  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Network selection">
      {CHAINS.map((c) => {
        const on = selected.includes(c.chainId);
        return (
          <button
            key={c.chainId}
            type="button"
            aria-pressed={on}
            className={`btn btn-sm ${on ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => toggle(c.chainId)}
          >
            {c.short}
          </button>
        );
      })}
    </div>
  );
}

export function ChainSingleSelect({ value, onChange }: { value: number; onChange: (id: number) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Network">
      {CHAINS.map((c) => (
        <option key={c.chainId} value={c.chainId}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function FileDrop({
  label,
  accept,
  onFile,
}: {
  label: string;
  accept?: string;
  onFile: (content: string, name: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [name, setName] = useState('');
  const read = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      onFile(String(reader.result ?? ''), f.name);
      setName(f.name);
    };
    reader.readAsText(f);
  };
  return (
    <label
      className={`block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
        over ? 'border-prime bg-prime-soft' : 'border-line hover:border-line-2'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) read(f);
      }}
    >
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) read(f);
        }}
      />
      <span className="text-2xl" aria-hidden="true">
        ⇪
      </span>
      <p className="text-sm mt-1 text-ink font-semibold">{name || label}</p>
      <p className="text-xs text-dim mt-1">Drop a file here or click — processing is exclusively local.</p>
    </label>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="status-tile status-amber" role="alert">
      <span aria-hidden="true">⚠</span>
      <div>
        <h3 className="font-bold text-sm">Notice</h3>
        <p className="text-sm mt-1 whitespace-pre-wrap">{message}</p>
      </div>
    </div>
  );
}

export function DemoButton({ onClick, label = 'Load demo scenario' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-outline-amber btn-sm" onClick={onClick}>
      ⚡ {label}
    </button>
  );
}

export function CrossBadge({ verdict }: { verdict?: 'match' | 'mismatch' | 'unavailable' | 'pending' | undefined }) {
  if (!verdict) return null;
  const map = {
    match: ['badge-green', 'matches chain ✓'],
    mismatch: ['badge-red', 'MISMATCH vs chain'],
    unavailable: ['', 'cross-check unavailable'],
    pending: ['', 'cross-checking…'],
  } as const;
  const [cls, text] = map[verdict];
  return (
    <span
      className={`badge ${cls}`.trim()}
      title="Pasted input automatically cross-checked against live chain data (same address/tx, same network)."
    >
      {text}
    </span>
  );
}

export function SourceBadge({
  source,
  at,
}: {
  source?: 'user' | 'wallet' | 'public' | 'cache' | 'offline' | 'registry' | 'gateway' | undefined;
  /** epoch ms of the answer (RpcResult.at) — rendered as HH:MM:SS suffix. */
  at?: number | undefined;
}) {
  if (!source) return null;
  const map = {
    user: ['badge-green', 'Custom endpoint'],
    wallet: ['badge-green', 'Wallet provider'],
    public: ['badge-amber', 'Public endpoint'],
    cache: ['badge-green', 'Local cache'],
    offline: ['badge-amber', 'Offline mode'],
    registry: ['badge-green', 'npm registry (live)'],
    gateway: ['badge-amber', 'Public gateway'],
  } as const;
  const [cls, text] = map[source];
  const t = at
    ? ` · ${new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
    : '';
  return (
    <span className={`badge ${cls}`} title={at ? `Answered at ${new Date(at).toISOString()}` : undefined}>
      {text}
      {t}
    </span>
  );
}
