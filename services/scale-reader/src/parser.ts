/**
 * parser.ts — Décodage des trames de la balance Yaohua A12E
 *
 * Format observé : "wn000005 kg"
 * Variantes possibles : "Gwn000247500 kg", "ST,GS,+000050.0 kg", etc.
 *
 * Stratégie : regex tolérante qui capture la première séquence de chiffres
 * (entiers ou décimaux avec . ou ,) immédiatement suivie de "kg".
 * On ignore tout préfixe variable.
 */

/** Regex défensive : 1 à 8 chiffres, décimal optionnel, suivi de "kg" (case-insensitive) */
const WEIGHT_REGEX = /(\d{1,8}(?:[.,]\d{1,4})?)\s*kg/i;

/**
 * Parse une ligne de la balance et retourne le poids en kg, ou null si non parseable.
 */
export function parseLine(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  const match = WEIGHT_REGEX.exec(cleaned);
  if (!match || !match[1]) return null;

  // Remplacer la virgule décimale par un point (certains indicateurs utilisent ,)
  const numStr = match[1].replace(",", ".");
  const value = parseFloat(numStr);

  if (isNaN(value) || value < 0) return null;

  // Sanity check : une bascule de collecte cacao ne dépasse pas 5000 kg
  if (value > 5000) return null;

  return value;
}
