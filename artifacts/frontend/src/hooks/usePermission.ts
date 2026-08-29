import { useAuth } from "@/contexts/AuthContext";
import { PERMISSIONS } from "@/config/permissions";
import { useLocation } from "wouter";
import { featureKeyForPath, useFeatureAccess } from "@/hooks/useFeatureAccess";

/**
 * Vérifie si l'utilisateur connecté a la permission d'effectuer une action
 * sur un module donné.
 *
 * Usage :
 *   const peutCreer   = usePermission('membres', 'creer');
 *   const peutExporter = usePermission('membres', 'exporter');
 *
 *   {peutCreer && <button>Créer</button>}
 *
 * Règle UI : les éléments non autorisés sont ABSENTS du DOM.
 */
export function usePermission(module: string, action: string): boolean {
  const { utilisateur } = useAuth();
  const [location] = useLocation();
  const featureKey = featureKeyForPath(location) ?? module;
  const { mode, isFeatureLoading } = useFeatureAccess(featureKey);
  const role = utilisateur?.role ?? "";
  const allowed = PERMISSIONS[module]?.[action] ?? [];
  const isConsultationAction =
    action === "lire" ||
    action.startsWith("voir") ||
    action.startsWith("exporter") ||
    action.startsWith("consulter") ||
    action.startsWith("scanner");

  // Le mode lecture seule conserve les consultations et exports, mais masque
  // les actions qui créent, modifient ou traitent des données.
  return allowed.includes(role) &&
    (isFeatureLoading || mode !== "lecture_seule" || isConsultationAction);
}
