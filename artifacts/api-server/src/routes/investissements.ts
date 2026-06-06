import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  tableauBord,
  listeProjets,
  detailProjet,
  creerProjet,
  modifierProjet,
  supprimerProjet,
  ajouterDepenseCtrl,
} from "../controllers/investissementsController";

const router = Router();

router.get("/investissements/tableau-bord",  checkPermission("investissements", "voir"),    tableauBord);
router.get("/investissements/projets",       checkPermission("investissements", "voir"),    listeProjets);
router.post("/investissements/projets",      checkPermission("investissements", "creer"),   creerProjet);
router.get("/investissements/projets/:id",   checkPermission("investissements", "voir"),    detailProjet);
router.put("/investissements/projets/:id",   checkPermission("investissements", "creer"),   modifierProjet);
router.delete("/investissements/projets/:id",checkPermission("investissements", "creer"),   supprimerProjet);
router.post("/investissements/:id/depense",  checkPermission("investissements", "depenser"),ajouterDepenseCtrl);

export default router;
