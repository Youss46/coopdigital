import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  denyComptableRestrictedModules,
  hasPermission,
} from "../middlewares/permissions";

function runAccessCheck(path: string, role: string) {
  const req = { path, user: { role } } as Request;
  const res = Object.create(null) as Response;
  res.status = vi.fn().mockReturnThis();
  res.json = vi.fn().mockReturnThis();
  const next = vi.fn();

  denyComptableRestrictedModules(req, res, next);
  return { res, next };
}

describe("périmètre du comptable", () => {
  it("refuse les modules opérationnels exclus", () => {
    const { res, next } = runAccessCheck("/transport/vehicules", "comptable");

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("refuse aussi les routes de sessions de pesée", () => {
    const { res, next } = runAccessCheck("/pesee/sessions/42", "comptable");

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("refuse les routes des délégués de localité", () => {
    const { res, next } = runAccessCheck("/delegues-localites/commissions/recap", "comptable");

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("laisse les autres rôles accéder aux modules exclus", () => {
    const { res, next } = runAccessCheck("/transport/vehicules", "magasinier");

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("conserve l'accès aux permissions comptables", () => {
    expect(hasPermission("comptable", "comptabilite", "lire")).toBe(true);
    expect(hasPermission("comptable", "fiscalite", "generer")).toBe(true);
    expect(hasPermission("comptable", "stocks", "lire")).toBe(false);
    expect(hasPermission("comptable", "tracabilite", "lire")).toBe(false);
  });

  it("autorise les opérations de trésorerie sans autoriser la création des comptes", () => {
    for (const [module, actionLecture, actionsEcriture] of [
      ["caisse", "voir", ["ouvrir_session", "enregistrer_mvt", "fermer_session"]],
      ["banque", "voir", ["enregistrer_mvt", "rapprocher"]],
      ["mobile_marchand", "voir", ["enregistrer_mvt"]],
      ["cheques", "lire", ["creer", "modifier", "encaisser", "rejeter", "annuler"]],
    ] as const) {
      expect(hasPermission("comptable", module, actionLecture)).toBe(true);
      for (const action of actionsEcriture) expect(hasPermission("comptable", module, action)).toBe(true);
    }

    expect(hasPermission("comptable", "caisse", "creer_caisse")).toBe(false);
    expect(hasPermission("comptable", "banque", "creer")).toBe(false);
    expect(hasPermission("comptable", "mobile_marchand", "creer")).toBe(false);
  });
});