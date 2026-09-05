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

function normaliserTexte(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function estCompte(compte: string, prefix: string): boolean {
  return normaliserNumeroCompte(compte).startsWith(prefix);
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