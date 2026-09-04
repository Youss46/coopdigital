import { Router } from "express";
import { checkPermission } from "../middlewares/permissions";
import { peseurCentralOnly } from "../middlewares/peseurCentralOnly";
import {
  handleListExpeditions,
  handleListFraisTransportARegler,
  handleGetStats,
  handleGetExpedition,
  handleCreateExpedition,
  handleChangerStatut,
  handleConfirmerReception,
  handleReglerFraisTransport,
  handleRapportEudr,
  handleGetFlotteVehicules,
  handleGetFlotteChauffeurs,
  handleGetLotsDisponibles,
  handleRattacherLot,
  handleDetacherLot,
  handleBonLivraison,
  handleBordereauTransport,
  handleRapportEudrPdf,
  handleProchainNumero,
  handleConstatReception,
  handleListExpeditionControls,
  handleStartExpeditionControl,
  handleGetExpeditionControl,
  handleAddExpeditionControlLine,
  handleDeleteExpeditionControlLine,
  handleFinishExpeditionControl,
  handleCancelExpeditionControl,
} from "../controllers/expeditionsController";

const router = Router();

router.get(
  "/expeditions",
  checkPermission("expeditions", "lire"),
  handleListExpeditions,
);

router.get(
  "/expeditions/stats",
  checkPermission("expeditions", "lire"),
  handleGetStats,
);

router.get(
  "/expeditions/frais-transport-a-regler",
  checkPermission("paiements", "lire"),
  handleListFraisTransportARegler,
);

router.get(
  "/expeditions/prochain-numero",
  checkPermission("expeditions", "lire"),
  handleProchainNumero,
);

router.get(
  "/expeditions/flotte/vehicules",
  checkPermission("expeditions", "lire"),
  handleGetFlotteVehicules,
);

router.get(
  "/expeditions/flotte/chauffeurs",
  checkPermission("expeditions", "lire"),
  handleGetFlotteChauffeurs,
);

router.post(
  "/expeditions",
  checkPermission("expeditions", "creer"),
  handleCreateExpedition,
);

router.get(
  "/expeditions/:id/lots-disponibles",
  checkPermission("expeditions", "lire"),
  handleGetLotsDisponibles,
);

router.post(
  "/expeditions/:id/lots",
  checkPermission("expeditions", "modifier"),
  handleRattacherLot,
);

router.get(
  "/expeditions/:id/pesee-controle",
  checkPermission("expeditions", "lire"),
  handleListExpeditionControls,
);

router.post(
  "/expeditions/:id/pesee-controle",
  checkPermission("expeditions", "modifier"),
  peseurCentralOnly,
  handleStartExpeditionControl,
);

router.get(
  "/expeditions/:id/pesee-controle/:sessionId",
  checkPermission("expeditions", "lire"),
  handleGetExpeditionControl,
);

router.post(
  "/expeditions/:id/pesee-controle/:sessionId/lignes",
  checkPermission("expeditions", "modifier"),
  peseurCentralOnly,
  handleAddExpeditionControlLine,
);

router.delete(
  "/expeditions/:id/pesee-controle/:sessionId/lignes/:ligneId",
  checkPermission("expeditions", "modifier"),
  peseurCentralOnly,
  handleDeleteExpeditionControlLine,
);

router.put(
  "/expeditions/:id/pesee-controle/:sessionId/terminer",
  checkPermission("expeditions", "modifier"),
  peseurCentralOnly,
  handleFinishExpeditionControl,
);

router.put(
  "/expeditions/:id/pesee-controle/:sessionId/annuler",
  checkPermission("expeditions", "modifier"),
  peseurCentralOnly,
  handleCancelExpeditionControl,
);

router.delete(
  "/expeditions/:id/lots/:lotRowId",
  checkPermission("expeditions", "modifier"),
  handleDetacherLot,
);

router.get(
  "/expeditions/:id",
  checkPermission("expeditions", "lire"),
  handleGetExpedition,
);

router.put(
  "/expeditions/:id/statut",
  checkPermission("expeditions", "modifier"),
  handleChangerStatut,
);

router.put(
  "/expeditions/:id/reception",
  checkPermission("expeditions", "modifier"),
  handleConfirmerReception,
);

router.post(
  "/expeditions/:id/reglement-frais-transport",
  checkPermission("paiements", "valider"),
  handleReglerFraisTransport,
);

router.get(
  "/expeditions/:id/eudr",
  checkPermission("expeditions", "rapport_eudr"),
  handleRapportEudr,
);

router.get(
  "/expeditions/:id/eudr/pdf",
  checkPermission("expeditions", "lire"),
  handleRapportEudrPdf,
);

router.get(
  "/expeditions/:id/bon-livraison",
  checkPermission("expeditions", "lire"),
  handleBonLivraison,
);

router.get(
  "/expeditions/:id/bordereau-transport",
  checkPermission("expeditions", "lire"),
  handleBordereauTransport,
);

router.get(
  "/expeditions/:id/constat-reception",
  checkPermission("expeditions", "lire"),
  handleConstatReception,
);

export default router;
