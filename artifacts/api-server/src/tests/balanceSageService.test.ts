import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseBalanceSage } from "../services/balanceSageService.js";

describe("parseBalanceSage", () => {
  it("lit le fichier Sage .xls sans ligne d'en-tête", async () => {
    const buffer = await readFile("../../attached_assets/BALANCE_DIGITAL_1787840657259.xls");
    const parsed = parseBalanceSage(buffer, "balance.xls");

    expect(parsed.feuille).toBe("Sage");
    expect(parsed.headers).toHaveLength(8);
    expect(parsed.rows.length).toBe(71);
    expect(parsed.rows[0]).toMatchObject({
      numeroCompte: "101300",
      totalDebit: 0,
      totalCredit: 10_000_000,
      soldeDebiteur: 0,
      soldeCrediteur: 10_000_000,
    });
    expect(parsed.rows.every((row) => row.erreur === null)).toBe(true);
  });

  it("normalise les montants français et signale les comptes en doublon", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Compte", "Libellé", "Débit", "Crédit", "Solde débiteur", "Solde créditeur"],
      ["601", "Achats", "1 250,50", "", "1 250,50", ""],
      ["601", "Achats bis", "10", "", "10", ""],
      ["", "Sans compte", "x", "", "", ""],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sage");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseBalanceSage(buffer, "synthetic.xlsx", {
      numeroCompte: 0, libelle: 1, totalDebit: 2, totalCredit: 3, soldeDebiteur: 4, soldeCrediteur: 5,
    });

    expect(parsed.rows[0]?.totalDebit).toBe(1251);
    expect(parsed.rows[1]?.erreur).toContain("doublon");
    expect(parsed.rows[2]?.erreur).toContain("Numéro de compte manquant");
  });
});