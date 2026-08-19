import { type Request, type Response, type NextFunction } from "express";
import { verifierLicenceActive } from "../services/licenceService.js";

// La licence est une restriction de gestion et de pilotage financier.
// Les rôles opérationnels doivent pouvoir continuer à travailler lorsque
// la coopérative doit régulariser sa licence.
const ROLES_SOUMIS_A_LA_LICENCE = new Set(["pca", "directeur", "comptable"]);

export async function tenantGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user || !req.user.cooperativeId) {
    next();
    return;
  }

  // Les rôles opérationnels (magasinier, auditeur, délégué, terrain, etc.)
  // ne doivent pas être bloqués par l'état de la licence.
  if (!ROLES_SOUMIS_A_LA_LICENCE.has(req.user.role)) {
    next();
    return;
  }

  try {
    const check = await verifierLicenceActive(req.user.cooperativeId);

    if (!check.valide) {
      const code = check.statut === "supprimee" ? 410 : 402;
      res.status(code).json({
        erreur: check.messageInvalide,
        statut: check.statut,
        code: "LICENCE_INVALIDE",
      });
      return;
    }

    if (check.joursRestants !== null) {
      res.setHeader("X-Licence-Days-Left", String(check.joursRestants));
    }
    if (check.statut === "trial" && check.joursRestants !== null) {
      res.setHeader("X-Trial-Days-Left", String(check.joursRestants));
    }

    next();
  } catch (err) {
    req.log.error({ err }, "Erreur tenantGuard");
    next();
  }
}
