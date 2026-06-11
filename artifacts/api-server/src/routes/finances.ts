import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import { getTableauBordFinancier } from "../controllers/financesTableauBordController";

const router = Router();

router.get(
  "/finances/tableau-bord",
  checkPermission("budget", "voir"),
  getTableauBordFinancier,
);

export default router;
