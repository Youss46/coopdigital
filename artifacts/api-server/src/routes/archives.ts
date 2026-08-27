import { Router, type Request, type Response, type NextFunction } from "express";
import {
  handleListArchives,
  handleGetArchive,
  handleArchiveLivraisons,
  handleArchiveMembres,
  handleComparerCampagnes,
  handleVerifierIntegrite,
  handleArchiverCampagne,
} from "../controllers/archivesController";

const router = Router();

function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ erreur: "Permissions insuffisantes" });
      return;
    }
    next();
  };
}

const ROLES_ARCHIVES = ["pca", "directeur", "auditeur"];

router.get("/archives",                        requireRole(ROLES_ARCHIVES), handleListArchives);
router.get("/archives/comparer",               requireRole(ROLES_ARCHIVES), handleComparerCampagnes);
router.get("/archives/:campagneId",            requireRole(ROLES_ARCHIVES), handleGetArchive);
router.get("/archives/:campagneId/livraisons", requireRole(ROLES_ARCHIVES), handleArchiveLivraisons);
router.get("/archives/:campagneId/membres",    requireRole(ROLES_ARCHIVES), handleArchiveMembres);
router.get("/archives/:campagneId/integrite",  requireRole(["pca","directeur","auditeur"]), handleVerifierIntegrite);
router.post("/archives/:campagneId/archiver",  requireRole(["pca","directeur"]), handleArchiverCampagne);

export default router;
