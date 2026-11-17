// Local export helpers: one-click download for JSON/CSV/HTML + print view.
// No network, no serialization via servers.

export function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadJSON(data: unknown, filename: string) {
  downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json');
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[";,\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCSV(rows: Record<string, unknown>[], sep = ';'): string {
  if (rows.length === 0) return '';
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const lines = [cols.map(csvEscape).join(sep)];
  for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c])).join(sep));
  return lines.join('\r\n');
}

export function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  // UTF-8-BOM + Semikolon: deutschland-tauglicher CSV-Import in Tabellenprogrammen
  downloadBlob('﻿' + toCSV(rows), filename, 'text/csv;charset=utf-8');
}

export interface PrintableReport {
  title: string;
  subtitle?: string;
  status?: { level: 'green' | 'amber' | 'red' | 'neutral'; headline: string; detail?: string | undefined };
  sections: { heading: string; body: string }[];
  footerNote?: string;
}

/**
 * Erzeugt eine eigenstaendige, offline oeffnbare HTML-Druckansicht
 * (self-contained, no external assets) and opens it in a new tab.
 */
export function openPrintableReport(rep: PrintableReport) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const statusColor = rep.status
    ? { green: '#047857', amber: '#b45309', red: '#b91c1c', neutral: '#334155' }[rep.status.level]
    : '#334155';
  const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>${esc(rep.title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2.2rem auto;max-width:52rem;color:#0f172a;line-height:1.6;padding:0 1rem}
h1{font-size:1.5rem;margin-bottom:0.2rem}
.sub{color:#475569;margin-top:0}
.status{border:1px solid ${statusColor};border-left:6px solid ${statusColor};border-radius:.5rem;padding:.9rem 1.1rem;margin:1.2rem 0}
.status strong{color:${statusColor};display:block;font-size:1.05rem}
h2{font-size:1.05rem;margin:1.6rem 0 .4rem;border-bottom:1px solid #cbd5e1;padding-bottom:.3rem}
pre,code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem}
pre{background:#f1f5f9;border:1px solid #e2e8f0;border-radius:.5rem;padding:.8rem;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.meta{color:#64748b;font-size:.8rem;margin-top:2.4rem;border-top:1px solid #e2e8f0;padding-top:.8rem}
</style></head><body>
<h1>${esc(rep.title)}</h1>
${rep.subtitle ? `<p class="sub">${esc(rep.subtitle)}</p>` : ''}
${rep.status ? `<div class="status"><strong>${esc(rep.status.headline)}</strong>${rep.status.detail ? esc(rep.status.detail) : ''}</div>` : ''}
${rep.sections.map((s) => `<h2>${esc(s.heading)}</h2><div>${s.body}</div>`).join('\n')}
<p class="meta">${esc(rep.footerNote ?? 'Generated locally in the browser by StackAutopsy (Web3 Security & Forensics Suite). No server storage, no transfer of private keys.')}</p>
<script>window.addEventListener('load',()=>{/* Druckdialog optional via Button */});<\/script>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function downloadSelfContainedHtml(html: string, filename: string) {
  downloadBlob(html, filename, 'text/html;charset=utf-8');
}
