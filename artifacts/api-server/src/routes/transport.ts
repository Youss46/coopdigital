import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
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

router.get("/transport/rapport-campagne",       authMiddleware, handleRapportCampagne);
router.get("/transport/rapport-vehicule/:id",   authMiddleware, handleRapportVehicule);

export default router;
