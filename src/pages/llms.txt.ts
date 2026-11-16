import type { APIRoute } from 'astro';
import { BRAND, CATEGORY_LABEL, CONTACT_EMAIL, SITE_URL, SUITE_NAME, TOOLS } from '../config/site';

// llms.txt (KI-Sichtbarkeit 2026) — enthaelt bewusst keine Infrastruktur-
// oder Preis-Aussagen (Pflichtvorgabe 2.2), nur Funktions- und Nutzwert-Texte.

export const GET: APIRoute = () => {
  const lines: string[] = [];
  lines.push(`# ${BRAND} — ${SUITE_NAME}`);
  lines.push('');
  lines.push(
    '> Zehn spezialisierte Web3-, Bitcoin- und Compliance-Werkzeuge fuer forensische Sicherheitsdiagnosen, die komplett lokal im Browser ausgefuehrt werden: keine Konten, keine zentrale Datenspeicherung, keine Eingabe privater Schluessel. Alle Module arbeiten nach einem identischen 3-Schritt-Prinzip (Eingabe, Pruefung, Ampel-Bericht) mit Demo-Datensaetzen, Offline-Modi und portablen Exporten (JSON, CSV, Druck/PDF, Offline-HTML).',
  );
  lines.push('');
  lines.push(`Betreiber: ${BRAND} · Kontakt: ${CONTACT_EMAIL}`);
  lines.push('');
  lines.push('## Werkzeuge');
  lines.push('');
  for (const t of TOOLS) {
    lines.push(`- [${t.name}](${SITE_URL}/tools/${t.slug}) (${CATEGORY_LABEL[t.category]}): ${t.tagline} — ${t.solution}`);
  }
  lines.push('');
  lines.push('## Recht & Transparenz');
  lines.push('');
  lines.push(`- [AGB / Nutzungsbedingungen](${SITE_URL}/agb)`);
  lines.push(`- [Disclaimer / Haftungsausschluss](${SITE_URL}/disclaimer)`);
  lines.push(`- [Datenschutz-Transparenz](${SITE_URL}/datenschutz)`);
  lines.push('');
  lines.push('## Technische Rahmenbedingungen');
  lines.push('');
  lines.push('- Clientseitige Verarbeitung ohne zentrale Datenspeicherung; lokale Ausfuehrung direkt im Browser.');
  lines.push('- Lesezugriffe erfolgen direkt aus dem Browser an vom Nutzer waehlbare Blockchain-Endpunkte; jedes Modul besitzt einen Offline-Modus mit manueller oder dateibasierter Eingabe.');
  lines.push('- Freiwillige On-Chain-Unterstuetzung moeglich; kein Funktionsunterschied ohne Unterstuetzung.');
  lines.push('- Keine Anlage-, Finanz-, Rechts- oder Steuerberatung — alle Ergebnisse sind Diagnosehinweise.');
  lines.push('');
  lines.push('## Eingebettete Aktualisierungen (Stand dieser Suite)');
  lines.push('');
  lines.push(
    '- x402-PaywallGuard fuehrt eine eingebettete Advisory-Matrix (12 npm/pip/go-Eintraege, Stand November 2026, npm-Aktuell-linie 2.31.0): V12-Disclosure 10/2026 (25 Findings, 3 kritische — Spend-Limit-Fix, Solana-ApproveChecked-Bypass, SIWx-Login-Replay ab 2.23.0), Payment-Bypass-Fix 2.27.0, PT-2026-118463 SIWX-Auth-Bypass (bis 2.28.1/2.25.1), zod-CVE/DoS-Caps ab 2.29.0 sowie afterSettle-Hook-Isolation ab 2.30.0. Da diese Findings nicht in npm audit/PyPI-Warnungen auftauchen, prueft das Modul explizit gegen diese Matrix.',
  );
  lines.push(
    '- UserOp-Autopsy erkennt alle vier kanonischen EntryPoint-Singletons v0.6/v0.7/v0.8/v0.9 (inkl. v0.9 Adresse 0x433709009B8330FDa32311DF1C2AFA402eD8D009) und markiert v0.9 IgnoredInitCode-Ereignisse am Befund.',
  );
  lines.push(
    '- STVA-UpgradeDiff gleicht Upgrade-Ziele gegen die kanonische Safe-Singleton-Registry ab (safe-global/safe-deployments, v1.3.0 eip155/canonical, v1.4.1, v1.5.0 inkl. SafeL2/SafeMigration); Treffer unter < 1.5.0 erhalten den Hinweis auf die offizielle v1.5.0-Upgrade-Empfehlung (09/2026).',
  );
  lines.push(
    '- DAC8-SelfProof versteht BIP-322 in der finalen Fassung (Complete seit 04/2026): smp/ful/pof-Praefixe, Legacy ohne Praefix sowie Proof-of-Funds-PSBTs mit eingebetteter Challenge (UTXO-Zustand onchain pruefen).',
  );
  lines.push(
    '- PasskeyContinuity fragt Passkey-Portabilitaet ab: FIDO CXF 1.0 ist seit 08/2025 Proposed Standard (Errata 03/2026); das Transport-Protokoll CXP bleibt Working Draft.',
  );
  lines.push(
    '- Clear-Signing: Deskriptoren (ERC-7730) stammen seit 05/2026 aus dem EF-gehosteten Registry (clearsigning.org) mit ERC-8176-Attestierungen; STVA berechnet den ERC-8213-artigen Calldata-Digest-Fallback.',
  );
  lines.push(
    '- StealthAudit-5564 scannt den kanonischen ERC-5564 Announcer 0x55649E01B5Df198D18D95b5cc5051630cfD45564 und kennt die ERC-6538 Registry 0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538.',
  );
  lines.push('- DAC8-SelfProof referenziert den Meldezeitraum 2026 mit Filing-Fenster 01.01.–30.09.2027.');
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
