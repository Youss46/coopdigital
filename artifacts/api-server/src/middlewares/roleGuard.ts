export type UserRole =
  | "pca"
  | "directeur"
  | "comptable"
  | "caissier"
  | "magasinier"
  | "responsable_tracabilite"
  | "delegue"
  | "auditeur"
  | "agent_terrain"
  | "peseur"
  | "chauffeur"
  | "responsable_rh";

/**
 * Vérifie si l'utilisateur `requesterRole` a le droit de créer un compte
 * avec le rôle `targetRole`.
 *
 * Règle 1 :
 *   - PCA : peut créer tous les rôles
 *   - Directeur : peut créer tous les rôles SAUF pca
 *   - Autres : aucun droit
 */
export function canCreateUser(requesterRole: string, targetRole: string): boolean {
  if (requesterRole === "pca") return true;
  if (requesterRole === "directeur") return targetRole !== "pca";
  return false;
}

/**
 * Vérifie si l'utilisateur peut réinitialiser le mot de passe du compte cible.
 *
 * Règle :
 *   - PCA : peut réinitialiser tous les comptes SAUF le sien
 *   - Directeur : peut réinitialiser tous les comptes SAUF pca et le sien
 *   - Autres : aucun droit
 */
export function canResetUserPassword(
  requesterRole: string,
  requesterId: number,
  targetUserId: number,
  targetRole: string,
): { allowed: boolean; message?: string } {
  if (requesterRole === "pca") {
    if (requesterId === targetUserId) {
      return { allowed: false, message: "Vous ne pouvez pas réinitialiser votre propre mot de passe ici" };
    }
    return { allowed: true };
  }

  if (requesterRole === "directeur") {
    if (targetRole === "pca") {
      return { allowed: false, message: "Le directeur ne peut pas réinitialiser le mot de passe du PCA" };
    }
    if (requesterId === targetUserId) {
      return { allowed: false, message: "Vous ne pouvez pas réinitialiser votre propre mot de passe ici" };
    }
    return { allowed: true };
  }

  return { allowed: false, message: "Droits insuffisants" };
}

/**
 * Vérifie si l'utilisateur peut supprimer le compte cible.
 *
 * Règle 2 :
 *   - PCA : peut supprimer tous les comptes SAUF le sien
 *   - Directeur : peut supprimer tous les comptes SAUF pca et le sien
 *   - Autres : aucun droit
 */
export function canDeleteUser(
  requesterRole: string,
  requesterId: number,
  targetUserId: number,
  targetRole: string,
): { allowed: boolean; message?: string } {
  if (requesterRole === "pca") {
    if (requesterId === targetUserId) {
      return { allowed: false, message: "Le compte PCA ne peut pas être auto-supprimé" };
    }
    return { allowed: true };
  }

  if (requesterRole === "directeur") {
    if (targetRole === "pca") {
      return { allowed: false, message: "Action non autorisée" };
    }
    if (requesterId === targetUserId) {
      return { allowed: false, message: "Impossible de supprimer son propre compte" };
    }
    return { allowed: true };
  }

  return { allowed: false, message: "Droits insuffisants" };
}
