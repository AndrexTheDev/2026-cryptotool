// x402-PaywallGuard: local advisory database, lockfile parser, pattern scanner,
// ERC-7715 policy radar and HAR delivery reconciliation. All client-side deterministic.

// ---------------------------------------------------------------------------
// Advisory DB (as of 2026-11, embedded). Thresholds from the specification:
// - unpatched x402 TypeScript packages < 2.23.0
// - @x402/core < 2.28.0
// - legacy packages (x402 legacy line, e.g. x402-express/x402-fetch) < 0.5.2
// - Python package < 2.20.0
// - Go module < v2.23.0
// ---------------------------------------------------------------------------

export interface Advisory {
  id: string;
  ecosystem: 'npm' | 'go' | 'pip';
  match: (name: string) => boolean;
  belowVersion: string;
  severity: 'critical' | 'high' | 'medium';
  summary: string;
}

// Matrix status: October/November 2026. Sources: public advisory reports
// (V12 disclosure with 25 findings dated 22.10.2026, including 3 critical ones without an advisory entry in
// npm audit/PyPI; payment bypass fix in @x402/core 2.27.0 dated 22.09.2026; PT-2026-118463,
// CVSS 6.5 (3.1) / 6.9 (4.0), SIWX server auth bypass). Version thresholds are conservatively
// set to the first fixed line in each case.
export const X402_ADVISORIES: Advisory[] = [
  {
    id: 'V12-2026-CRIT-1',
    ecosystem: 'npm',
    match: (n) => /^@x402\/(core|fetch|axios|extensions)$/.test(n) || n === 'x402',
    belowVersion: '2.23.0',
    severity: 'critical',
    summary:
      'No default spend limit in the standard client: a malicious API can request the entire agent token balance. Fixed in @x402/core, @x402/fetch, @x402/axios 2.23.0 (18.08.2026).',
  },
  {
    id: 'V12-2026-CRIT-2',
    ecosystem: 'npm',
    match: (n) => /^@x402\/svm$/.test(n),
    belowVersion: '2.23.0',
    severity: 'critical',
    summary:
      'Solana facilitator accepted ApproveChecked as payment (complete payment bypass, affected 2.0.0–2.22.0). Fix: @x402/svm 2.23.0.',
  },
  {
    id: 'V12-2026-CRIT-3',
    ecosystem: 'npm',
    match: (n) => /^@x402\/(extensions|core)$/.test(n),
    belowVersion: '2.23.0',
    severity: 'critical',
    summary:
      'SIWx sign-in signed logins for third-party domains (session takeover via relayed login). Fix: createSIWxPayload with mandatory final URL in @x402/extensions/core 2.23.0.',
  },
  {
    id: 'X402-CORE-2026-09',
    ecosystem: 'npm',
    match: (n) => /^@x402\/core$/.test(n),
    belowVersion: '2.27.0',
    severity: 'high',
    summary: 'Separate payment bypass in the @x402/core HTTP resource server (lets callers skip payment checks). Fix: 2.27.0 (22.09.2026).',
  },
  {
    id: 'X402-CORE-2026-10',
    ecosystem: 'npm',
    match: (n) => /^@x402\/(core|fetch|axios|extensions)$/.test(n),
    belowVersion: '2.29.0',
    severity: 'high',
    summary:
      'Transitive dependency zod 3.x with GHSA-mrhx-c7xc-m3w5 (CVE-2023-54404); only 2.29.0 uses zod >= 4.6.6 and caps accepts/discovery/SIWX lists at 1024 entries and facilitator responses at 1 MiB (memory DoS). Fix: 2.29.0 (10/2026).',
  },
  {
    id: 'X402-CORE-2026-11',
    ecosystem: 'npm',
    match: (n) => /^@x402\/core$/.test(n),
    belowVersion: '2.30.0',
    severity: 'high',
    summary:
      'Advisory hook isolation: a throwing afterSettle hook made settle() reject although the onchain settlement had already executed finally (payment completed, server reports error). Fix: 2.30.0 (errors are logged/skipped; gate hooks stay fail-closed).',
  },
  {
    id: 'PT-2026-118463',
    ecosystem: 'npm',
    match: (n) => /^@x402\/extensions$/.test(n),
    belowVersion: '2.28.1',
    severity: 'medium',
    summary:
      'SIWX server auth bypass: paying clients can unlock unpaid routes via PaymentPayload.resource URL. Affected 2.3.1–2.28.0; CVSS 6.5/6.9.',
  },
  {
    id: 'PT-2026-118463-PY',
    ecosystem: 'pip',
    match: (n) => /^x402/.test(n),
    belowVersion: '2.25.1',
    severity: 'medium',
    summary: 'Python x402 SIWX server: same auth bypass (PT-2026-118463), affected 2.11.0–2.25.0.',
  },
  {
    id: 'PT-2026-118463-GO',
    ecosystem: 'go',
    match: (n) => /x402/i.test(n),
    belowVersion: '2.28.1',
    severity: 'medium',
    summary: 'Go module: SIWX server auth bypass (PT-2026-118463), affected 2.16.0–2.28.0.',
  },
  {
    id: 'X402-NPM-LEGACY',
    ecosystem: 'npm',
    match: (n) => /^x402-(express|fetch|axios|legacy)/.test(n),
    belowVersion: '0.5.2',
    severity: 'high',
    summary: 'Legacy packages of the 0.x line: verify flow without retry/nonce protection; migrate to the >= 2.x line.',
  },
  {
    id: 'X402-PY-2026',
    ecosystem: 'pip',
    match: (n) => /^x402/.test(n),
    belowVersion: '2.20.0',
    severity: 'high',
    summary: 'Python x402 < 2.20.0: missing amount validation at the middleware edge (additionally PT-2026-118463 up to 2.25.0).',
  },
  {
    id: 'X402-GO-2026',
    ecosystem: 'go',
    match: (n) => /x402/i.test(n),
    belowVersion: '2.23.0',
    severity: 'high',
    summary: 'Go x402 < v2.23.0: settlement timing race with parallel agent requests (additionally PT-2026-118463 up to 2.28.0).',
  },
];

/** Simple semver comparison a.b.c (tolerates text with v prefix/epoch). */
export function semverBelow(version: string, min: string): boolean {
  const pa = version.replace(/^[v=~^]/, '').split(/[.\-+]/).map((x) => parseInt(x, 10) || 0);
  const pb = min.replace(/^[v=~^]/, '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const a = pa[i] ?? 0;
    const b = pb[i] ?? 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false;
}

export interface DepFinding {
  name: string;
  version: string;
  ecosystem: 'npm' | 'go' | 'pip';
  advisory: Advisory;
}

export interface ScanReport {
  deps: DepFinding[];
  codeFindings: CodeFinding[];
  depsParsed: number;
  ecosystemSeen: string[];
}

export interface CodeFinding {
  rule: string;
  severity: 'critical' | 'high' | 'medium';
  line: number;
  snippet: string;
  explanation: string;
  fix: string;
}

// ---------------------------------------------------------------------------
// Lockfile-/Manifest-Parser
// ---------------------------------------------------------------------------

export function parseDependencies(content: string, filenameHint: string): { name: string; version: string; ecosystem: 'npm' | 'go' | 'pip' }[] {
  const out: { name: string; version: string; ecosystem: 'npm' | 'go' | 'pip' }[] = [];
  const lower = filenameHint.toLowerCase();
  const looksJson = content.trim().startsWith('{');

  if (looksJson || lower.endsWith('lock') || lower.endsWith('json')) {
    try {
      const j = JSON.parse(content) as Record<string, unknown>;
      const packages = j.packages as Record<string, { version?: string }> | undefined;
      if (packages) {
        for (const [path, meta] of Object.entries(packages)) {
          const m = path.match(/node_modules\/(.+)$/);
          if (m && m[1] !== undefined && meta?.version) out.push({ name: m[1], version: meta.version, ecosystem: 'npm' });
        }
      }
      const deps = { ...(j.dependencies as Record<string, string>), ...(j.devDependencies as Record<string, string>) };
      for (const [name, range] of Object.entries(deps ?? {})) {
        const v = String(range).replace(/^[~^]/, '');
        if (!out.some((o) => o.name === name)) out.push({ name, version: v, ecosystem: 'npm' });
      }
      return out;
    } catch {
      /* faellt auf Textparser */
    }
  }
  if (lower.endsWith('.mod') || content.includes('module ') && content.includes('require')) {
    const re = /^\s*(?:require)?\s*([a-zA-Z0-9./_-]+)\s+v?(\d+\.\d+\.\d+(?:[-+][\w.]*)?)/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      const name = m[1];
      const version = m[2];
      if (name && version && (name.includes('/') || name.includes('.')))
        out.push({ name, version, ecosystem: 'go' });
    }
    return out;
  }
  // requirements.txt
  const re = /^\s*([A-Za-z0-9_-]+)\s*==\s*([0-9][\w.]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const name = m[1];
    const version = m[2];
    if (name && version) out.push({ name, version, ecosystem: 'pip' });
  }
  return out;
}

export function scanDependencies(deps: ReturnType<typeof parseDependencies>): DepFinding[] {
  const findings: DepFinding[] = [];
  for (const d of deps) {
    for (const adv of X402_ADVISORIES) {
      if (adv.ecosystem === d.ecosystem && adv.match(d.name) && semverBelow(d.version, adv.belowVersion)) {
        findings.push({ ...d, advisory: adv });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Statischer Pattern-Scanner (SIWX / Solana / EVM-Transfers)
// ---------------------------------------------------------------------------

export function scanCodePatterns(code: string): CodeFinding[] {
  const lines = code.split(/\r?\n/);
  const findings: CodeFinding[] = [];
  const mentionsSiwx = /siwx|sign.?in.?with/i.test(code);

  lines.forEach((line, idx) => {
    const l = line.trim();
    // SIWX two-argument verification (cross-site login phishing despite package update)
    if (mentionsSiwx && /\bverify(Siwx)?(Signature)?\s*\([^,()]*,\s*[^,()]+\)\s*[;)]/.test(l) && !/nonce|domain/i.test(l)) {
      findings.push({
        rule: 'SIWX-2ARG-VERIFY',
        severity: 'critical',
        line: idx + 1,
        snippet: l.slice(0, 200),
        explanation:
          'Two-argument SIWX verification without domain/nonce validation: signatures can be reused across domains (cross-site login phishing) — even with current package versions.',
        fix: 'Verify with explicit domain and nonce comparison against server-side bound expectation values (three-argument or options-object form).',
      });
    }
    if (/\bverify\s*\(\s*[^,]+,\s*[^,]+\)/.test(l) && /x402|payment/i.test(l) && !/requirement|network|amount/i.test(l)) {
      findings.push({
        rule: 'X402-VERIFY-THIN',
        severity: 'high',
        line: idx + 1,
        snippet: l.slice(0, 200),
        explanation: 'x402 verification without payment-requirements binding (amount/network/recipient not reconciled).',
        fix: 'Use verify(payload, paymentRequirements) and build the requirements server-side from your own order configuration.',
      });
    }
    if (/systemProgram|transfer\s*\(/i.test(l) && /solana|@solana\/web3/i.test(code) && !/transferChecked/i.test(code) && /spl|token/i.test(code)) {
      findings.push({
        rule: 'SOL-TRANSFER-UNCHECKED',
        severity: 'high',
        line: idx + 1,
        snippet: l.slice(0, 200),
        explanation: 'SPL token transfer without transferChecked (mint/decimals pinning) — wrong tokens or decimals can be smuggled in.',
        fix: 'Use spl-token transferChecked with explicit mint and decimals checks.',
      });
    }
    if (/\.approve\s*\(/.test(l) && !/allowance|decreaseAllowance/.test(code)) {
      findings.push({
        rule: 'EVM-APPROVE-UNBOUNDED',
        severity: 'medium',
        line: idx + 1,
        snippet: l.slice(0, 200),
        explanation: 'approve() without a cap/allowance evaluation: for agent wallets the approval must be cap- and target-restricted.',
        fix: 'Exact amount approval, recipient pinning and reset to 0 after use (or an ERC-7715 policy).',
      });
    }
  });
  return findings;
}

// ---------------------------------------------------------------------------
// ERC-7715 policy radar (8 safety dimensions)
// ---------------------------------------------------------------------------

export interface PolicyDimension {
  id: string;
  label: string;
  present: boolean;
  evidence?: string | undefined;
}

const DIMS: { id: string; label: string; keys: RegExp[] }[] = [
  { id: 'perTx', label: 'Per-Transaction Cap', keys: [/perTx|maxAmount|allowance|valueLimit|amountCap/i] },
  { id: 'rolling', label: 'Rolling Window Cap', keys: [/rolling|periodLimit|budget.*(window|period)|windowCap/i] },
  { id: 'recipient', label: 'Recipient Allowlist', keys: [/recipient|allowlist|to:|targets/i] },
  { id: 'token', label: 'Token Restriction', keys: [/token|asset|erc20|contractAddress/i] },
  { id: 'time', label: 'Time Window', keys: [/validFrom|validUntil|expiresAt|start.*end|notAfter/i] },
  { id: 'fnlock', label: 'Allowed Functions (Selectors)', keys: [/selector|function.*(allow|deny)|abi|method/i] },
  { id: 'rate', label: 'Rate Limit', keys: [/rateLimit|maxCalls|callsPer|opsPer/i] },
  { id: 'human', label: 'Human Approval Threshold', keys: [/human|escalat|approval.*above|threshold.*confirm/i] },
];

export function analyzePolicy7715(jsonText: string): { dims: PolicyDimension[]; ok: number; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { dims: DIMS.map((d) => ({ id: d.id, label: d.label, present: false })), ok: 0, error: 'JSON not parseable.' };
  }
  const flat = JSON.stringify(parsed);
  const dims: PolicyDimension[] = DIMS.map((d) => {
    const hit = d.keys.find((k) => k.test(flat));
    return { id: d.id, label: d.label, present: !!hit, evidence: hit ? String(flat.match(hit)?.[0]) : undefined };
  });
  return { dims, ok: dims.filter((d) => d.present).length };
}

// ---------------------------------------------------------------------------
// delivery reconciler (HAR / logs, fully local)
// ---------------------------------------------------------------------------

export interface HarLikeEntry {
  url: string;
  status: number;
  hadPaymentHeader: boolean;
  time?: string | undefined;
}

export interface DeliveryFinding {
  url: string;
  status: number;
  time?: string | undefined;
  issue: string;
}

export function reconcileDeliveries(entries: HarLikeEntry[]): DeliveryFinding[] {
  const problems: DeliveryFinding[] = [];
  for (const e of entries) {
    if (e.hadPaymentHeader && (e.status >= 500 || e.status === 402 || e.status === 403)) {
      problems.push({
        url: e.url,
        status: e.status,
        time: e.time,
        issue: `Payment proof sent, but response ${e.status} — possibly a paid but undelivered response.`,
      });
    }
  }
  return problems;
}

export function parseHar(content: string): HarLikeEntry[] {
  try {
    const har = JSON.parse(content) as { log?: { entries?: unknown[] } };
    const entries = har.log?.entries ?? [];
    return entries.map((raw) => {
      const e = raw as {
        request?: { url?: string; headers?: { name: string; value: string }[] };
        response?: { status?: number; headers?: { name: string; value: string }[] };
        startedDateTime?: string;
      };
      const reqHeaders = e.request?.headers ?? [];
      const paid = reqHeaders.some((h) => /^(payment-signature|payment|x-payment)$/i.test(h.name));
      return { url: e.request?.url ?? '?', status: e.response?.status ?? 0, hadPaymentHeader: paid, time: e.startedDateTime };
    });
  } catch {
    return [];
  }
}
