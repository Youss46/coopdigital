import { describe, expect, it } from "vitest";
import {
  construireFicheReglementsEffectuesHtml,
  construireFicheReglementsEnAttenteHtml,
} from "./reglementsPrint";

describe("fiche imprimable des règlements en attente", () => {
  it("affiche le total restant dans le résumé et dans le pied du tableau", () => {
    const html = construireFicheReglementsEnAttenteHtml({
      cooperativeNom: "COOBEPA",
      dateDebut: "2026-01-01",
      dateFin: "2026-01-31",
      genereLe: "2026-02-01T10:00:00.000Z",
      nombreLivraisons: 1,
      totalMontantNetFcfa: 12000,
      totalMontantRegleFcfa: 4500,
      totalMontantRestantFcfa: 7500,
      items: [{
        livraisonId: 15,
        numeroLivraison: "LIV-2026-15",
        dateLivraison: "2026-01-12",
        producteur: "Awa Kouassi",
        village: "Abbé",
        montantNetFcfa: 12000,
        montantRegleFcfa: 4500,
        montantRestantFcfa: 7500,
      }],
    });

    expect(html).toContain("Total restant à régler");
    expect(html.match(/7\s*500 FCFA/g)).toHaveLength(3);
    expect(html).toContain("TOTAL — 1 livraison");
  });

  it("échappe les données avant de les intégrer dans le document imprimable", () => {
    const html = construireFicheReglementsEnAttenteHtml({
      cooperativeNom: '<img src=x onerror="alert(1)">',
      dateDebut: "2026-01-01",
      dateFin: "2026-01-31",
      genereLe: "2026-02-01T10:00:00.000Z",
      nombreLivraisons: 1,
      totalMontantNetFcfa: 1000,
      totalMontantRegleFcfa: 0,
      totalMontantRestantFcfa: 1000,
      items: [{
        livraisonId: 15,
        numeroLivraison: "LIV-15",
        dateLivraison: "2026-01-12",
        producteur: '<script>alert("x")</script>',
        village: null,
        montantNetFcfa: 1000,
        montantRegleFcfa: 0,
        montantRestantFcfa: 1000,
      }],
    });

    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("imprime les paiements effectués, y compris le total et les chèques encaissés", () => {
    const html = construireFicheReglementsEffectuesHtml({
      cooperativeNom: "COOBEPA",
      dateDebut: "2026-01-01",
      dateFin: "2026-01-31",
      genereLe: "2026-02-01T10:00:00.000Z",
      nombreReglements: 2,
      totalMontantRegleFcfa: 11000,
      items: [
        {
          id: "paiement-ligne-11",
          dateReglement: "2026-01-05",
          typeOperation: "livraison",
          dateOperation: "2025-12-20",
          referenceOperation: "LIV-2025-10",
          beneficiaire: "Awa Kouassi",
          description: null,
          village: "Abbé",
          modePaiement: "especes",
          referencePaiement: "REC-10",
          montantFcfa: 6000,
        },
        {
          id: "cheque-13",
          dateReglement: "2026-01-20",
          typeOperation: "depense_vehicule",
          dateOperation: "2026-01-09",
          referenceOperation: "PIECE-13",
          beneficiaire: "Garage K",
          description: "Réparation",
          village: null,
          modePaiement: "cheque",
          referencePaiement: "CHQ-13",
          montantFcfa: 5000,
        },
      ],
    });

    expect(html).toContain("Liste des règlements effectués");
    expect(html).toContain("CHQ-13");
    expect(html).toContain("Chèque encaissé");
    expect(html).not.toContain("Bon carburant");
    expect(html).toContain("Dépense véhicule");
    expect(html).toContain("Garage K");
    expect(html).toContain("Total réglé sur la période");
    expect(html.match(/11\s*000 FCFA/g)).toHaveLength(2);
  });
});
