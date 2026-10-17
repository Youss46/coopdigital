import { describe, expect, it } from "vitest";
import {
  construireFicheAvancesDeleguesHtml,
  type RapportAvancesDelegues,
} from "./avancesDeleguesPrint";

function normaliserEspacesMontants(value: string) {
  return value.replace(/[\u00a0\u202f]/g, " ");
}

const rapport: RapportAvancesDelegues = {
  items: [
    {
      id: 1,
      membreId: 12,
      membreNom: "Koné",
      membrePrenoms: "Siaka",
      section: "N'Goran",
      village: "Bocanda",
      montantOctroyeFcfa: 300_000,
      montantRembourseFcfa: 50_000,
      soldeRestantFcfa: 250_000,
      dateOctroi: "2026-09-10",
      dateEcheance: "2026-10-01",
      motif: null,
      statut: "en_retard",
    },
    {
      id: 2,
      membreId: 13,
      membreNom: "Yao",
      membrePrenoms: "Awa",
      section: null,
      village: "Abobo",
      montantOctroyeFcfa: 200_000,
      montantRembourseFcfa: 0,
      soldeRestantFcfa: 200_000,
      dateOctroi: "2026-10-02",
      dateEcheance: null,
      motif: null,
      statut: "en_cours",
    },
  ],
  nombreAvances: 2,
  nombreEnCours: 1,
  nombreEnRetard: 1,
  totalMontantOctroyeFcfa: 500_000,
  totalMontantRembourseFcfa: 50_000,
  totalSoldeRestantFcfa: 450_000,
  genereLe: "2026-10-17T09:30:00.000Z",
};

describe("fiche imprimable des avances des délégués de localités", () => {
  it("inclut les lignes actives et leurs totaux", () => {
    const html = construireFicheAvancesDeleguesHtml(rapport);

    expect(html).toContain("Avances restant dues");
    expect(html).toContain("Siaka Koné");
    expect(html).toContain("Awa Yao");
    expect(html).toContain("En cours");
    expect(html).toContain("En retard");
    expect(normaliserEspacesMontants(html)).toContain("500 000");
    expect(normaliserEspacesMontants(html)).toContain("450 000");
    expect(html).toContain("TOTAL — 2 avances");
  });

  it("échappe les valeurs utilisateur et indique un résultat vide", () => {
    const html = construireFicheAvancesDeleguesHtml(
      { ...rapport, items: [], nombreAvances: 0 },
      `<script>alert("x")</script>`,
    );

    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("Aucune avance restant due pour ce périmètre.");
  });
});
