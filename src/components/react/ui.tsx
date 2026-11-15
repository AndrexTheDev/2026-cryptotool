import { useState, type ReactNode } from 'react';
import { CHAINS } from '../../config/chains';

/** Einheitliches 3-Schritt-Layout-Geruest aller Suite-Module. */

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
    <section className="card p-5 sm:p-6" aria-label={`Schritt ${n}: ${title}`}>
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

export function StatusTile({ level, headline, detail }: { level: StatusLevel; headline: string; detail?: string }) {
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

export function CopyButton({ text, label = 'Kopieren', compact }: { text: string; label?: string; compact?: boolean }) {
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
      {ok ? '✓ Kopiert' : label}
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
          ⬇ Druck / PDF
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
    <div className="flex flex-wrap gap-2" role="group" aria-label="Netzwerk-Auswahl">
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
    <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Netzwerk">
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
      <p className="text-xs text-dim mt-1">Datei hier ablegen oder anklicken — Verarbeitung ausschließlich lokal.</p>
    </label>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="status-tile status-amber" role="alert">
      <span aria-hidden="true">⚠</span>
      <div>
        <h3 className="font-bold text-sm">Hinweis</h3>
        <p className="text-sm mt-1 whitespace-pre-wrap">{message}</p>
      </div>
    </div>
  );
}

export function DemoButton({ onClick, label = 'Demo-Szenario laden' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-outline-amber btn-sm" onClick={onClick}>
      ⚡ {label}
    </button>
  );
}

export function SourceBadge({ source }: { source?: 'user' | 'wallet' | 'public' | 'cache' | 'offline' }) {
  if (!source) return null;
  const map = {
    user: ['badge-green', 'Eigener Endpunkt'],
    wallet: ['badge-green', 'Wallet-Provider'],
    public: ['badge-amber', 'Öffentlicher Endpunkt'],
    cache: ['badge-green', 'Lokaler Cache'],
    offline: ['badge-amber', 'Offline-Modus'],
  } as const;
  const [cls, text] = map[source];
  return <span className={`badge ${cls}`}>{text}</span>;
}
