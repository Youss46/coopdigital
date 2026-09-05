import { Router, type Request, type Response, type NextFunction } from "express";
import { authMiddleware } from "../middlewares/auth";

// Le magasinier gère les bons de carburant de bout en bout, comme le PCA.
const ROLES_APPROBATEUR = ["pca", "directeur", "magasinier"];

// Rôles autorisés à configurer les stations-service
const ROLES_GESTIONNAIRE_STATION = ["pca", "directeur", "admin"];

function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({ erreur: "Permissions insuffisantes — rôle requis : " + roles.join(", ") });
      return;
    }
    next();
  };
}

import {
  handleTraiterDemande,
  handleGetVehicules,
  handleCreateVehicule,
  handleUpdateVehicule,
  handleGetAlertes,
  handleCreateEntretien,
  handleGetEntretiens,
  handleGetChauffeurs,
  handleCreateChauffeur,
  handleUpdateChauffeur,
  handleDeleteChauffeur,
  handleGetMissions,
  handleCreateMission,
  handleDemarrerMission,
  handleTerminerMission,
  handleRapportCampagne,
  handleRapportVehicule,
  handleGetDepensesVehicule,
  handleGetDepensesTransport,
  handleCreateDepenseVehicule,
  handleUpdateDepenseVehicule,
  handleDeleteDepenseVehicule,
  handleGetBonAchatPiecePdf,
  handleEmettreBonAchatPiece,
  handleGetBonsCarburant,
  handleCreateBonCarburant,
  handleGetBonCarburant,
  handleSoumettresBonCarburant,
  handleApprouverBonCarburant,
  handleUtiliserBonCarburant,
  handleAnnulerBonCarburant,
  handleGetBonCarburantPdf,
  handleGetBonsCarburantReglementPdf,
  handleGetStatsCarburant,
  handleGetStationsCarburant,
  handleCreateStationCarburant,
  handleUpdateStationCarburant,
  handleDeleteStationCarburant,
  handleImporterStationsHistorique,
  handleGetHistoriquePreview,
} from "../controllers/transportController";

const router = Router();

router.get("/transport/vehicules",              authMiddleware, handleGetVehicules);
router.post("/transport/vehicules",             authMiddleware, handleCreateVehicule);
router.get("/transport/vehicules/alertes",      authMiddleware, handleGetAlertes);
router.put("/transport/vehicules/:id",          authMiddleware, handleUpdateVehicule);
router.get("/transport/vehicules/:id/entretiens", authMiddleware, handleGetEntretiens);
router.post("/transport/vehicules/:id/entretien", authMiddleware, handleCreateEntretien);

router.get("/transport/chauffeurs",             authMiddleware, handleGetChauffeurs);
router.post("/transport/chauffeurs",            authMiddleware, handleCreateChauffeur);
router.put("/transport/chauffeurs/:id",         authMiddleware, handleUpdateChauffeur);
router.delete("/transport/chauffeurs/:id",      authMiddleware, handleDeleteChauffeur);

router.get("/transport/missions",               authMiddleware, handleGetMissions);
router.post("/transport/missions",              authMiddleware, handleCreateMission);
router.put("/transport/missions/:id/demarrer",  authMiddleware, handleDemarrerMission);
router.put("/transport/missions/:id/terminer",  authMiddleware, handleTerminerMission);

router.get("/transport/depenses",                       authMiddleware, handleGetDepensesTransport);
router.get("/transport/vehicules/:id/depenses",         authMiddleware, handleGetDepensesVehicule);
router.post("/transport/vehicules/:id/depenses",        authMiddleware, handleCreateDepenseVehicule);
router.put("/transport/depenses/:id",                   authMiddleware, handleUpdateDepenseVehicule);
router.delete("/transport/depenses/:id",                authMiddleware, handleDeleteDepenseVehicule);
router.get("/transport/depenses/:id/bon-achat-pdf",      authMiddleware, handleGetBonAchatPiecePdf);
router.post("/transport/depenses/:id/emettre-bon-achat",  authMiddleware, handleEmettreBonAchatPiece);

router.get("/transport/carburant/bons",                     authMiddleware, handleGetBonsCarburant);
router.post("/transport/carburant/bons",                    authMiddleware, handleCreateBonCarburant);
router.get("/transport/carburant/bons/reglement-pdf",       authMiddleware, handleGetBonsCarburantReglementPdf);
router.get("/transport/carburant/bons/:id",                 authMiddleware, handleGetBonCarburant);
router.put("/transport/carburant/bons/:id/traiter",         authMiddleware, handleTraiterDemande);
router.put("/transport/carburant/bons/:id/soumettre",       authMiddleware, handleSoumettresBonCarburant);
router.put("/transport/carburant/bons/:id/approuver",       authMiddleware, requireRole(ROLES_APPROBATEUR), handleApprouverBonCarburant);
router.put("/transport/carburant/bons/:id/utiliser",        authMiddleware, handleUtiliserBonCarburant);
router.put("/transport/carburant/bons/:id/annuler",         authMiddleware, requireRole(ROLES_APPROBATEUR), handleAnnulerBonCarburant);
router.get("/transport/carburant/bons/:id/pdf",             authMiddleware, handleGetBonCarburantPdf);
router.get("/transport/carburant/stats",                    authMiddleware, handleGetStatsCarburant);

router.get("/transport/rapport-campagne",       authMiddleware, handleRapportCampagne);
router.get("/transport/rapport-vehicule/:id",   authMiddleware, handleRapportVehicule);

router.get("/transport/stations-carburant",                      authMiddleware, handleGetStationsCarburant);
router.get("/transport/stations-carburant/historique-preview",   authMiddleware, handleGetHistoriquePreview);
router.post("/transport/stations-carburant",                     authMiddleware, handleCreateStationCarburant);
router.post("/transport/stations-carburant/importer-historique", authMiddleware, handleImporterStationsHistorique);
router.put("/transport/stations-carburant/:id",                  authMiddleware, handleUpdateStationCarburant);
router.delete("/transport/stations-carburant/:id",               authMiddleware, handleDeleteStationCarburant);

export default router;
