import { Router, type IRouter } from "express";
import {
  handleListChargesDiverses,
  handleCreateChargeDiverses,
  handleGetChargeDiverses,
  handleUpdateChargeDiverses,
  handleValiderChargeDiverses,
  handleDeleteChargeDiverses,
  handleStatsChargesDiverses,
} from "../controllers/chargesDiversesController";

const router: IRouter = Router();

router.get("/charges-diverses/stats",  handleStatsChargesDiverses);
router.get("/charges-diverses",        handleListChargesDiverses);
router.post("/charges-diverses",       handleCreateChargeDiverses);
router.get("/charges-diverses/:id",    handleGetChargeDiverses);
router.put("/charges-diverses/:id",    handleUpdateChargeDiverses);
router.put("/charges-diverses/:id/valider", handleValiderChargeDiverses);
router.delete("/charges-diverses/:id", handleDeleteChargeDiverses);

export default router;
