import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import { listerFormationsRse, creerFormationRse, supprimerFormationRse } from "../controllers/formationsRseController";

const router = Router();

router.get(   "/formations-rse",     checkPermission("formations_rse", "voir"),    listerFormationsRse);
router.post(  "/formations-rse",     checkPermission("formations_rse", "creer"),   creerFormationRse);
router.delete("/formations-rse/:id", checkPermission("formations_rse", "creer"),   supprimerFormationRse);

export default router;
