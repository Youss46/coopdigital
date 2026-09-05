import { describe, expect, it, vi } from "vitest";

vi.mock("../services/pdfHeaderService.js", () => ({
  drawHeader: vi.fn().mockResolvedValue(undefined),
  drawFooter: vi.fn().mockResolvedValue(undefined),
}));

const { generateBonsCarburantReglement } = await import("../services/bonCarburantPdf.js");

function bon(index: number, stationService: string) {
  return {
    numero: `BC-${String(index).padStart(5, "0")}`,
    dateUtilisation: "2026-09-05",
    immatriculation: `AB-${index}`,
    chauffeurNom: "Kouassi",
    chauffeurPrenoms: "Jean",
    typeCarburant: "gasoil",
    quantiteLivree: "40",
    montantPaiementFcfa: 25000,
    stationService,
  };
}

describe("generateBonsCarburantReglement", () => {
  it("génère une fiche PDF regroupée par station sur plusieurs pages", async () => {
    const rows = [
      ...Array.from({ length: 19 }, (_, index) => bon(index + 1, "Station A")),
      bon(20, "Station B"),
    ];

    const pdf = await generateBonsCarburantReglement(1, rows);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("/Count 3");
  });
});