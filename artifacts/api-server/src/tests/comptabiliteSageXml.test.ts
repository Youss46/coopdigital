import { describe, expect, it } from "vitest";
import { buildSageXml } from "../controllers/comptabiliteController.js";

describe("buildSageXml", () => {
  it("génère un document XML UTF-8 avec les champs d'une écriture", () => {
    const xml = buildSageXml(2026, [[
      "2026-08-28",
      "PAIEMENT",
      "P-001",
      "Achat & règlement <urgent>",
      "401",
      "401-FOURN-001",
      "fournisseur-12",
      "fournisseur_ext",
      "125000",
      "0",
    ]]);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<ExportSage exercice="2026" source="CoopDigital">');
    expect(xml).toContain("<Ecritures>");
    expect(xml).toContain("<NumeroPiece>P-001</NumeroPiece>");
    expect(xml).toContain("<Libelle>Achat &amp; règlement &lt;urgent&gt;</Libelle>");
    expect(xml).toContain("<CompteSage>401-FOURN-001</CompteSage>");
    expect(xml).toContain("<Debit>125000</Debit>");
    expect(xml).toContain("<Credit>0</Credit>");
    expect(xml).toMatch(/<\/ExportSage>\r\n$/);
  });

  it("représente les valeurs absentes par des éléments XML vides", () => {
    const xml = buildSageXml(2026, [[
      "2026-08-28", "MANUEL", "", "Libellé", "601", "601000001",
      "", "", "0", "500",
    ]]);

    expect(xml).toContain("<NumeroPiece/>");
    expect(xml).toContain("<CodeTiers/>");
    expect(xml).toContain("<TypeTiers/>");
  });
});