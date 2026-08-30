export interface PrechargementSummary {
  prechargement: Record<string, unknown> | null;
  statut: string;
  statutLabel: "À effectuer" | "En cours" | "Conforme" | "Validée" | "À justifier";
  terminee: boolean;
  poidsPrevuKg: number;
  poidsChargeKg: number;
  nombreSacsCharge: number | null;
  ecartKg: number | null;
  ecartPct: number | null;
}

export function getPrechargementSummary(exp: Record<string, unknown>): PrechargementSummary {
  const prechargement = exp.prechargement && typeof exp.prechargement === "object"
    ? exp.prechargement as Record<string, unknown>
    : null;
  const statut = String(prechargement?.prechargementStatut ?? "");
  const terminee = prechargement?.statut === "terminee";
  const poidsPrevuKg = Number(exp.poidsPrevuKg ?? exp.poidsChargeKg ?? 0);
  const poidsChargeKg = Number(exp.poidsChargeEffectifKg ?? exp.poidsPrevuKg ?? exp.poidsChargeKg ?? 0);
  const nombreSacsCharge = exp.nombreSacsEffectif
    ? Number(exp.nombreSacsEffectif)
    : exp.nombreSacs ? Number(exp.nombreSacs) : null;
  const statutLabel = !prechargement
    ? "À effectuer"
    : prechargement.statut === "en_cours"
      ? "En cours"
      : statut === "conforme"
        ? "Conforme"
        : statut === "valide"
          ? "Validée"
          : "À justifier";

  return {
    prechargement,
    statut,
    statutLabel,
    terminee,
    poidsPrevuKg,
    poidsChargeKg,
    nombreSacsCharge,
    ecartKg: prechargement?.prechargementEcartKg == null ? null : Number(prechargement.prechargementEcartKg),
    ecartPct: prechargement?.prechargementEcartPct == null ? null : Number(prechargement.prechargementEcartPct),
  };
}