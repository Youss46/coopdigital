import { useAuth } from "@/contexts/AuthContext";
import { PERMISSIONS } from "@/config/permissions";

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
  const role = utilisateur?.role ?? "";
  const allowed = PERMISSIONS[module]?.[action] ?? [];
  return allowed.includes(role);
}
