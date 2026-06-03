import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import membresRouter from "./membres";
import avancesRouter from "./avances";
import livraisonsRouter from "./livraisons";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(membresRouter);
router.use(avancesRouter);
router.use(livraisonsRouter);
router.use(dashboardRouter);

export default router;
