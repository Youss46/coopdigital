import { describe, expect, it } from "vitest";
import type { LotTracabilite } from "@workspace/api-client-react";
import { construireExportEudr } from "./TracabilitePage";

describe("export EUDR de la traçabilité", () => {
  it("conserve les heures distinctes de transitions effectuées le même jour", () => {
    const data = {
      lot: {
        id: 7,
        qrCodeLot: "LOT-7",
        poidsTotalKg: "1200",
        dateCreation: "2026-09-10",
        cooperativeId: 3,
        expeditionNumero: "EXP-7",
        expeditionStatut: "receptionne",
      },
      membres: [],
      livraisons: [],
      parcelles: [],
      expeditionHistorique: [
        {
          statutPrecedent: null,
          statutNouveau: "charge",
          dateChangement: "2026-09-10T09:00:00.000Z",
          faitPar: null,
          faitParNom: null,
          faitParPrenoms: null,
          notes: null,
        },
        {
          statutPrecedent: "charge",
          statutNouveau: "receptionne",
          dateChangement: "2026-09-10T14:30:00.000Z",
          faitPar: null,
          faitParNom: null,
          faitParPrenoms: null,
          notes: "Réception confirmée",
        },
      ],
    } as unknown as LotTracabilite;

    const payload = construireExportEudr(data);

    expect(payload.historique_expedition.map((etape) => etape.date_changement)).toEqual([
      "2026-09-10T09:00:00.000Z",
      "2026-09-10T14:30:00.000Z",
    ]);
  });
});