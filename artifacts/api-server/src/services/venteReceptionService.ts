/**
 * Quantité vendable après réception : le refus est conservé séparément,
 * mais ne peut jamais rester dans le stock commercial accepté.
 */
export function calculerPoidsAcceptePort(poidsRecuKg: number, poidsRefouleKg: number): number {
  if (!Number.isFinite(poidsRecuKg) || poidsRecuKg < 0) {
    throw new Error("Le poids reçu au port doit être positif ou nul");
  }
  if (!Number.isFinite(poidsRefouleKg) || poidsRefouleKg < 0 || poidsRefouleKg > poidsRecuKg) {
    throw new Error("Le poids refoulé doit être compris entre 0 et le poids reçu au port");
  }
  return Math.max(0, Math.round((poidsRecuKg - poidsRefouleKg) * 100) / 100);
}

export function calculerPoidsDisponibleVente(poidsAccepteKg: number, poidsVenduKg: number): number {
  return Math.max(0, Math.round((poidsAccepteKg - poidsVenduKg) * 100) / 100);
}