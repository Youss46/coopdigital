import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseMembresImportWorkbook } from "../controllers/membresImportController.js";

function workbookBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("parseMembresImportWorkbook", () => {
  it("lit le format réorganisé Membres/Parcelles", () => {
    const buffer = workbookBuffer({
      "Membres (import)": [
        [
          "Identifiant COOBEPA",
          "Nom",
          "Prénoms",
          "Téléphone",
          "Numéro CNI",
          "Village",
          "Superficie totale déclarée (ha)",
          "Année de naissance",
          "Sexe",
          "Nombre de parcelles",
          "Superficie cumulée parcelles (ha)",
        ],
        ["SB-ABB-0001", "BAKOUAN", "ALLASSANE", "07 07 48 71 79", "CNI-1", "Abbe Begnini", "6", "1981", "Masculin", "2", "5.33"],
        ["SB-ABB-0002", "DAO", "ZIE", null, "CNI-2", "Abbe Begnini", "4", "1976", "Féminin", "1", "4"],
      ],
      "Parcelles (import)": [
        ["Identifiant COOBEPA", "Code parcelle", "Superficie (ha)", "Latitude", "Longitude"],
        ["SB-ABB-0001", "SB-ABB-0001-P1", "1.66", "5.661871", "-3.982501"],
        ["SB-ABB-0001", "SB-ABB-0001-P2", "3.67", "6.053334", "-4.118969"],
        ["SB-ABB-0002", "SB-ABB-0002-P1", "4", "6.1", "-4.2"],
      ],
    });

    const rows = parseMembresImportWorkbook(buffer);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sourceId: "SB-ABB-0001",
      nom: "BAKOUAN",
      prenoms: "ALLASSANE",
      telephone: "07 07 48 71 79",
      nombreParcelles: 2,
      superficieTotale: 5.33,
      sexe: "M",
    });
    expect(rows[0]?.units).toHaveLength(2);
    expect(rows[1]?.telephone).toBeNull();
    expect(rows[1]?.warnings).toContain("Téléphone manquant — à compléter ultérieurement");
  });
});