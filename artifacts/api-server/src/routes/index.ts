import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import membresRouter from "./membres";
import avancesRouter from "./avances";
import livraisonsRouter from "./livraisons";
import dashboardRouter from "./dashboard";
import lotsRouter from "./lots";
import stocksRouter from "./stocks";
import exportateursRouter from "./exportateurs";
import communicationRouter from "./communication";
import comptabiliteRouter from "./comptabilite";
import etatsFinanciersRouter from "./etatsFinanciers";
import rapportsRouter from "./rapports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(membresRouter);
router.use(avancesRouter);
router.use(livraisonsRouter);
router.use(dashboardRouter);
router.use(lotsRouter);
router.use(stocksRouter);
router.use(exportateursRouter);
router.use(communicationRouter);
router.use(comptabiliteRouter);
router.use(etatsFinanciersRouter);
router.use(rapportsRouter);

export default router;
