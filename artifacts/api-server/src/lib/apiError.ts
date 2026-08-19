/**
 * Formate le message d'erreur renvoyé au client.
 *
 * Dans tous les environnements :
 *   • err.cause.detail  → message humain PG (ex. "Key (bon_reception_id)=(12) already exists")
 *   • err.cause.message → message PG court  (ex. "null value in column \"cooperative_id\"")
 *   • err.message       → uniquement si c'est un message métier (lancé par le code
 *                          applicatif, pas par Drizzle/PG) — reconnaissable au fait
 *                          qu'il ne commence pas par "Failed query:"
 *
 * En production on ne renvoie JAMAIS la requête SQL complète (err.message Drizzle).
 * En développement on la renvoie en dernier recours pour faciliter le debug.
 */

type PgLike = { detail?: string; message?: string; constraint?: string };

const DRIZZLE_QUERY_PREFIX = "Failed query:";

export function apiError(err: unknown, fallback = "Erreur interne du serveur"): string {
  if (!(err instanceof Error)) {
    return process.env.NODE_ENV !== "production" ? String(err) : fallback;
  }

  // Drizzle wraps the PG DatabaseError in err.cause
  const cause = (err as { cause?: PgLike }).cause;
  if (cause) {
    // detail = message PG détaillé humain (contrainte violée, etc.)
    if (cause.detail)  return cause.detail;
    // message = message PG court (toujours utile, ne contient pas de SQL)
    if (cause.message) return cause.message;
  }

  // Si l'erreur est un message métier (pas une requête Drizzle), on le renvoie
  // même en production — c'est du texte que l'app a délibérément levé.
  if (!err.message.startsWith(DRIZZLE_QUERY_PREFIX)) {
    return err.message;
  }

  // Requête SQL Drizzle brute : on la montre seulement en dev
  if (process.env.NODE_ENV !== "production") {
    return err.message;
  }

  return fallback;
}
