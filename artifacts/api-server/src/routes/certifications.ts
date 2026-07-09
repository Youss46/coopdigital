import { Router, type Request, type Response, type NextFunction } from "express";
import {
  handleListCertifications,
  handleGetStatsCertifications,
  handleGetDashboardCertifications,
  handleGetCertification,
  handleGetAuditsCertification,
  handleCreateCertification,
  handleUpdateCertification,
  handleDeleteCertification,
  handleCreateAudit,
  handleListMembresCertification,
  handleGetMembreCertification,
  handleEvaluerMembre,
  handleGetCriteres,
  handleRapportPdf,
} from "../controllers/certificationsController";
import {
  handleListMissionsEnquete,
  handleCreateMissionEnquete,
  handleGetMissionEnquete,
  handleUpdateStatut,
  handleValiderMembre,
  handleDeleteMissionEnquete,
  handleGetAgentsDisponibles,
  handleRapportPdfEnquete,
} from "../controllers/missionsEnqueteController";

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

const ROLES_READ  = ["pca", "directeur", "responsable_tracabilite"];
const ROLES_WRITE = ["pca", "directeur", "responsable_tracabilite"];

// Certifications coopérative
router.get("/certifications/criteres",      requireRole(ROLES_READ),  handleGetCriteres);
router.get("/certifications/stats",         requireRole(ROLES_READ),  handleGetStatsCertifications);
router.get("/certifications/dashboard",     requireRole(ROLES_READ),  handleGetDashboardCertifications);
router.get("/certifications",               requireRole(ROLES_READ),  handleListCertifications);
router.get("/certifications/:id",           requireRole(ROLES_READ),  handleGetCertification);
router.post("/certifications",              requireRole(ROLES_WRITE), handleCreateCertification);
router.put("/certifications/:id",           requireRole(ROLES_WRITE), handleUpdateCertification);
router.delete("/certifications/:id",        requireRole(["pca", "directeur"]), handleDeleteCertification);

// Audits
router.get("/certifications/:id/audits",    requireRole(ROLES_READ),  handleGetAuditsCertification);
router.post("/certifications/:id/audits",   requireRole(ROLES_WRITE), handleCreateAudit);

// PDF rapport
router.get("/certifications/:id/rapport-pdf", requireRole(ROLES_READ), handleRapportPdf);

// Conformité membres
router.get("/certifications/:id/membres",           requireRole(ROLES_READ),  handleListMembresCertification);
router.get("/certifications/:id/membres/:membreId", requireRole(ROLES_READ),  handleGetMembreCertification);
router.post("/certifications/:id/membres",          requireRole(ROLES_WRITE), handleEvaluerMembre);

// Missions d'enquête
router.get("/enquetes/agents",                                requireRole(ROLES_READ),  handleGetAgentsDisponibles);
router.get("/enquetes",                                       requireRole(ROLES_READ),  handleListMissionsEnquete);
router.post("/enquetes",                                      requireRole(ROLES_WRITE), handleCreateMissionEnquete);
router.get("/enquetes/:id",                                   requireRole(ROLES_READ),  handleGetMissionEnquete);
router.patch("/enquetes/:id/statut",                          requireRole(ROLES_WRITE), handleUpdateStatut);
router.delete("/enquetes/:id",                                requireRole(["pca", "directeur"]), handleDeleteMissionEnquete);
router.post("/enquetes/:id/membres/:membreId/valider",        requireRole(ROLES_WRITE), handleValiderMembre);
router.get("/enquetes/:id/rapport.pdf",                       requireRole(ROLES_READ),  handleRapportPdfEnquete);

export default router;
