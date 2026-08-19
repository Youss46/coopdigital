import { describe, expect, it } from "vitest";
import { calculerReglementMembreDelegue } from "../services/membreDelegueReglement.js";

describe("calculerReglementMembreDelegue", () => {
  it("déduit carburant, autres charges et avance du même net à payer", () => {
    const reglement = calculerReglementMembreDelegue({
      valeurProduitFcfa: 180_000,
      fraisCarburantFcfa: 12_500,
      autresChargesFcfa: 7_500,
      avanceDeduiteFcfa: 25_000,
    });

    expect(reglement.totalChargesFcfa).toBe(20_000);
    expect(reglement.montantAvantRetenuesFcfa).toBe(180_000);
    expect(reglement.montantNetFcfa).toBe(135_000);
    expect(reglement.creanceChargesRestanteFcfa).toBe(0);
  });

  it("ne produit jamais un paiement négatif lorsque les retenues dépassent la valeur", () => {
    const reglement = calculerReglementMembreDelegue({
      valeurProduitFcfa: 10_000,
      fraisCarburantFcfa: 8_000,
      autresChargesFcfa: 6_000,
      avanceDeduiteFcfa: 4_000,
    });

    expect(reglement.montantNetFcfa).toBe(0);
    expect(reglement.fraisCarburantFcfa).toBe(8_000);
    expect(reglement.autresChargesFcfa).toBe(2_000);
    expect(reglement.totalChargesFcfa).toBe(10_000);
    expect(reglement.avanceDeduiteFcfa).toBe(0);
    expect(reglement.avanceDemandeeFcfa).toBe(4_000);
    expect(reglement.fraisCarburantNonRecupereFcfa).toBe(0);
    expect(reglement.autresChargesNonRecupereesFcfa).toBe(4_000);
    expect(reglement.creanceChargesRestanteFcfa).toBe(4_000);
  });
});