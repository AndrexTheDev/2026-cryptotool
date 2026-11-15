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

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
