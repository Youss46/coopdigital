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
} from "../controllers/missionsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/missions/agents-terrain",  checkPermission("missions", "creer"),   listAgentsTerrain);
router.get("/missions/sans-gps",        checkPermission("missions", "lire"),    membresSansGps);
router.get("/missions",                 checkPermission("missions", "lire"),    listMissions);
router.post("/missions",                checkPermission("missions", "creer"),   createMission);
router.get("/missions/:id",             checkPermission("missions", "lire"),    getMissionById);
router.post("/missions/:id/demarrer",   checkPermission("missions", "executer"), demarrerMission);
router.post("/missions/:id/soumettre",  checkPermission("missions", "executer"), soumettreMission);
router.patch("/missions/:id/membres/:membreId/collecte",
                                        checkPermission("missions", "executer"), collecterGpsMembre);
router.post("/missions/:id/membres/:membreId/valider",
                                        checkPermission("missions", "valider"), validerParcelleMission);
router.post("/missions/:id/membres/:membreId/rejeter",
                                        checkPermission("missions", "valider"), rejeterParcelleMission);

export default router;
