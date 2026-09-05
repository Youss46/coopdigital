import { describe, expect, it } from "vitest";
import { buildSageTxt } from "../controllers/comptabiliteController.js";
import { determinerCodeJournal, determinerCompteCollectifSage, determinerCompteTiersSage } from "../lib/sageJournal.js";

describe("buildSageTxt", () => {
  it("détermine le journal Sage selon la nature de chaque transaction", () => {
    expect(determinerCodeJournal({
      source: "livraison",
      libelle: "Achat cacao – Producteur",
      compteDebit: "601",
      compteCredit: "401",
    })).toBe("AKKO");
    expect(determinerCodeJournal({
      source: "stock",
      libelle: "Fournitures de bureau",
      compteDebit: "311",
      compteCredit: "401",
    })).toBe("ACD");
    expect(determinerCodeJournal({
      source: "vente",
      libelle: "Vente cacao – Client",
      compteDebit: "4111",
      compteCredit: "701",
    })).toBe("VKKO");
    expect(determinerCodeJournal({
      source: "salaire",
      libelle: "Versement salaire net",
      compteDebit: "421",
      compteCredit: "521",
    })).toBe("ODP");
    expect(determinerCodeJournal({
      source: "paiement",
      modePaiement: "especes",
      compteDebit: "401",
      compteCredit: "571",
    })).toBe("CAIS");
    expect(determinerCodeJournal({
      source: "paiement",
      modePaiement: "cheque",
      compteDebit: "401",
      compteCredit: "521",
    })).toBe("BQ");
    expect(determinerCodeJournal({
      source: "paiement",
      modePaiement: "virement",
      compteDebit: "401",
      compteCredit: "521",
    })).toBe("BQ");
    expect(determinerCodeJournal({
      source: "manuel",
      typeEcriture: "a_nouveau",
      compteDebit: "101",
      compteCredit: "401",
    })).toBe("RAN");
    expect(determinerCodeJournal({
      source: "manuel",
      libelle: "Régularisation",
      compteDebit: "658",
      compteCredit: "571",
    })).toBe("OD");

    const txt = buildSageTxt(2026, "ACH", [
      ["2026-08-28", "CAIS", "PAI-001", "Paiement espèces", "571", "571", "", "", "100000", "0"],
      ["2026-08-29", "BQ", "PAI-002", "Paiement chèque", "521", "521", "", "", "200000", "0"],
    ]);

    expect(txt).toContain("CAIS;280826;PAI-001;571000;Paiement especes;100000;D;");
    expect(txt).toContain("BQ;290826;PAI-002;521000;Paiement cheque;200000;D;");
  });

  it("génère l'en-tête Sage et l'ordre de colonnes attendu par le profil réel", () => {
    const txt = buildSageTxt(2026, "CAIS", [[
      "2026-08-28",
      "CAIS",
      "P-001",
      "Achat & règlement; urgent",
      "401",
      "401",
      "",
      "",
      "125000",
      "0",
      "",
    ]]);

    expect(txt).toContain("#FLG 001\r\n#VER 8\r\n#DEV XOF\r\n#MECG\r\nCAIS\r\n");
    expect(txt).toContain("CAIS;280826;P-001;401000;Achat & reglement, urgent;125000;D;");
    expect(txt.endsWith("\r\n")).toBe(true);
  });

  it("conserve les pièces et comptes auxiliaires avec ou sans tiers", () => {
    const txt = buildSageTxt(2026, "ACH", [
      [
        "2026-08-26",
        "ACH",
        "LIV-2026-000001",
        "Achat cacao - Koffi Konan",
        "401",
        "4011ABOUDE001",
        "membre-17",
        "membre",
        "285000",
        "0",
       "MEM-000017",
      ],
      [
        "2026-08-26",
        "ACH",
        "LIV-2026-000001",
        "Achat cacao - Koffi Konan",
        "601",
        "601000",
        "",
        "",
        "0",
        "285000",
       "",
      ],
    ]);

    const dataLines = txt.split("\r\n").slice(5, -1);
    expect(dataLines).toEqual([
      "ACH;260826;LIV-2026-000001;4011ABOUDE001;Achat cacao - Koffi Konan;285000;D;MEM-000017",
      "ACH;260826;LIV-2026-000001;601000;Achat cacao - Koffi Konan;285000;C;",
    ]);
    expect(dataLines.every((line) => line.split(";").length === 8)).toBe(true);
    expect(dataLines.some((line) => line.includes("membre-17"))).toBe(false);
  });

  it("normalise les libellés pour l'encodage ASCII Sage et garde les totaux équilibrés", () => {
    const txt = buildSageTxt(2026, "CAIS", [
      ["2026-08-28", "CAIS", "PAI-001", "Chèque encaissé — Soro n°1212", "401", "401000", "", "", "1000000", "0", "FOU-000121"],
      ["2026-08-28", "CAIS", "PAI-001", "Chèque encaissé — Soro n°1212", "521", "521000", "", "", "0", "1000000", ""],
      ["2026-08-29", "CAIS", "", "Frais d'achat œufs", "601", "601000", "", "", "125000", "0", ""],
      ["2026-08-29", "CAIS", "", "Frais d'achat œufs", "571", "571000", "", "", "0", "125000", ""],
    ]);

    const dataLines = txt.split("\r\n").slice(5, -1);
    const totals = dataLines.reduce(
      (result, line) => {
        const fields = line.split(";");
        expect(fields).toHaveLength(8);
        expect(line).toMatch(/^[\x20-\x7E]*$/);
        if (fields[6] === "D") result.debit += Number(fields[5]);
        if (fields[6] === "C") result.credit += Number(fields[5]);
        return result;
      },
      { debit: 0, credit: 0 },
    );

    expect(dataLines).toContain("CAIS;280826;PAI-001;401000;Cheque encaisse - Soro n 1212;1000000;D;FOU-000121");
    expect(dataLines).toContain("CAIS;290826;;601000;Frais d'achat oeufs;125000;D;");
    expect(totals).toEqual({ debit: 1125000, credit: 1125000 });
  });

  it("génère un compte tiers stable uniquement pour 401000 et 411000", () => {
    expect(determinerCompteCollectifSage("40100000")).toBe("401000");
    expect(determinerCompteCollectifSage("40910000")).toBe("409100");
    expect(determinerCompteCollectifSage("41110000")).toBe("411000");
    expect(determinerCompteTiersSage({
      compte: "401",
      tiersType: "membre",
      tiersId: 17,
    })).toBe("MEM-000017");
    expect(determinerCompteTiersSage({
      compte: "411000",
      tiersType: "exportateur",
      tiersId: 8,
    })).toBe("CLI-000008");
    expect(determinerCompteTiersSage({
      compte: "40100000",
      tiersType: "membre",
      tiersId: 25,
    })).toBe("MEM-000025");
    expect(determinerCompteTiersSage({
      compte: "601000",
      tiersType: "membre",
      tiersId: 17,
    })).toBe("");
    expect(determinerCompteTiersSage({
      compte: "401000",
      tiersType: null,
      tiersId: null,
    })).toBe("");
  });
});