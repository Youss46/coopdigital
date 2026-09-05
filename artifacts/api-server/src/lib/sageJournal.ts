import { normaliserNumeroCompte } from "./numeroCompte.js";

export interface TransactionJournalSage {
  source?: string | null;
  typeEcriture?: string | null;
  modePaiement?: string | null;
  compteDebit?: string | null;
  compteCredit?: string | null;
  libelle?: string | null;
  numeroPiece?: string | null;
}

const COMPTE_COLLECTIF_FOURNISSEUR = "401000";
const COMPTE_COLLECTIF_CLIENT = "411000";

function normaliserTexte(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function estCompte(compte: string, prefix: string): boolean {
  return normaliserNumeroCompte(compte).startsWith(prefix);
}

function prefixeCompteTiers(tiersType: string): string {
  switch (normaliserTexte(tiersType)) {
    case "membre":
      return "MEM";
    case "membre_delegue":
      return "MDE";
    case "delegue":
      return "DEL";
    case "fournisseur_ext":
      return "FOU";
    case "exportateur":
      return "CLI";
    default:
      return "TIE";
  }
}

/**
 * Retourne le compte auxiliaire Sage d'une ligne qui touche un collectif.
 *
 * Les identifiants internes sont utilisés volontairement : ils sont stables,
 * indépendants des changements de nom et ne créent pas de collision entre
 * les différents types de tiers.
 */
export function determinerCompteTiersSage(params: {
  compte: string | null | undefined;
  tiersType: string | null | undefined;
  tiersId: number | null | undefined;
}): string {
  const compte = normaliserNumeroCompte(params.compte ?? "");
  if (compte !== COMPTE_COLLECTIF_FOURNISSEUR && compte !== COMPTE_COLLECTIF_CLIENT) {
    return "";
  }
  const tiersId = params.tiersId;
  if (!params.tiersType || !Number.isInteger(tiersId) || tiersId <= 0) {
    return "";
  }

  return `${prefixeCompteTiers(params.tiersType)}-${String(tiersId).padStart(6, "0")}`;
}

function estAchatAutreQueCacao(transaction: TransactionJournalSage): boolean {
  const source = normaliserTexte(transaction.source);
  return source !== "livraison"
    && estCompte(transaction.compteCredit ?? "", "401");
}

function estMouvementTresorerie(transaction: TransactionJournalSage): boolean {
  const source = normaliserTexte(transaction.source);
  if (source !== "paiement" && source !== "encaissement") return false;

  return transaction.modePaiement === "especes"
    || transaction.modePaiement === "cheque"
    || transaction.modePaiement === "virement"
    || estCompte(transaction.compteDebit ?? "", "571")
    || estCompte(transaction.compteCredit ?? "", "571")
    || estCompte(transaction.compteDebit ?? "", "521")
    || estCompte(transaction.compteCredit ?? "", "521");
}

/**
 * Détermine le journal Sage 100 i7 d'une écriture comptable.
 *
 * La source et le type d'écriture sont les indicateurs métier principaux.
 * Les comptes servent de garde-fou pour les sources granulaires qui sont
 * aplaties vers l'enum PostgreSQL `paiement`.
 */
export function determinerCodeJournal(transaction: TransactionJournalSage): string {
  const source = normaliserTexte(transaction.source);
  const typeEcriture = normaliserTexte(transaction.typeEcriture);
  const libelle = normaliserTexte(transaction.libelle);

  if (source === "manuel" && typeEcriture === "a_nouveau") return "RAN";
  if (typeEcriture === "a_nouveau") return "RAN";

  if (source === "livraison" || typeEcriture.includes("achat_cacao") || libelle.includes("achat cacao")) {
    return "AKKO";
  }

  if (source === "vente" || typeEcriture.includes("vente_cacao") || libelle.includes("vente cacao")) {
    return "VKKO";
  }

  if (
    source === "salaire"
    || typeEcriture.includes("salaire")
    || libelle.includes("salaire")
    || libelle.includes("cnps")
  ) {
    return "ODP";
  }

  if (estAchatAutreQueCacao(transaction)) return "ACD";

  if (estMouvementTresorerie(transaction)) {
    if (transaction.modePaiement === "especes" || estCompte(transaction.compteDebit ?? "", "571") || estCompte(transaction.compteCredit ?? "", "571")) {
      return "CAIS";
    }
    if (transaction.modePaiement === "cheque" || transaction.modePaiement === "virement") return "BQ";
    if (estCompte(transaction.compteDebit ?? "", "521") || estCompte(transaction.compteCredit ?? "", "521")) {
      return "BQ";
    }
  }

  return "OD";
}