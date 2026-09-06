import { Router, type IRouter } from "express";
import {
  handleListChargesDiverses,
  handleCreateChargeDiverses,
  handleGetChargeDiverses,
  handleListDettesFournisseurs,
  handleHistoriqueCreditFournisseur,
  handleUpdateChargeDiverses,
  handleValiderChargeDiverses,
  handleReglerChargeFournisseur,
  handleDeleteChargeDiverses,
  handleStatsChargesDiverses,
} from "../controllers/chargesDiversesController";

const router: IRouter = Router();

router.get("/charges-diverses/stats",  handleStatsChargesDiverses);
router.get("/charges-diverses/dettes-fournisseurs", handleListDettesFournisseurs);
router.get("/charges-diverses/fournisseurs/:id/historique", handleHistoriqueCreditFournisseur);
router.get("/charges-diverses",        handleListChargesDiverses);
router.post("/charges-diverses",       handleCreateChargeDiverses);
router.get("/charges-diverses/:id",    handleGetChargeDiverses);
router.put("/charges-diverses/:id",    handleUpdateChargeDiverses);
router.put("/charges-diverses/:id/valider", handleValiderChargeDiverses);
router.post("/charges-diverses/:id/regler", handleReglerChargeFournisseur);
router.delete("/charges-diverses/:id", handleDeleteChargeDiverses);

export default router;
