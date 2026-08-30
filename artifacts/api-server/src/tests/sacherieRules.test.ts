import { describe, expect, it } from "vitest";
import {
  calculateSacherieCentralStock,
  calculateSacherieMemberBalance,
} from "../services/sacherieRules.js";

describe("règles de stock Sacherie", () => {
  it("sépare le stock central des sacs déjà détenus par un membre", () => {
    const movements = [
      { type: "entree" as const, sens: null, quantite: 100, membreId: null },
      { type: "attribution" as const, sens: null, quantite: 25, membreId: 7 },
      { type: "retour" as const, sens: null, quantite: 5, membreId: 7 },
      { type: "perte" as const, sens: null, quantite: 2, membreId: 7 },
      { type: "perte" as const, sens: null, quantite: 3, membreId: null },
      { type: "ajustement" as const, sens: "plus" as const, quantite: 4, membreId: null },
    ];

    expect(calculateSacherieCentralStock(movements)).toBe(81);
    expect(calculateSacherieMemberBalance(movements, 7)).toBe(18);
  });

  it("applique les corrections positives et négatives", () => {
    expect(calculateSacherieCentralStock([
      { type: "ajustement", sens: "plus", quantite: 12, membreId: null },
      { type: "ajustement", sens: "moins", quantite: 4, membreId: null },
    ])).toBe(8);
  });
});