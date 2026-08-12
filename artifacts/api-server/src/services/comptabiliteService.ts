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
import { assignerNumeroPiece } from "../lib/numeroPiece";

export type SourceEcriture =
  | "livraison" | "paiement" | "avance" | "vente"
  | "encaissement" | "salaire" | "stock" | "don"
  // Sources granulaires (contrôle par module)
  | "emprunt" | "transport" | "investissement" | "maintenance" | "intrant"
  | "amortissement" | "caisse" | "banque" | "subvention" | "mobile_marchand"
  // Primes exportateurs / redistribution producteurs
  | "prime_reception" | "prime_paiement"
  // Commissions délégués localités
  | "commission_delegue";

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
  livraison:     "autoLivraisons",
  paiement:      "autoPaiements",
  avance:        "autoAvances",
  vente:         "autoVentesExport",
  encaissement:  "autoEncaissements",
  salaire:       "autoSalaires",
  stock:         "autoStocks",
  don:           "autoDons",
  // Granulaires
  emprunt:       "autoEmprunts",
  transport:     "autoTransport",
  investissement:"autoInvestissements",
  maintenance:   "autoMaintenances",
  intrant:       "autoIntrants",
  amortissement:    "autoMaintenances",
  caisse:           "autoCaisse",
  banque:           "autoBanque",
  subvention:       "autoSubventions",
  mobile_marchand:  "autoMobileMarchand",
  prime_reception:   "autoPrimes",
  prime_paiement:    "autoPrimes",
  commission_delegue:"autoCommissions",
};

// Mapping vers les valeurs d'enum PostgreSQL existantes
// (les nouveaux types TS granulaires n'ont pas de valeur PG dédiée)
const DB_SOURCE_MAP: Record<SourceEcriture, "livraison" | "vente" | "avance" | "paiement" | "encaissement" | "salaire" | "stock" | "don"> = {
  livraison:     "livraison",
  paiement:      "paiement",
  avance:        "avance",
  vente:         "vente",
  encaissement:  "encaissement",
  salaire:       "salaire",
  stock:         "stock",
  don:           "don",
  emprunt:       "paiement",
  transport:     "paiement",
  investissement:"paiement",
  maintenance:   "paiement",
  intrant:       "stock",
  amortissement:   "paiement",
  caisse:          "paiement",
  banque:          "paiement",
  subvention:      "encaissement",
  mobile_marchand: "paiement",
  prime_reception:   "encaissement",
  prime_paiement:    "paiement",
  commission_delegue:"paiement",
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
      const [inserted] = await db.insert(ecrituresComptablesTable).values({
        cooperativeId,
        dateEcriture: payload.date,
        numeroPiece: payload.numeroPiece ?? null,
        libelle: payload.libelle,
        compteDebit: payload.compteDebit,
        compteCredit: payload.compteCredit,
        montantFcfa: Math.round(payload.montantFcfa),
        source: DB_SOURCE_MAP[payload.source],
        sourceId: payload.sourceId ?? null,
        exercice,
      }).returning({ id: ecrituresComptablesTable.id });
      if (inserted && !payload.numeroPiece) {
        await assignerNumeroPiece(inserted.id, DB_SOURCE_MAP[payload.source], exercice);
      }
      return { mode: "automatique", statut: "enregistree" };
    }

    await db.insert(ecrituresEnAttenteTable).values({
      cooperativeId,
      source: DB_SOURCE_MAP[payload.source],
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
    throw err;
  }
}

// ─── Wrappers métier ─────────────────────────────────────────────────────────

/**
 * Livraison enregistrée :
 * 1) 601 / 401 = montant brut (achat cacao — dette envers le producteur)
 * 2) 401 / 4091 = avance déduite (imputation créance)
 *
 * NB : l'écriture de décaissement (401/521 ou 401/571) est générée
 * au moment de la VALIDATION du règlement dans validerPaiement(),
 * pas ici. À la livraison on constate uniquement la dette et les déductions.
 */
export async function generateEcrituresLivraison(cooperativeId: number, params: {
  livraisonId: number;
  membreNom: string;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  montantNetFcfa: number;
  dateLivraison: string;
}) {
  const { livraisonId, membreNom, montantBrutFcfa, avanceDeduiteFcfa, dateLivraison } = params;
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
  compteCredit?: string;
}) {
  const { bulletinId, personnelNom, salaireNetFcfa, salaireBrutFcfa, cotisationsSalarieFcfa, datePaiement, compteCredit = "521" } = params;
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
      compteDebit: "421", compteCredit: compteCredit,
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

/**
 * Insère les écritures salaire directement dans le journal (sans passer par "en attente").
 * Utilisé pour la réconciliation de paiements historiques.
 */
export async function insererEcrituresSalaireDirectes(cooperativeId: number, params: {
  bulletinId: number;
  personnelNom: string;
  salaireNetFcfa: number;
  salaireBrutFcfa: number;
  cotisationsSalarieFcfa: number;
  datePaiement: string;
  compteCredit?: string;
}) {
  const { bulletinId, personnelNom, salaireNetFcfa, salaireBrutFcfa, cotisationsSalarieFcfa, datePaiement, compteCredit = "521" } = params;
  const piece = `SAL-${bulletinId}`;
  const exercice = new Date(datePaiement).getFullYear();

  async function inserer(libelle: string, compteDebit: string, compteCredit: string, montantFcfa: number) {
    const [inserted] = await db.insert(ecrituresComptablesTable).values({
      cooperativeId,
      dateEcriture: datePaiement,
      numeroPiece: piece,
      libelle,
      compteDebit,
      compteCredit,
      montantFcfa: Math.round(montantFcfa),
      source: "salaire",
      sourceId: bulletinId,
      exercice,
    }).returning({ id: ecrituresComptablesTable.id });
    if (inserted) {
      await assignerNumeroPiece(inserted.id, "salaire", exercice);
    }
  }

  const taches = [
    inserer(`Charge de personnel – ${personnelNom}`, "661", "421", salaireBrutFcfa),
    inserer(`Versement salaire net – ${personnelNom}`, "421", compteCredit, salaireNetFcfa),
  ];
  if (cotisationsSalarieFcfa > 0) {
    taches.push(inserer(`Cotisations CNPS salarié – ${personnelNom}`, "431", "421", cotisationsSalarieFcfa));
  }
  await Promise.all(taches);
}

// ─── Primes exportateurs / redistribution producteurs ─────────────────────────

/**
 * Réception d'une prime de l'exportateur.
 * SYSCOHADA : Débit 521 Banque / Crédit 7588 Autres produits d'exploitation divers
 */
export async function generateEcrituresPrimeReception(
  cooperativeId: number,
  params: {
    receptionId: number;
    montantFcfa: number;
    typePrimeLabel: string;
    exportateurNom: string | null;
    date: string;
  },
) {
  const { receptionId, montantFcfa, typePrimeLabel, exportateurNom, date } = params;
  const libelle = exportateurNom
    ? `Prime ${typePrimeLabel} – ${exportateurNom}`
    : `Prime ${typePrimeLabel}`;

  await proposerEcriture(cooperativeId, {
    source: "prime_reception",
    sourceId: receptionId,
    libelle,
    compteDebit: "521",
    compteCredit: "7588",
    montantFcfa,
    date,
    numeroPiece: `PRM-REC-${receptionId}`,
  });
}

/**
 * Modes de paiement en espèces / caisse physique (→ 571 Caisse).
 */
const MODES_CAISSE = new Set(["caisse", "especes", "espèces"]);

/**
 * Modes de paiement via porte-monnaie électronique mobile marchand (→ 554).
 * SYSCOHADA 554 : Porte-monnaie électronique (Orange Money, MTN MoMo, Wave, etc.)
 */
const MODES_MOBILE_MARCHAND = new Set([
  "orange_money", "mtn_momo", "wave", "mobile_money", "mobile_marchand",
]);

/**
 * Paiement d'une commission à un délégué localité.
 * SYSCOHADA :
 *   Débit  6625 Rémunérations et commissions versées aux intermédiaires
 *   Crédit  571 Caisse             (espèces)
 *           554 Porte-monnaie élec (mobile money)
 *           521 Banque             (virement, chèque)
 */
export async function generateEcrituresCommission(
  cooperativeId: number,
  params: {
    delegueId: number;
    delegueNom: string;
    montantFcfa: number;
    modePaiement: string;
    date: string;
    nbCommissions: number;
  },
): Promise<void> {
  const { delegueId, delegueNom, montantFcfa, modePaiement, date, nbCommissions } = params;
  const mode = modePaiement.toLowerCase();

  const compteCredit = MODES_MOBILE_MARCHAND.has(mode) ? "554"
    : MODES_CAISSE.has(mode) ? "571"
    : "521"; // virement, chèque

  await proposerEcriture(cooperativeId, {
    source: "commission_delegue",
    sourceId: delegueId,
    libelle: `Commission délégué – ${delegueNom} (${nbCommissions} livraison${nbCommissions > 1 ? "s" : ""})`,
    compteDebit: "6322",
    compteCredit,
    montantFcfa,
    date,
  });
}

/**
 * Paiement d'une prime à un producteur (complément prix d'achat cacao).
 * SYSCOHADA :
 *   Débit 6018 Complément d'achat
 *   Crédit 554 Porte-monnaie électronique  (mobile money)
 *         571 Caisse                        (espèces)
 *         521 Banque                        (virement, chèque, etc.)
 */
export async function generateEcrituresPrimePaiement(
  cooperativeId: number,
  params: {
    primeMembreId: number;
    membreNom: string;
    montantFcfa: number;
    modePaiement: string;
    date: string;
  },
) {
  const { primeMembreId, membreNom, montantFcfa, modePaiement, date } = params;
  const mode = modePaiement.toLowerCase();
  const compteCredit = MODES_MOBILE_MARCHAND.has(mode) ? "554"
    : MODES_CAISSE.has(mode) ? "571"
    : "521";

  await proposerEcriture(cooperativeId, {
    source: "prime_paiement",
    sourceId: primeMembreId,
    libelle: `Prime producteur – ${membreNom}`,
    compteDebit: "6018",
    compteCredit,
    montantFcfa,
    date,
    numeroPiece: `PRM-PAY-${primeMembreId}`,
  });
}
