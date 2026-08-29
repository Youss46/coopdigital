import { type Request, type Response, type NextFunction } from "express";
import { featureKeyForPath, featureModeAllowsMethod, getCooperativeFeatureConfig } from "../services/cooperativeFeaturesService.js";

export async function featureGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { next(); return; }

  const pathname = req.originalUrl.replace(/^\/api/, "").split("?")[0] ?? "";
  // Ce endpoint doit rester consultable pour construire l'interface, même
  // lorsque le module Paramètres est masqué.
  if (pathname === "/config/features") { next(); return; }

  const featureKey = featureKeyForPath(pathname);
  if (!featureKey) { next(); return; }

  try {
    const config = await getCooperativeFeatureConfig(cooperativeId);
    const feature = config?.find((candidate) => candidate.key === featureKey);
    if (!feature || feature.mode === "active") { next(); return; }
    if (featureModeAllowsMethod(feature.mode, req.method)) { next(); return; }
    res.status(403).json({
      erreur: feature.mode === "lecture_seule"
        ? "Cette fonctionnalité est disponible en lecture seule"
        : "Cette fonctionnalité est désactivée pour votre coopérative",
      code: "FEATURE_DISABLED",
      featureKey,
      mode: feature.mode,
    });
  } catch (err) {
    req.log.error({ err, cooperativeId, featureKey }, "Erreur contrôle fonctionnalité");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}