import type { PaiementsRapportEnAttente } from "@workspace/api-client-react";
import type { PaiementsRapportEffectues } from "@workspace/api-client-react";

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

function fmtDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
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

export function libelleModePaiement(value: string): string {
  const labels: Record<string, string> = {
    orange_money: "Orange Money",
    mtn_momo: "MTN Mobile Money",
    especes: "Espèces",
    wave: "Wave",
    cheque: "Chèque encaissé",
    virement: "Virement bancaire",
    carte_producteur: "Carte producteur",
    paiement: "Paiement",
  };
  return value.split(" / ").map((mode) => labels[mode] ?? mode).join(" / ");
}

function libelleTypeOperation(value: string): string {
  const labels: Record<string, string> = {
    livraison: "Livraison",
    carburant: "Bon carburant",
    depense_vehicule: "Dépense véhicule",
  };
  return labels[value] ?? value;
}

export function construireFicheReglementsEnAttenteHtml(
  rapport: PaiementsRapportEnAttente,
): string {
  const lignes = rapport.items.length > 0
    ? rapport.items.map((item) => `
      <tr>
        <td>${fmtDate(item.dateLivraison)}</td>
        <td class="ref">${echapperHtml(item.numeroLivraison)}</td>
        <td>${echapperHtml(item.producteur)}</td>
        <td>${echapperHtml(item.village ?? "—")}</td>
        <td class="amount">${fmtFcfa(item.montantNetFcfa)}</td>
        <td class="amount">${fmtFcfa(item.montantRegleFcfa)}</td>
        <td class="amount due">${fmtFcfa(item.montantRestantFcfa)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="empty">Aucun règlement en attente pour cette période.</td></tr>`;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Règlements en attente — ${echapperHtml(rapport.cooperativeNom)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { color: #17211b; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; margin: 0; }
    header { border-bottom: 2px solid #1a4731; margin-bottom: 16px; padding-bottom: 12px; }
    h1 { color: #1a4731; font-size: 20pt; margin: 0 0 5px; }
    .cooperative { font-size: 12pt; font-weight: 700; }
    .period, .generated { color: #56645b; font-size: 9pt; margin-top: 5px; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0 18px; }
    .card { border: 1px solid #d6e2da; border-radius: 5px; padding: 9px 11px; }
    .card span { color: #64736a; display: block; font-size: 8pt; margin-bottom: 5px; }
    .card strong { font-size: 12pt; }
    .card.total { background: #eff8f1; border-color: #9dc8a9; color: #14532d; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #d8dfda; padding: 6px 7px; overflow-wrap: anywhere; text-align: left; vertical-align: top; }
    th { background: #edf3ef; color: #24382b; font-size: 8pt; }
    td { font-size: 8.5pt; }
    th:nth-child(1) { width: 9%; }
    th:nth-child(2) { width: 13%; }
    th:nth-child(3) { width: 20%; }
    th:nth-child(4) { width: 13%; }
    th:nth-child(n+5) { width: 15%; }
    td.amount, th.amount { text-align: right; white-space: nowrap; }
    td.ref { font-family: monospace; }
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
    <div class="cooperative">${echapperHtml(rapport.cooperativeNom)}</div>
    <h1>Règlements de livraisons en attente</h1>
    <div class="period">Période des livraisons : du ${fmtDate(rapport.dateDebut)} au ${fmtDate(rapport.dateFin)}</div>
    <div class="generated">Fiche générée le ${fmtDateHeure(rapport.genereLe)}</div>
  </header>
  <section class="summary" aria-label="Totaux de la période">
    <div class="card"><span>Livraisons à régler</span><strong>${rapport.nombreLivraisons}</strong></div>
    <div class="card"><span>Montant net total</span><strong>${fmtFcfa(rapport.totalMontantNetFcfa)}</strong></div>
    <div class="card"><span>Déjà réglé</span><strong>${fmtFcfa(rapport.totalMontantRegleFcfa)}</strong></div>
    <div class="card total"><span>Total restant à régler</span><strong>${fmtFcfa(rapport.totalMontantRestantFcfa)}</strong></div>
  </section>
  <table>
    <thead>
      <tr>
        <th>Date livraison</th>
        <th>Référence</th>
        <th>Producteur</th>
        <th>Village</th>
        <th class="amount">Montant net</th>
        <th class="amount">Déjà réglé</th>
        <th class="amount">Reste à régler</th>
      </tr>
    </thead>
    <tbody>${lignes}</tbody>
    <tfoot>
      <tr>
        <td colspan="4">TOTAL — ${rapport.nombreLivraisons} livraison${rapport.nombreLivraisons === 1 ? "" : "s"}</td>
        <td class="amount">${fmtFcfa(rapport.totalMontantNetFcfa)}</td>
        <td class="amount">${fmtFcfa(rapport.totalMontantRegleFcfa)}</td>
        <td class="amount due">${fmtFcfa(rapport.totalMontantRestantFcfa)}</td>
      </tr>
    </tfoot>
  </table>
  <footer>CoopDigital · Règlements en attente · ${fmtDateHeure(rapport.genereLe)}</footer>
</body>
</html>`;
}

export function construireFicheReglementsEffectuesHtml(
  rapport: PaiementsRapportEffectues,
): string {
  const lignes = rapport.items.length > 0
    ? rapport.items.map((item) => `
      <tr>
        <td>${fmtDate(item.dateReglement)}</td>
        <td>${echapperHtml(libelleTypeOperation(item.typeOperation))}</td>
        <td>${fmtDate(item.dateOperation)}</td>
        <td class="ref">${echapperHtml(item.referenceOperation)}</td>
        <td>${echapperHtml(item.beneficiaire)}</td>
        <td>${echapperHtml(item.description ?? item.village ?? "—")}</td>
        <td>${echapperHtml(libelleModePaiement(item.modePaiement))}</td>
        <td class="ref">${echapperHtml(item.referencePaiement)}</td>
        <td class="amount">${fmtFcfa(item.montantFcfa)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="9" class="empty">Aucun règlement effectué pour cette période.</td></tr>`;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Règlements effectués — ${echapperHtml(rapport.cooperativeNom)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { color: #17211b; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; margin: 0; }
    header { border-bottom: 2px solid #1a4731; margin-bottom: 16px; padding-bottom: 12px; }
    h1 { color: #1a4731; font-size: 20pt; margin: 0 0 5px; }
    .cooperative { font-size: 12pt; font-weight: 700; }
    .period, .generated { color: #56645b; font-size: 9pt; margin-top: 5px; }
    .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 14px 0 18px; }
    .card { border: 1px solid #d6e2da; border-radius: 5px; padding: 9px 11px; }
    .card span { color: #64736a; display: block; font-size: 8pt; margin-bottom: 5px; }
    .card strong { font-size: 12pt; }
    .card.total { background: #eff8f1; border-color: #9dc8a9; color: #14532d; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #d8dfda; padding: 6px 7px; overflow-wrap: anywhere; text-align: left; vertical-align: top; }
    th { background: #edf3ef; color: #24382b; font-size: 8pt; }
    td { font-size: 8.5pt; }
    th:nth-child(1) { width: 9%; }
    th:nth-child(2) { width: 11%; }
    th:nth-child(3) { width: 9%; }
    th:nth-child(4) { width: 11%; }
    th:nth-child(5) { width: 15%; }
    th:nth-child(6) { width: 15%; }
    th:nth-child(7) { width: 10%; }
    th:nth-child(8) { width: 10%; }
    th:nth-child(9) { width: 10%; }
    td.amount, th.amount { text-align: right; white-space: nowrap; }
    td.ref { font-family: monospace; }
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
    <div class="cooperative">${echapperHtml(rapport.cooperativeNom)}</div>
    <h1>Liste des règlements effectués</h1>
    <div class="period">Période des règlements : du ${fmtDate(rapport.dateDebut)} au ${fmtDate(rapport.dateFin)}</div>
    <div class="generated">Fiche générée le ${fmtDateHeure(rapport.genereLe)}</div>
  </header>
  <section class="summary" aria-label="Totaux de la période">
    <div class="card"><span>Règlements effectués</span><strong>${rapport.nombreReglements}</strong></div>
    <div class="card total"><span>Total réglé sur la période</span><strong>${fmtFcfa(rapport.totalMontantRegleFcfa)}</strong></div>
  </section>
  <table>
    <thead>
      <tr>
        <th>Date de règlement</th>
        <th>Type</th>
        <th>Date opération</th>
        <th>Référence</th>
        <th>Bénéficiaire</th>
        <th>Détail / village</th>
        <th>Mode</th>
        <th>Référence paiement</th>
        <th class="amount">Montant réglé</th>
      </tr>
    </thead>
    <tbody>${lignes}</tbody>
    <tfoot>
      <tr>
        <td colspan="8">TOTAL — ${rapport.nombreReglements} règlement${rapport.nombreReglements === 1 ? "" : "s"}</td>
        <td class="amount">${fmtFcfa(rapport.totalMontantRegleFcfa)}</td>
      </tr>
    </tfoot>
  </table>
  <footer>CoopDigital · Liste des règlements effectués · ${fmtDateHeure(rapport.genereLe)}</footer>
</body>
</html>`;
}
