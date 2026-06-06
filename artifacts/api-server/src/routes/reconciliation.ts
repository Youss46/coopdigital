import { Router } from "express";
import { checkPermission } from "../middlewares/permissions.js";
import * as ctrl from "../controllers/reconciliationController.js";

const router = Router();

router.post(
  "/reconciliation/preview",
  checkPermission("reconciliation", "importer"),
  ctrl.upload.single("fichier"),
  ctrl.postPreview,
);

router.post(
  "/reconciliation/importer",
  checkPermission("reconciliation", "importer"),
  ctrl.upload.single("fichier"),
  ctrl.postImporter,
);

router.get(
  "/reconciliation/releves",
  checkPermission("reconciliation", "voir"),
  ctrl.getReleves,
);

router.get(
  "/reconciliation/ecritures",
  checkPermission("reconciliation", "voir"),
  ctrl.getEcritures,
);

router.get(
  "/reconciliation/:id",
  checkPermission("reconciliation", "voir"),
  ctrl.getReleve,
);

router.post(
  "/reconciliation/:id/auto",
  checkPermission("reconciliation", "reconcilier"),
  ctrl.postAuto,
);

router.put(
  "/reconciliation/lignes/:id/reconcilier",
  checkPermission("reconciliation", "reconcilier"),
  ctrl.putReconcilier,
);

router.put(
  "/reconciliation/lignes/:id/ignorer",
  checkPermission("reconciliation", "reconcilier"),
  ctrl.putIgnorer,
);

router.get(
  "/reconciliation/:id/rapport-pdf",
  checkPermission("reconciliation", "voir"),
  ctrl.getRapportPdf,
);

export default router;
