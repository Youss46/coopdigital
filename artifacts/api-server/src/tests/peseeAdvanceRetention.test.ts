import { describe, expect, it } from "vitest";

const { calculerRetenueAvanceLivraison } = await import(
  "../services/peseeSessionService.js"
);

const avance = (overrides: Record<string, unknown> = {}) => ({
  planType: "integral" as const,
  montantPartielFcfa: null,
  soldeRestantFcfa: 100_000,
  reportDate: null,
  ...overrides,
});

describe("retenues d'avance sur une livraison réelle", () => {
  it("ignore une avance intégrale avant sa date de début", () => {
    expect(
      calculerRetenueAvanceLivraison(
        avance({ reportDate: "2026-09-10" }),
        "2026-09-09",
        80_000,
      ),
    ).toBe(0);
  });

  it("rend les avances intégrales éligibles le jour de leur date de début", () => {
    expect(
      calculerRetenueAvanceLivraison(
        avance({ reportDate: "2026-09-10" }),
        "2026-09-10",
        80_000,
      ),
    ).toBe(80_000);
  });

  it("respecte le montant prévu d'une avance partielle à la date prévue", () => {
    expect(
      calculerRetenueAvanceLivraison(
        avance({
          planType: "partiel",
          montantPartielFcfa: 30_000,
          reportDate: "2026-09-10",
        }),
        "2026-09-10",
        80_000,
      ),
    ).toBe(30_000);
  });

  it("retient une avance échue uniquement sur le payable de la livraison", () => {
    expect(
      calculerRetenueAvanceLivraison(
        avance({
          reportDate: "2026-09-01",
          dateEcheance: "2026-09-05",
          statut: "en_retard",
        }),
        "2026-09-10",
        25_000,
      ),
    ).toBe(25_000);
  });

  it("permet le plan reporté après sa date de début sans utiliser l'échéance", () => {
    expect(
      calculerRetenueAvanceLivraison(
        avance({
          planType: "reporte",
          reportDate: "2026-09-10",
          dateEcheance: "2026-09-05",
        }),
        "2026-09-10",
        120_000,
      ),
    ).toBe(100_000);
  });

  it("ne rend pas un plan reporté éligible sans date de début", () => {
    expect(
      calculerRetenueAvanceLivraison(
        avance({ planType: "reporte" }),
        "2026-09-10",
        80_000,
      ),
    ).toBe(0);
  });
});