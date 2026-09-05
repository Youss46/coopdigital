import { describe, expect, it } from "vitest";
import { buildSageTxt } from "../controllers/comptabiliteController.js";

describe("buildSageTxt", () => {
  it("génère l'en-tête Sage et les lignes délimitées avec une date française", () => {
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
    ]]);

    expect(txt).toContain("#FLG 001\r\n#VER 8\r\n#DEV XOF\r\n#MECG\r\nCAIS\r\n");
    expect(txt).toContain("28/08/2026;CAIS;401000;P-001;Achat & reglement, urgent;125000;0");
    expect(txt.endsWith("\r\n")).toBe(true);
  });
});