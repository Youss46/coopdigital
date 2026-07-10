import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  getStats, listRecept, createRecept, getRecept,
  listDist, createDist, getDist, validerDist, payerTous, payerMembrePrime,
} from "../controllers/primesController";

const router: IRouter = Router();
router.use(authMiddleware);

router.get("/primes/stats",                       checkPermission("primes", "lire"),    getStats);
router.get("/primes/receptions",                  checkPermission("primes", "lire"),    listRecept);
router.post("/primes/receptions",                 checkPermission("primes", "creer"),   createRecept);
router.get("/primes/receptions/:id",              checkPermission("primes", "lire"),    getRecept);
router.get("/primes/distributions",               checkPermission("primes", "lire"),    listDist);
router.post("/primes/distributions",              checkPermission("primes", "creer"),   createDist);
router.get("/primes/distributions/:id",           checkPermission("primes", "lire"),    getDist);
router.post("/primes/distributions/:id/valider",  checkPermission("primes", "valider"), validerDist);
router.post("/primes/distributions/:id/payer-tous", checkPermission("primes", "payer"), payerTous);
router.patch("/primes/membres/:id/payer",         checkPermission("primes", "payer"),   payerMembrePrime);

export default router;
