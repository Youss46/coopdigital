import { describe, expect, it } from "vitest";
import { calculerAssietteItsCnps } from "../services/paieService.js";

describe("exonération ITS/CNPS de la prime de transport", () => {
  it("n'exonère rien lorsque le plafond est absent", () => {
    expect(
      calculerAssietteItsCnps(110_000, [
        { montant: 10_000, plafondExonerationFcfa: null },
      ]),
    ).toEqual({
      assietteFcfa: 110_000,
      montantExonereFcfa: 0,
      montantsExoneresParAvantage: [0],
    });
  });

  it("exonère la prime entière lorsqu'elle est sous le plafond", () => {
    expect(
      calculerAssietteItsCnps(110_000, [
        { montant: 10_000, plafondExonerationFcfa: 15_000 },
      ]),
    ).toEqual({
      assietteFcfa: 100_000,
      montantExonereFcfa: 10_000,
      montantsExoneresParAvantage: [10_000],
    });
  });

  it("exonère la prime entière lorsqu'elle atteint exactement le plafond", () => {
    expect(
      calculerAssietteItsCnps(115_000, [
        { montant: 15_000, plafondExonerationFcfa: 15_000 },
      ]),
    ).toEqual({
      assietteFcfa: 100_000,
      montantExonereFcfa: 15_000,
      montantsExoneresParAvantage: [15_000],
    });
  });

  it("exonère jusqu'au plafond et taxe l'excédent", () => {
    expect(
      calculerAssietteItsCnps(120_000, [
        { montant: 20_000, plafondExonerationFcfa: 15_000 },
      ]),
    ).toEqual({
      assietteFcfa: 105_000,
      montantExonereFcfa: 15_000,
      montantsExoneresParAvantage: [15_000],
    });
  });

  it("n'exonère pas les autres avantages personnalisés", () => {
    expect(
      calculerAssietteItsCnps(135_000, [
        { montant: 20_000, plafondExonerationFcfa: 15_000 },
        { montant: 15_000, plafondExonerationFcfa: null },
      ]),
    ).toEqual({
      assietteFcfa: 120_000,
      montantExonereFcfa: 15_000,
      montantsExoneresParAvantage: [15_000, 0],
    });
  });
});
