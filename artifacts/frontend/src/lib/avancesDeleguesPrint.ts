export interface RapportAvanceDelegueItem {
  id: number;
  membreId: number;
  membreNom: string | null;
  membrePrenoms: string | null;
  section: string | null;
  village: string | null;
  montantOctroyeFcfa: number;
  montantRembourseFcfa: number;
  soldeRestantFcfa: number;
  dateOctroi: string;
  dateEcheance: string | null;
  motif: string | null;
  statut: "en_cours" | "en_retard";
}

export interface RapportAvancesDelegues {
  items: RapportAvanceDelegueItem[];
  nombreAvances: number;
  nombreEnCours: number;
  nombreEnRetard: number;
  totalMontantOctroyeFcfa: number;
  totalMontantRembourseFcfa: number;
  totalSoldeRestantFcfa: number;
  genereLe: string;
}

function echapperHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtFcfa(value: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(value)} FCFA`;
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? echapperHtml(value)
    : new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC" }).format(date);
}

function fmtDateHeure(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? echapperHtml(value)
    : new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function nomMembre(item: RapportAvanceDelegueItem): string {
  return [item.membrePrenoms, item.membreNom]
    .filter((value): value is string => !!value?.trim())
    .join(" ") || `Délégué de localités #${item.membreId}`;
}

function libelleStatut(statut: RapportAvanceDelegueItem["statut"]): string {
  return statut === "en_retard" ? "En retard" : "En cours";
}

export function construireFicheAvancesDeleguesHtml(
  rapport: RapportAvancesDelegues,
  titrePerimetre = "Tous les délégués de localités",
): string {
  const lignes = rapport.items.length > 0
    ? rapport.items.map((item) => `
      <tr>
        <td>${echapperHtml(nomMembre(item))}</td>
        <td>${echapperHtml(item.section?.trim() || item.village?.trim() || "—")}</td>
        <td>${fmtDate(item.dateOctroi)}</td>
        <td>${fmtDate(item.dateEcheance)}</td>
        <td>${libelleStatut(item.statut)}</td>
        <td class="amount">${fmtFcfa(item.montantOctroyeFcfa)}</td>
        <td class="amount">${fmtFcfa(item.montantRembourseFcfa)}</td>
        <td class="amount due">${fmtFcfa(item.soldeRestantFcfa)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="8" class="empty">Aucune avance restant due pour ce périmètre.</td></tr>`;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Avances restant dues — CoopDigital</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { color: #17211b; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; margin: 0; }
    header { border-bottom: 2px solid #1a4731; margin-bottom: 16px; padding-bottom: 12px; }
    h1 { color: #1a4731; font-size: 20pt; margin: 0 0 5px; }
    .cooperative { font-size: 12pt; font-weight: 700; }
    .period, .generated { color: #56645b; font-size: 9pt; margin-top: 5px; }
    .summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 14px 0 18px; }
    .card { border: 1px solid #d6e2da; border-radius: 5px; padding: 9px 11px; }
    .card span { color: #64736a; display: block; font-size: 8pt; margin-bottom: 5px; }
    .card strong { font-size: 11pt; }
    .card.total { background: #eff8f1; border-color: #9dc8a9; color: #14532d; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #d8dfda; padding: 6px 7px; overflow-wrap: anywhere; text-align: left; vertical-align: top; }
    th { background: #edf3ef; color: #24382b; font-size: 8pt; }
    td { font-size: 8.5pt; }
    th:nth-child(1) { width: 17%; }
    th:nth-child(2) { width: 13%; }
    th:nth-child(3), th:nth-child(4) { width: 10%; }
    th:nth-child(5) { width: 9%; }
    th:nth-child(n+6) { width: 13.5%; }
    td.amount, th.amount { text-align: right; white-space: nowrap; }
    td.due { color: #14532d; font-weight: 700; }
    tfoot td { background: #eff8f1; font-weight: 700; }
    .empty { color: #64736a; padding: 20px; text-align: center; }
    footer { color: #64736a; font-size: 8pt; margin-top: 12px; text-align: right; }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    tr { break-inside: avoid; }
    @media screen {
      body { margin: 24px auto; max-width: 1100px; padding: 0 20px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="cooperative">CoopDigital · Délégués de localités</div>
    <h1>Avances restant dues</h1>
    <div class="period">Périmètre : ${echapperHtml(titrePerimetre)}</div>
    <div class="generated">Situation au ${fmtDateHeure(rapport.genereLe)}</div>
  </header>
  <section class="summary" aria-label="Totaux des avances restant dues">
    <div class="card"><span>Avances restantes dues</span><strong>${rapport.nombreAvances}</strong></div>
    <div class="card"><span>En cours</span><strong>${rapport.nombreEnCours}</strong></div>
    <div class="card"><span>En retard</span><strong>${rapport.nombreEnRetard}</strong></div>
    <div class="card"><span>Total octroyé</span><strong>${fmtFcfa(rapport.totalMontantOctroyeFcfa)}</strong></div>
    <div class="card total"><span>Solde restant</span><strong>${fmtFcfa(rapport.totalSoldeRestantFcfa)}</strong></div>
  </section>
  <p class="period">Montant remboursé sur ces avances : <strong>${fmtFcfa(rapport.totalMontantRembourseFcfa)}</strong></p>
  <table>
    <thead>
      <tr>
        <th>Délégué</th>
        <th>Section / village</th>
        <th>Date d’octroi</th>
        <th>Échéance</th>
        <th>Statut</th>
        <th class="amount">Montant octroyé</th>
        <th class="amount">Remboursé</th>
        <th class="amount">Solde restant</th>
      </tr>
    </thead>
    <tbody>${lignes}</tbody>
    <tfoot>
      <tr>
        <td colspan="5">TOTAL — ${rapport.nombreAvances} avance${rapport.nombreAvances === 1 ? "" : "s"}</td>
        <td class="amount">${fmtFcfa(rapport.totalMontantOctroyeFcfa)}</td>
        <td class="amount">${fmtFcfa(rapport.totalMontantRembourseFcfa)}</td>
        <td class="amount due">${fmtFcfa(rapport.totalSoldeRestantFcfa)}</td>
      </tr>
    </tfoot>
  </table>
  <footer>CoopDigital · Avances restant dues · ${fmtDateHeure(rapport.genereLe)}</footer>
</body>
</html>`;
}
