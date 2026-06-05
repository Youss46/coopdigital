import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  listDevises,
  getTauxActuels,
  createTaux,
  getHistoriqueTaux,
  getTauxActuelDevise,
  convertirMontant,
  getRapportGainPerte,
} from "../controllers/devisesController";

const router = Router();

// Devises de référence
router.get("/devises", checkPermission("devises", "voir_taux"), listDevises);

// Taux actuels (toutes devises)
router.get("/devises/taux", checkPermission("devises", "voir_taux"), getTauxActuels);

// Saisir un nouveau taux
router.post("/devises/taux", checkPermission("devises", "modifier_taux"), createTaux);

// Historique 12 mois pour une devise
router.get("/devises/taux/historique/:devise", checkPermission("devises", "voir_taux"), getHistoriqueTaux);

// Taux actuel d'une devise spécifique
router.get("/devises/taux/actuel/:devise", checkPermission("devises", "voir_taux"), getTauxActuelDevise);

// Convertir un montant (POST pour éviter params sensibles en URL)
router.post("/devises/convertir", checkPermission("devises", "voir_taux"), convertirMontant);

// Rapport gains/pertes de change
router.get("/devises/gain-perte", checkPermission("devises", "rapport_change"), getRapportGainPerte);

export default router;
