import { describe, expect, it } from "vitest";
import { hasPermission } from "../middlewares/permissions.js";
import { inclusiveDays } from "../controllers/ressourcesHumainesController.js";

describe("module RH", () => {
  it("calcule les jours de congé sur une période inclusive", () => {
    expect(inclusiveDays("2026-08-01", "2026-08-01")).toBe(1);
    expect(inclusiveDays("2026-08-01", "2026-08-05")).toBe(5);
  });

  it("sépare les responsabilités RH de la paie", () => {
    expect(hasPermission("responsable_rh", "rh", "lire")).toBe(true);
    expect(hasPermission("responsable_rh", "rh", "gerer_contrats")).toBe(true);
    expect(hasPermission("responsable_rh", "salaires", "generer_bulletins")).toBe(false);
    expect(hasPermission("comptable", "rh", "lire")).toBe(true);
    expect(hasPermission("comptable", "rh", "modifier_dossier")).toBe(false);
    expect(hasPermission("auditeur", "rh", "lire")).toBe(true);
    expect(hasPermission("auditeur", "rh", "gerer_documents")).toBe(false);
  });
});