import { describe, expect, it } from "vitest";
import { calculerStatutEcartControle } from "../services/expeditionsService.js";

describe("règle de contrôle du chargement", () => {
  it("classe un contrôle dans les seuils acceptables", () => {
    expect(calculerStatutEcartControle(1000, 1000, 2)).toBe("conforme");
    expect(calculerStatutEcartControle(1030, 1000, 2)).toBe("a_justifier");
  });

  it("bloque un écart trop important ou un poids attendu absent", () => {
    expect(calculerStatutEcartControle(1050, 1000, 2)).toBe("bloque");
    expect(calculerStatutEcartControle(0, 0, 2)).toBe("bloque");
  });

  it("considère une expédition sans contrôle comme non contrôlée", () => {
    expect(calculerStatutEcartControle(null, 1000, 2)).toBe("non_controle");
  });
});