import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listMissions,
  getMissionById,
  createMission,
  demarrerMission,
  soumettreMission,
  collecterGpsMembre,
  validerParcelleMission,
  rejeterParcelleMission,
  membresSansGps,
  listAgentsTerrain,
  exportMissionGeoJSON,
  getMessagesMission,
  sendMessageMission,
  validerMissionComplete,
  rejeterMissionComplete,
  validerToutCollectes,
  rejeterToutCollectes,
} from "../controllers/missionsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/missions/agents-terrain",  checkPermission("missions", "creer"),   listAgentsTerrain);
router.get("/missions/sans-gps",        checkPermission("missions", "lire"),    membresSansGps);
router.get("/missions",                 checkPermission("missions", "lire"),    listMissions);
router.post("/missions",                checkPermission("missions", "creer"),   createMission);
router.get("/missions/:id/export-geojson", checkPermission("missions", "lire"),  exportMissionGeoJSON);
router.get("/missions/:id",             checkPermission("missions", "lire"),    getMissionById);
router.post("/missions/:id/demarrer",   checkPermission("missions", "executer"), demarrerMission);
router.post("/missions/:id/soumettre",  checkPermission("missions", "executer"), soumettreMission);
router.get("/missions/:id/messages",    checkPermission("missions", "lire"),    getMessagesMission);
router.post("/missions/:id/messages",   checkPermission("missions", "lire"),    sendMessageMission);
router.post("/missions/:id/valider-tout",  checkPermission("missions", "valider"), validerToutCollectes);
router.post("/missions/:id/rejeter-tout",  checkPermission("missions", "valider"), rejeterToutCollectes);
router.post("/missions/:id/valider",    checkPermission("missions", "valider"), validerMissionComplete);
router.post("/missions/:id/rejeter",    checkPermission("missions", "valider"), rejeterMissionComplete);
router.patch("/missions/:id/membres/:membreId/collecte",
                                        checkPermission("missions", "executer"), collecterGpsMembre);
router.post("/missions/:id/membres/:membreId/valider",
                                        checkPermission("missions", "valider"), validerParcelleMission);
router.post("/missions/:id/membres/:membreId/rejeter",
                                        checkPermission("missions", "valider"), rejeterParcelleMission);

export default router;
