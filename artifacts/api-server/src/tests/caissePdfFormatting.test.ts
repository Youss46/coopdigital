import { describe, expect, it } from "vitest";
import { formatMontantPdf } from "../services/caisseService.js";

describe("formatage des montants du PDF de caisse", () => {
  it("utilise des espaces ASCII entre les milliers", () => {
    const montant = formatMontantPdf(43127113);

    expect(montant).toBe("43 127 113 FCFA");
    expect(montant).not.toContain("\u202F");
    expect(montant).not.toContain("\u00A0");
  });

  it("accepte les montants numériques renvoyés par PostgreSQL", () => {
    expect(formatMontantPdf("46100700")).toBe("46 100 700 FCFA");
  });
});