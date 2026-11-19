import type { APIRoute } from 'astro';
import { BRAND, CATEGORY_LABEL, CONTACT_EMAIL, SITE_URL, SUITE_NAME, TOOLS } from '../config/site';

// llms.txt (AI visibility 2026) — deliberately contains no infrastructure
// or pricing statements (specification 2.2), only function and value texts.

export const GET: APIRoute = () => {
  const lines: string[] = [];
  lines.push(`# ${BRAND} — ${SUITE_NAME}`);
  lines.push('');
  lines.push(
    '> Ten specialized Web3, Bitcoin and compliance tools for forensic security diagnostics, computed locally in the browser and verified live against the public networks: no accounts, no central data storage, no entry of private keys. All modules follow an identical 3-step principle (input, check, traffic-light report) with demo datasets, offline modes, live cross-checks of pasted claims and portable exports (JSON, CSV, print/PDF, offline HTML).',
  );
  lines.push('');
  lines.push(`Operator: ${BRAND} · Contact: ${CONTACT_EMAIL}`);
  lines.push('');
  lines.push('## Tools');
  lines.push('');
  for (const t of TOOLS) {
    lines.push(`- [${t.name}](${SITE_URL}/tools/${t.slug}) (${CATEGORY_LABEL[t.category]}): ${t.tagline} — ${t.solution}`);
  }
  lines.push('');
  lines.push('## Legal & transparency');
  lines.push('');
  lines.push(`- [Terms of use (AGB)](${SITE_URL}/agb)`);
  lines.push(`- [Disclaimer / liability](${SITE_URL}/disclaimer)`);
  lines.push(`- [Privacy transparency](${SITE_URL}/datenschutz)`);
  lines.push('');
  lines.push('## Technical framework');
  lines.push('');
  lines.push('- Client-side processing without central data storage; local execution directly in the browser.');
  lines.push('- Live verification: read calls go directly from the browser to public blockchain endpoints by default (user-configurable); pasted claims are cross-checked against the chain and flagged on mismatch; every module keeps an offline mode with manual or file-based input.');
  lines.push('- Voluntary on-chain support possible; no functional difference without support.');
  lines.push('- No investment, financial, legal or tax advice — all results are diagnostic indicators.');
  lines.push('');
  lines.push('## Embedded updates (status of this suite)');
  lines.push('');
  lines.push(
    '- x402-PaywallGuard carries an embedded advisory matrix (12 npm/pip/go entries, as of November 2026, current npm line 2.31.0): V12 disclosure 10/2026 (25 findings, 3 critical — spend-limit fix, Solana ApproveChecked bypass, SIWx login replay from 2.23.0), payment bypass fix 2.27.0, PT-2026-118463 SIWX auth bypass (up to 2.28.1/2.25.1), zod CVE/DoS caps from 2.29.0 and afterSettle hook isolation from 2.30.0. Because these findings do not appear in npm audit/PyPI warnings, the module checks explicitly against this matrix.',
  );
  lines.push(
    '- UserOp-Autopsy recognizes all four canonical EntryPoint singletons v0.6/v0.7/v0.8/v0.9 (incl. the v0.9 address 0x433709009B8330FDa32311DF1C2AFA402eD8D009) and flags v0.9 IgnoredInitCode events on the finding.',
  );
  lines.push(
    '- STVA-UpgradeDiff reconciles upgrade targets against the canonical Safe singleton registry (safe-global/safe-deployments, v1.3.0 eip155/canonical, v1.4.1, v1.5.0 incl. SafeL2/SafeMigration); hits below 1.5.0 receive the note on the official v1.5.0 upgrade recommendation (09/2026).',
  );
  lines.push(
    '- DAC8-SelfProof understands BIP-322 in its final form (Complete since 04/2026): smp/ful/pof prefixes, legacy without prefix, and proof-of-funds PSBTs with an embedded challenge (verify the UTXO state onchain).',
  );
  lines.push(
    '- PasskeyContinuity asks about passkey portability: FIDO CXF 1.0 has been a Proposed Standard since 08/2025 (errata 03/2026); the transport protocol CXP remains a Working Draft.',
  );
  lines.push(
    '- Clear signing: descriptors (ERC-7730) have come from the EF-hosted registry (clearsigning.org) with ERC-8176 attestations since 05/2026; STVA computes the ERC-8213-like calldata-digest fallback.',
  );
  lines.push(
    '- StealthAudit-5564 scans the canonical ERC-5564 announcer 0x55649E01B5Df198D18D95b5cc5051630cfD45564 and knows the ERC-6538 registry 0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538.',
  );
  lines.push('- DAC8-SelfProof references the reporting period 2026 with the filing window 01.01.–30.09.2027.');
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
