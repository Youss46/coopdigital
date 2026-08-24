import { Router, type IRouter } from "express";
import { authMiddleware } from "../middlewares/auth";
import { checkPermission } from "../middlewares/permissions";
import { listLivraisons, getLivraisonsNonLotees } from "../controllers/livraisonsController";

const router: IRouter = Router();

router.use(authMiddleware);

router.get("/livraisons/non-lotees", checkPermission("livraisons", "lire"), getLivraisonsNonLotees);
router.get("/livraisons", checkPermission("livraisons", "lire"), listLivraisons);
// Une livraison ne peut plus être créée depuis ce module. La création passe
// exclusivement par les parcours de pesée dédiés (terrain/session).
router.post("/livraisons", (_req, res) => {
  res.status(403).json({
    erreur: "Création interdite depuis la page Livraisons. Utilisez le parcours de pesée dédié.",
  });
});

export default router;
