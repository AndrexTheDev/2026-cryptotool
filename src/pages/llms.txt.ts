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
    '- x402-PaywallGuard fuehrt eine eingebettete Advisory-Matrix auf dem Stand Oktober/November 2026 (V12-Disclosure: 25 Findings, 3 kritische — Spend-Limit-Fix, Solana-ApproveChecked-Bypass, SIWx-Login-Replay ab Linie 2.23.0; zusaetzlich Payment-Bypass-Fix 2.27.0 und PT-2026-118463 SIWX-Server-Auth-Bypass bis 2.28.0). Da diese Findings nicht in npm audit/PyPI-Warnungen auftauchen, prueft das Modul explizit gegen diese Matrix.',
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
