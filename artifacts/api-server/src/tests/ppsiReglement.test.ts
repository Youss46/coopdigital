import { describe, expect, it } from "vitest";
import {
  calculerReglementPpsi,
  securiserReglementPpsi,
} from "../services/chargesDiversesService.js";

describe("règlement PPSI", () => {
  it.each([
    ["taux nul", 100_000, 0, 0, 100_000],
    ["taux élevé", 100_000, 150, 100_000, 0],
    ["montant nul", 0, 2, 0, 0],
  ])("%s : retenue + net ne dépasse jamais le brut", (_cas, brut, taux, retenue, net) => {
    const result = calculerReglementPpsi(brut, taux);
    expect(result).toEqual({ brut, retenue, net });
    expect(result.retenue + result.net).toBeLessThanOrEqual(result.brut);
  });

  it("reborne les montants historiques incohérents sans double déduction", () => {
    const result = securiserReglementPpsi(100_000, 80_000, 90_000);
    expect(result).toEqual({ brut: 100_000, retenue: 80_000, net: 20_000 });
    expect(result.retenue + result.net).toBe(result.brut);
  });

  it("recalcule le net historique au lieu de cumuler une ancienne retenue", () => {
    const result = securiserReglementPpsi(100_000, 20_000, 10_000);
    expect(result).toEqual({ brut: 100_000, retenue: 20_000, net: 80_000 });
  });

  it("ne produit aucune écriture positive pour un brut nul", () => {
    expect(securiserReglementPpsi(0, 10_000, 10_000)).toEqual({
      brut: 0,
      retenue: 0,
      net: 0,
    });
  });
});