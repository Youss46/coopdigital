import { describe, expect, it } from "vitest";
import { getPrechargementSummary } from "./prechargement";

describe("récapitulatif frontend de pré-pesée", () => {
  it("affiche un contrôle à effectuer quand aucune session n'existe", () => {
    expect(getPrechargementSummary({
      poidsPrevuKg: "1000",
      poidsChargeKg: "1000",
    })).toMatchObject({
      statutLabel: "À effectuer",
      terminee: false,
      poidsPrevuKg: 1000,
      poidsChargeKg: 1000,
    });
  });

  it("reprend le poids effectivement pré-pesé et l'écart validé", () => {
    expect(getPrechargementSummary({
      poidsPrevuKg: "1000",
      poidsChargeEffectifKg: "1002",
      nombreSacsEffectif: 40,
      prechargement: {
        statut: "terminee",
        prechargementStatut: "valide",
        prechargementEcartKg: "2",
        prechargementEcartPct: "0.2",
      },
    })).toMatchObject({
      statutLabel: "Validée",
      terminee: true,
      poidsPrevuKg: 1000,
      poidsChargeKg: 1002,
      nombreSacsCharge: 40,
      ecartKg: 2,
      ecartPct: 0.2,
    });
  });

  it("signale un écart terminé mais non validé", () => {
    expect(getPrechargementSummary({
      poidsPrevuKg: "1000",
      prechargement: {
        statut: "terminee",
        prechargementStatut: "a_justifier",
        prechargementEcartKg: "100",
        prechargementEcartPct: "10",
      },
    }).statutLabel).toBe("À justifier");
  });
});