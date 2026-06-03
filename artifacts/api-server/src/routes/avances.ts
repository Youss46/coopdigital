import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  listAvances,
  createAvance,
  getAvancesEncours,
  rembourserAvance,
} from "../controllers/avancesController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/avances/encours", getAvancesEncours);
router.get("/avances", listAvances);
router.post("/avances", createAvance);
router.put("/avances/:id/rembourser", rembourserAvance);

export default router;
