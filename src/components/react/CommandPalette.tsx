import { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from './useFocusTrap';
import { CATEGORY_LABEL, TOOLS } from '../../config/site';

export const PALETTE_EVENT = 'atd:palette:open';

export function openPalette() {
  window.dispatchEvent(new CustomEvent(PALETTE_EVENT));
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>(open);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.tagline.toLowerCase().includes(q) ||
        CATEGORY_LABEL[t.category].toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => setActive(0), [items.length]);

  if (!open) return null;

  const go = (slug: string) => {
    onClose();
    window.location.href = `/tools/${slug}`;
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && items[active]) {
      go(items[active].slug);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let lastCat = '';
  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Quick tool switcher"
    >
      <div className="card w-full max-w-xl overflow-hidden" onKeyDown={onKey}>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-prime">⌘K</span>
          <input
            ref={inputRef}
            className="w-full bg-transparent outline-none text-ink placeholder:text-dim"
            placeholder="Search tools … (10 modules)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tools"
          />
          <kbd className="text-[10px] text-dim border border-line rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 && <li className="px-3 py-4 text-sm text-dim">No tool found.</li>}
          {items.map((t, i) => {
            const catHeader = CATEGORY_LABEL[t.category] !== lastCat ? CATEGORY_LABEL[t.category] : null;
            lastCat = CATEGORY_LABEL[t.category];
            return (
              <li key={t.slug}>
                {catHeader && (
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-dim font-semibold">
                    {catHeader}
                  </div>
                )}
                <button
                  role="option"
                  aria-selected={i === active}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-baseline gap-3 ${
                    i === active ? 'bg-prime-soft' : 'hover:bg-graphite-2'
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(t.slug)}
                >
                  <span className="mono text-xs text-dim">{String(t.id).padStart(2, '0')}</span>
                  <span className="text-ink font-semibold whitespace-nowrap">{t.name}</span>
                  <span className="text-xs text-body truncate">{t.tagline}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
