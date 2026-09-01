import { describe, expect, it } from "vitest";
import { roleCanOperateSacherie } from "../services/cooperativeSacherieService.js";

describe("configuration du responsable Sacherie", () => {
  it("réserve les opérations au Magasinier dans ce mode", () => {
    expect(roleCanOperateSacherie("magasinier", "magasinier")).toBe(true);
    expect(roleCanOperateSacherie("magasinier", "sacherie")).toBe(false);
  });

  it("réserve les opérations au Responsable Sacherie dans ce mode", () => {
    expect(roleCanOperateSacherie("sacherie", "sacherie")).toBe(true);
    expect(roleCanOperateSacherie("sacherie", "magasinier")).toBe(false);
  });

  it("autorise les deux rôles par défaut et conserve la direction", () => {
    expect(roleCanOperateSacherie("les_deux", "magasinier")).toBe(true);
    expect(roleCanOperateSacherie("les_deux", "sacherie")).toBe(true);
    expect(roleCanOperateSacherie("magasinier", "pca")).toBe(true);
    expect(roleCanOperateSacherie("sacherie", "directeur")).toBe(true);
  });
});