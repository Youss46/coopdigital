/**
 * Service de comptabilité OHADA — génération automatique des écritures comptables.
 * Toutes les fonctions sont fire-and-forget : les appeler APRÈS la transaction principale.
 *
 * proposerEcriture() est la fonction centrale :
 * - En mode automatique (config activé) → insère directement dans ecritures_comptables
 * - En mode manuel (config désactivé) → met en attente dans ecritures_en_attente
 */
import { db, ecrituresComptablesTable, configComptableTable, ecrituresEnAttenteTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export type SourceEcriture = "livraison" | "paiement" | "avance" | "vente" | "encaissement" | "salaire" | "stock" | "don";

interface ProposerEcriturePayload {
  source: SourceEcriture;
  sourceId?: number;
  libelle: string;
  compteDebit: string;
  compteCredit: string;
  montantFcfa: number;
  date: string;
  numeroPiece?: string;
}

const AUTO_KEY_MAP: Record<SourceEcriture, keyof typeof configComptableTable.$inferSelect> = {
  livraison:    "autoLivraisons",
  paiement:     "autoPaiements",
  avance:       "autoAvances",
  vente:        "autoVentesExport",
  encaissement: "autoEncaissements",
  salaire:      "autoSalaires",
  stock:        "autoStocks",
  don:          "autoDons",
};

async function getConfigComptable(cooperativeId: number) {
  const rows = await db
    .select()
    .from(configComptableTable)
    .where(eq(configComptableTable.cooperativeId, cooperativeId))
    .limit(1);
  if (rows.length === 0) {
    await db.insert(configComptableTable).values({ cooperativeId }).onConflictDoNothing();
    const rows2 = await db
      .select()
      .from(configComptableTable)
      .where(eq(configComptableTable.cooperativeId, cooperativeId))
      .limit(1);
    return rows2[0]!;
  }
  return rows[0]!;
}

export async function proposerEcriture(
  cooperativeId: number,
  payload: ProposerEcriturePayload
): Promise<{ mode: "automatique" | "manuel"; statut: "enregistree" | "en_attente" }> {
  try {
    const config = await getConfigComptable(cooperativeId);
    const cle = AUTO_KEY_MAP[payload.source];
    const modeAuto = config[cle] === true;

    if (modeAuto) {
      const exercice = new Date(payload.date).getFullYear();
      await db.insert(ecrituresComptablesTable).values({
        cooperativeId,
        dateEcriture: payload.date,
        numeroPiece: payload.numeroPiece ?? null,
        libelle: payload.libelle,
        compteDebit: payload.compteDebit,
        compteCredit: payload.compteCredit,
        montantFcfa: Math.round(payload.montantFcfa),
        source: payload.source as "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock",
        sourceId: payload.sourceId ?? null,
        exercice,
      });
      return { mode: "automatique", statut: "enregistree" };
    }

    await db.insert(ecrituresEnAttenteTable).values({
      cooperativeId,
      source: payload.source,
      sourceId: payload.sourceId ?? null,
      libelleProppose: payload.libelle,
      compteDebitPropose: payload.compteDebit,
      compteCreditPropose: payload.compteCredit,
      montantFcfa: Math.round(payload.montantFcfa),
      dateProposee: payload.date,
      statut: "en_attente",
    });
    return { mode: "manuel", statut: "en_attente" };
  } catch (err) {
    logger.error({ err, payload }, "Erreur proposerEcriture");
    return { mode: "manuel", statut: "en_attente" };
  }
}

// ─── Wrappers métier ─────────────────────────────────────────────────────────

/**
 * Livraison enregistrée :
 * 1) 601 / 401 = montant brut (achat cacao)
 * 2) 401 / 521 = montant net (décaissement banque)
 * 3) 401 / 416 = avance déduite (imputation créance)
 */
export async function generateEcrituresLivraison(cooperativeId: number, params: {
  livraisonId: number;
  membreNom: string;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  montantNetFcfa: number;
  dateLivraison: string;
}) {
  const { livraisonId, membreNom, montantBrutFcfa, avanceDeduiteFcfa, montantNetFcfa, dateLivraison } = params;
  const piece = `LIV-${livraisonId}`;
  const promises: Promise<unknown>[] = [];

  if (montantBrutFcfa > 0) {
    promises.push(proposerEcriture(cooperativeId, {
      source: "livraison", sourceId: livraisonId,
      libelle: `Achat cacao – ${membreNom}`,
      compteDebit: "601", compteCredit: "401",
      montantFcfa: montantBrutFcfa, date: dateLivraison, numeroPiece: piece,
    }));
  }
  if (montantNetFcfa > 0) {
    promises.push(proposerEcriture(cooperativeId, {
      source: "livraison", sourceId: livraisonId,
      libelle: `Paiement net livraison – ${membreNom}`,
      compteDebit: "401", compteCredit: "521",
      montantFcfa: montantNetFcfa, date: dateLivraison, numeroPiece: piece,
    }));
  }
  if (avanceDeduiteFcfa > 0) {
    promises.push(proposerEcriture(cooperativeId, {
      source: "livraison", sourceId: livraisonId,
      libelle: `Déduction avance sur livraison – ${membreNom}`,
      compteDebit: "401", compteCredit: "4091",
      montantFcfa: avanceDeduiteFcfa, date: dateLivraison, numeroPiece: piece,
    }));
  }

  await Promise.all(promises);
}

/**
 * Avance octroyée : 416 / 521
 */
export async function generateEcrituresAvance(cooperativeId: number, params: {
  avanceId: number;
  membreNom: string;
  montantFcfa: number;
  dateOctroi: string;
}) {
  await proposerEcriture(cooperativeId, {
    source: "avance", sourceId: params.avanceId,
    libelle: `Avance octroyée – ${params.membreNom}`,
    compteDebit: "4091", compteCredit: "521",
    montantFcfa: params.montantFcfa, date: params.dateOctroi,
    numeroPiece: `AVA-${params.avanceId}`,
  });
}

/**
 * Vente exportateur : 4111 / 701
 */
export async function generateEcrituresVente(cooperativeId: number, params: {
  venteId: number;
  exportateurNom: string;
  montantFcfa: number;
  dateVente: string;
}) {
  await proposerEcriture(cooperativeId, {
    source: "vente", sourceId: params.venteId,
    libelle: `Vente cacao – ${params.exportateurNom}`,
    compteDebit: "4111", compteCredit: "701",
    montantFcfa: params.montantFcfa, date: params.dateVente,
    numeroPiece: `VTE-${params.venteId}`,
  });
}

/**
 * Encaissement exportateur : 521 / 4111
 */
export async function generateEcrituresEncaissement(cooperativeId: number, params: {
  venteId: number;
  exportateurNom: string;
  montantFcfa: number;
  date: string;
}) {
  await proposerEcriture(cooperativeId, {
    source: "encaissement", sourceId: params.venteId,
    libelle: `Encaissement exportateur – ${params.exportateurNom}`,
    compteDebit: "521", compteCredit: "4111",
    montantFcfa: params.montantFcfa, date: params.date,
    numeroPiece: `ENC-${params.venteId}`,
  });
}

/**
 * Paiement bulletin de salaire :
 * 661 / 421 = charges de personnel / rémunérations dues (brut)
 * 421 / 521 = versement net au salarié
 * 432 / 421 = cotisations CNPS salarié (si > 0)
 */
export async function generateEcrituresSalaire(cooperativeId: number, params: {
  bulletinId: number;
  personnelNom: string;
  salaireNetFcfa: number;
  salaireBrutFcfa: number;
  cotisationsSalarieFcfa: number;
  datePaiement: string;
}) {
  const { bulletinId, personnelNom, salaireNetFcfa, salaireBrutFcfa, cotisationsSalarieFcfa, datePaiement } = params;
  const piece = `SAL-${bulletinId}`;

  const promises: Promise<unknown>[] = [
    proposerEcriture(cooperativeId, {
      source: "salaire", sourceId: bulletinId,
      libelle: `Charge de personnel – ${personnelNom}`,
      compteDebit: "661", compteCredit: "421",
      montantFcfa: salaireBrutFcfa, date: datePaiement, numeroPiece: piece,
    }),
    proposerEcriture(cooperativeId, {
      source: "salaire", sourceId: bulletinId,
      libelle: `Versement salaire net – ${personnelNom}`,
      compteDebit: "421", compteCredit: "521",
      montantFcfa: salaireNetFcfa, date: datePaiement, numeroPiece: piece,
    }),
  ];

  if (cotisationsSalarieFcfa > 0) {
    promises.push(proposerEcriture(cooperativeId, {
      source: "salaire", sourceId: bulletinId,
      libelle: `Cotisations CNPS salarié – ${personnelNom}`,
      compteDebit: "431", compteCredit: "421",
      montantFcfa: cotisationsSalarieFcfa, date: datePaiement, numeroPiece: piece,
    }));
  }

  await Promise.all(promises);
}
