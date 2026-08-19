/**
 * Montants immuables d'un règlement de membre délégué.
 *
 * Le bordereau, la livraison, le paiement et les écritures doivent tous partir
 * de cette même ventilation. Les montants sont arrondis à l'unité FCFA car les
 * colonnes de règlement sont des entiers.
 */
export interface VentilationReglementMembreDelegue {
  valeurProduitFcfa: number;
  fraisCarburantFcfa?: number;
  autresChargesFcfa?: number;
  avanceDeduiteFcfa?: number;
}

const fcfa = (montant: number | undefined) => Math.max(0, Math.round(montant ?? 0));

export function calculerReglementMembreDelegue(
  ventilation: VentilationReglementMembreDelegue,
) {
  const valeurProduitFcfa = fcfa(ventilation.valeurProduitFcfa);
  const fraisCarburantDemandesFcfa = fcfa(ventilation.fraisCarburantFcfa);
  const autresChargesDemandeesFcfa = fcfa(ventilation.autresChargesFcfa);
  const avanceDemandeeFcfa = fcfa(ventilation.avanceDeduiteFcfa);
  const montantAvantRetenuesFcfa = valeurProduitFcfa;
  // Le montant du règlement ne peut devenir négatif : carburant en premier,
  // puis autres charges. L'excédent non récupéré reste une créance sur le membre.
  const fraisCarburantFcfa = Math.min(fraisCarburantDemandesFcfa, montantAvantRetenuesFcfa);
  const autresChargesFcfa = Math.min(
    autresChargesDemandeesFcfa,
    Math.max(0, montantAvantRetenuesFcfa - fraisCarburantFcfa),
  );
  const totalChargesFcfa = fraisCarburantFcfa + autresChargesFcfa;
  // Les frais du bon sont prioritaires. Une avance ne peut être imputée que
  // sur le solde réellement payable, sinon le compte membre deviendrait
  // débiteur alors que le paiement est à zéro.
  const avanceDeduiteFcfa = Math.min(
    avanceDemandeeFcfa,
    Math.max(0, montantAvantRetenuesFcfa - totalChargesFcfa),
  );
  const montantNetFcfa = Math.max(
    0,
    montantAvantRetenuesFcfa - totalChargesFcfa - avanceDeduiteFcfa,
  );
  const fraisCarburantNonRecupereFcfa = Math.max(
    0,
    fraisCarburantDemandesFcfa - fraisCarburantFcfa,
  );
  const autresChargesNonRecupereesFcfa = Math.max(
    0,
    autresChargesDemandeesFcfa - autresChargesFcfa,
  );
  const creanceChargesRestanteFcfa =
    fraisCarburantNonRecupereFcfa + autresChargesNonRecupereesFcfa;

  return {
    valeurProduitFcfa,
    fraisCarburantDemandesFcfa,
    autresChargesDemandeesFcfa,
    fraisCarburantFcfa,
    autresChargesFcfa,
    totalChargesFcfa,
    avanceDemandeeFcfa,
    avanceDeduiteFcfa,
    montantAvantRetenuesFcfa,
    montantNetFcfa,
    fraisCarburantNonRecupereFcfa,
    autresChargesNonRecupereesFcfa,
    creanceChargesRestanteFcfa,
  };
}