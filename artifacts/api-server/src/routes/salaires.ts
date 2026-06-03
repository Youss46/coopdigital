import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import {
  listPersonnel,
  getPersonnelById,
  createPersonnel,
  updatePersonnel,
  archiverPersonnel,
  getPersonnelHistorique,
  listComposantes,
  genererBulletins,
  listBulletins,
  getBulletinById,
  validerBulletin,
  payerBulletin,
  deleteBulletin,
  getBulletinPdf,
  listAvancesPersonnel,
  createAvancePersonnel,
  rembourserAvance,
  getRapportMensuel,
  getHistoriqueMasse,
} from "../controllers/salairesController";

const router: IRouter = Router();

router.use(authMiddleware);

// ─── Personnel ────────────────────────────────────────────────────────────────
router.get(
  "/salaires/personnel",
  checkPermission("salaires", "lire"),
  listPersonnel,
);
router.post(
  "/salaires/personnel",
  checkPermission("salaires", "creer_personnel"),
  createPersonnel,
);
router.get(
  "/salaires/personnel/:id/historique",
  checkPermission("salaires", "lire"),
  getPersonnelHistorique,
);
router.get(
  "/salaires/personnel/:id",
  checkPermission("salaires", "lire"),
  getPersonnelById,
);
router.put(
  "/salaires/personnel/:id",
  checkPermission("salaires", "modifier_personnel"),
  updatePersonnel,
);
router.delete(
  "/salaires/personnel/:id",
  checkPermission("salaires", "supprimer_personnel"),
  archiverPersonnel,
);

// ─── Composantes ─────────────────────────────────────────────────────────────
router.get(
  "/salaires/composantes",
  checkPermission("salaires", "lire"),
  listComposantes,
);

// ─── Bulletins ────────────────────────────────────────────────────────────────
router.post(
  "/salaires/bulletins/generer",
  checkPermission("salaires", "generer_bulletins"),
  genererBulletins,
);
router.get(
  "/salaires/bulletins",
  checkPermission("salaires", "lire"),
  listBulletins,
);
router.get(
  "/salaires/bulletins/:id/pdf",
  checkPermission("salaires", "lire"),
  getBulletinPdf,
);
router.get(
  "/salaires/bulletins/:id",
  checkPermission("salaires", "lire"),
  getBulletinById,
);
router.put(
  "/salaires/bulletins/:id/valider",
  checkPermission("salaires", "valider_bulletins"),
  validerBulletin,
);
router.put(
  "/salaires/bulletins/:id/payer",
  checkPermission("salaires", "payer_bulletins"),
  payerBulletin,
);
router.delete(
  "/salaires/bulletins/:id",
  checkPermission("salaires", "supprimer_bulletin"),
  deleteBulletin,
);

// ─── Avances personnel ───────────────────────────────────────────────────────
router.get(
  "/salaires/avances",
  checkPermission("salaires", "lire"),
  listAvancesPersonnel,
);
router.post(
  "/salaires/avances",
  checkPermission("salaires", "gerer_avances"),
  createAvancePersonnel,
);
router.put(
  "/salaires/avances/:id/rembourser",
  checkPermission("salaires", "gerer_avances"),
  rembourserAvance,
);

// ─── Rapports ────────────────────────────────────────────────────────────────
router.get(
  "/salaires/rapport-mensuel/:mois/:annee",
  checkPermission("salaires", "lire"),
  getRapportMensuel,
);
router.get(
  "/salaires/historique-masse",
  checkPermission("salaires", "lire"),
  getHistoriqueMasse,
);

export default router;
