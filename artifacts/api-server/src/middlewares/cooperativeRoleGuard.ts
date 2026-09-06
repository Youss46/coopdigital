import { type NextFunction, type Request, type Response } from "express";
import { assertRoleActive, CooperativeRoleDisabledError } from "../services/cooperativeRolesService.js";
import { ROLE_DISABLED_CODE, ROLE_DISABLED_MESSAGE } from "../lib/accountAccess.js";

export { ROLE_DISABLED_CODE, ROLE_DISABLED_MESSAGE } from "../lib/accountAccess.js";

export async function cooperativeRoleGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const role = req.user?.role;
  if (!cooperativeId || !role) {
    next();
    return;
  }

  try {
    await assertRoleActive(cooperativeId, role);
    next();
  } catch (error) {
    if (error instanceof CooperativeRoleDisabledError) {
      res.status(403).json({ code: ROLE_DISABLED_CODE, erreur: ROLE_DISABLED_MESSAGE });
      return;
    }
    req.log.error({ err: error }, "Erreur de vérification du rôle coopératif");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}