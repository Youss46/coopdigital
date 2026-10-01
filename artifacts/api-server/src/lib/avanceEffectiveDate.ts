export function getEcheanceAvanceEffective(
  dateEcheance: string | null | undefined,
  reportDate: string | null | undefined,
): string | null {
  if (!dateEcheance) return reportDate ?? null;
  if (!reportDate) return dateEcheance;
  return reportDate > dateEcheance ? reportDate : dateEcheance;
}

export function getStatutAvanceEffectif(
  statut: string,
  dateEcheance: string | null | undefined,
  reportDate: string | null | undefined,
  today: string,
): string {
  const active = statut === "en_cours" || statut === "en_retard";
  if (!active) return statut;

  if (reportDate && reportDate >= today) return "en_cours";

  const echeanceEffective = getEcheanceAvanceEffective(dateEcheance, reportDate);
  if (echeanceEffective) return echeanceEffective < today ? "en_retard" : "en_cours";
  return statut;
}