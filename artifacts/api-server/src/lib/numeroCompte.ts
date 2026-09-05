/**
 * Représentation des comptes généraux selon le plan comptable utilisé en Côte
 * d'Ivoire : six chiffres, les sous-comptes étant complétés à droite.
 *
 * Les écritures techniques (par exemple ANOUV pour les à-nouveaux) ne sont
 * pas des comptes généraux et sont conservées telles quelles.
 */
export function normaliserNumeroCompte(numero: string): string {
  const valeur = numero.trim();
  if (/^\d{1,6}$/.test(valeur)) return valeur.padEnd(6, "0");
  return valeur;
}

export function normaliserComptes(debit: string, credit: string): {
  compteDebit: string;
  compteCredit: string;
} {
  return {
    compteDebit: normaliserNumeroCompte(debit),
    compteCredit: normaliserNumeroCompte(credit),
  };
}