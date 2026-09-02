import { describe, expect, it } from "vitest";
import { hasPermission } from "../middlewares/permissions.js";

describe("droits des bons de réception", () => {
  it("autorise le Magasinier sans lui ouvrir les entrées de stock génériques", () => {
    expect(hasPermission("magasinier", "bons_reception", "creer")).toBe(true);
    expect(hasPermission("magasinier", "bons_reception", "annuler")).toBe(true);
    expect(hasPermission("magasinier", "stocks", "entree")).toBe(false);
  });

  it("conserve la création pour la direction", () => {
    expect(hasPermission("pca", "bons_reception", "creer")).toBe(true);
    expect(hasPermission("directeur", "bons_reception", "creer")).toBe(true);
  });
});