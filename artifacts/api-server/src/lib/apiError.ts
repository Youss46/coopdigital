/**
 * Formate le message d'erreur renvoyé au client.
 *
 * - En développement  : retourne err.message tel quel (aide au debug).
 * - En production     : retourne le fallback générique pour éviter de fuiter
 *                       des détails internes (requêtes SQL, stack traces…).
 *
 * Utilisation dans un catch :
 *   res.status(500).json({ erreur: apiError(err) });
 *   res.status(500).json({ erreur: apiError(err, "Erreur création livraison") });
 */
export function apiError(err: unknown, fallback = "Erreur interne du serveur"): string {
  if (process.env.NODE_ENV !== "production") {
    return err instanceof Error ? err.message : String(err);
  }
  return fallback;
}
