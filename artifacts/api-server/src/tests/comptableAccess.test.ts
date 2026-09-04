import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  denyComptableRestrictedModules,
  hasPermission,
} from "../middlewares/permissions";

function runAccessCheck(path: string, role: string, method = "GET") {
  const req = { path, originalUrl: path, method, user: { role } } as Request;
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

  it("autorise la consultation des frais d'exportation à régler", () => {
    const { res, next } = runAccessCheck("/expeditions/frais-transport-a-regler", "comptable");

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("autorise le règlement financier des frais de transport sans ouvrir les expéditions", () => {
    const { res, next } = runAccessCheck(
      "/expeditions/42/reglement-frais-transport",
      "comptable",
      "POST",
    );

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("continue de refuser les autres routes d'expédition au comptable", () => {
    const { res, next } = runAccessCheck("/expeditions/42", "comptable");

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("autorise la page des délégués de localités sans autoriser leur création", () => {
    const { res, next } = runAccessCheck("/delegues-localites/commissions/recap", "comptable");

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(hasPermission("comptable", "membres", "lire")).toBe(true);
    expect(hasPermission("comptable", "membres", "creer")).toBe(false);
    expect(hasPermission("comptable", "avances", "lire")).toBe(true);
    expect(hasPermission("comptable", "avances", "octroyer")).toBe(true);
    expect(hasPermission("comptable", "avances", "rembourser")).toBe(true);
    expect(hasPermission("comptable", "commissions_delegues", "lire")).toBe(true);
    expect(hasPermission("comptable", "commissions_delegues", "gerer_taux")).toBe(true);
    expect(hasPermission("comptable", "commissions_delegues", "payer")).toBe(true);
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

  it("autorise toutes les actions de la page Vente cacao sans créer un exportateur", () => {
    expect(hasPermission("comptable", "ventes", "lire")).toBe(true);
    expect(hasPermission("comptable", "ventes", "creer")).toBe(true);
    expect(hasPermission("comptable", "ventes", "encaisser")).toBe(true);
    expect(hasPermission("comptable", "exportateurs", "creer")).toBe(false);
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
    expect(hasPermission("comptable", "avances", "octroyer")).toBe(true);
  });

  it("autorise toutes les actions du comptable sur les équipements", () => {
    const { next } = runAccessCheck("/equipements", "comptable");

    expect(next).toHaveBeenCalledOnce();
    expect(hasPermission("comptable", "equipements", "lire")).toBe(true);
    expect(hasPermission("comptable", "equipements", "creer")).toBe(true);
    expect(hasPermission("comptable", "equipements", "modifier")).toBe(true);
    expect(hasPermission("comptable", "equipements", "supprimer")).toBe(true);
    expect(hasPermission("comptable", "equipements", "generer_dotations")).toBe(true);
    expect(hasPermission("comptable", "equipements", "maintenance")).toBe(true);
  });

  it("autorise toutes les actions du comptable sur les salaires", () => {
    const actions = [
      "lire",
      "creer_personnel",
      "modifier_personnel",
      "supprimer_personnel",
      "generer_bulletins",
      "valider_bulletins",
      "payer_bulletins",
      "supprimer_bulletin",
      "gerer_avances",
    ];

    for (const action of actions) {
      expect(hasPermission("comptable", "salaires", action)).toBe(true);
    }
  });

  it("autorise la suppression des missions aux rôles de supervision terrain", () => {
    for (const role of ["responsable_tracabilite", "pca", "directeur"]) {
      expect(hasPermission(role, "missions", "supprimer")).toBe(true);
    }
    expect(hasPermission("agent_terrain", "missions", "supprimer")).toBe(false);
  });
});