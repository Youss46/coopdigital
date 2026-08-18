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
import { getParamsEcriture } from "./planComptableService.js";

export type SourceEcriture =
  | "livraison" | "paiement" | "avance" | "vente"
  | "encaissement" | "salaire" | "stock" | "don"
  // Sources granulaires (contrôle par module)
  | "emprunt" | "transport" | "investissement" | "maintenance" | "intrant"
  | "amortissement" | "caisse" | "banque" | "subvention" | "mobile_marchand"
  // Primes exportateurs / redistribution producteurs
  | "prime_reception" | "prime_paiement"
  // Commissions délégués localités
  | "commission_delegue"
  // Charges diverses d'exploitation
  | "charges_diverses";

interface ProposerEcriturePayload {
  source: SourceEcriture;
  sourceId?: number;
  libelle: string;
  compteDebit: string;
  compteCredit: string;
  montantFcfa: number;
  date: string;
  numeroPiece?: string;
  /** Tiers individualisé : id du membre / fournisseur / exportateur / délégué */
  tiersId?: number;
  /** Type du tiers : "membre" | "fournisseur" | "exportateur" | "delegue" */
  tiersType?: "membre" | "fournisseur" | "exportateur" | "delegue";
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
  charges_diverses:  "autoMaintenances",   // exploitation courante — même toggle que les charges opérationnelles
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
  charges_diverses:  "paiement",
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
        tiersId: payload.tiersId ?? null,
        tiersType: payload.tiersType ?? null,
        exercice,
      }).returning({ id: ecrituresComptablesTable.id });
      if (inserted && !payload.numeroPiece) {
        await assignerNumeroPiece(inserted.id, DB_SOURCE_MAP[payload.source], exercice, cooperativeId);
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

// ─── Résolution des comptes depuis parametres_comptes_modules ────────────────
//
// Priorité : 1) paramètre configuré par la coopérative → 2) fallback OHADA codé en dur.
// getParamsEcriture() dispose d'un cache mémoire 10 min — pas de surcharge DB.
//
async function resolveComptes(
  cooperativeId: number,
  module: string,
  operation: string,
  fallbackDebit: string,
  fallbackCredit: string,
): Promise<{ compteDebit: string; compteCredit: string }> {
  try {
    const p = await getParamsEcriture(cooperativeId, module, operation);
    if (p) return { compteDebit: p.compteDebit, compteCredit: p.compteCredit };
  } catch {
    /* ignore — utiliser le fallback */
  }
  return { compteDebit: fallbackDebit, compteCredit: fallbackCredit };
}

// Variante : ne résoudre que le compte débit (crédit déterminé par le mode de paiement).
async function resolveCompteDebit(
  cooperativeId: number,
  module: string,
  operation: string,
  fallback: string,
): Promise<string> {
  try {
    const p = await getParamsEcriture(cooperativeId, module, operation);
    if (p) return p.compteDebit;
  } catch {
    /* ignore */
  }
  return fallback;
}

// ─── Wrappers métier ─────────────────────────────────────────────────────────

/**
 * Livraison enregistrée :
 *
 * Mode fonds_propres (défaut) :
 *   1) 601 / 401 = montantBrut  (achat cacao — dette envers le producteur)
 *   2) 401 / 4091 = avanceDéduite (imputation créance avance)
 *
 * Mode caisse_cooperative (caisse coopérative pré-alimentée) :
 *   La partie couverte par la caisse a DÉJÀ été décaissée lors de l'alimentation.
 *   On enregistre donc deux lignes distinctes pour éviter le double comptage :
 *   1a) 601 / 521 = montantCoopFcfa    (achat soldé via caisse pré-alimentée — pas de nouvelle dette 401)
 *   1b) 601 / 401 = resteValeurFcfa    (achat financé par le délégué — nouvelle dette)
 *        → si resteValeurFcfa = 0 l'écriture 1b est omise
 *   2) 401 / 4091 = avanceDéduite (identique aux deux modes)
 *
 * NB : l'écriture de décaissement (401/521 ou 401/571) est générée
 * au moment de la VALIDATION du règlement dans validerPaiement(),
 * pas ici. À la livraison on constate uniquement la dette et les déductions.
 */
export async function generateEcrituresLivraison(cooperativeId: number, params: {
  livraisonId: number;
  membreId?: number;
  membreNom: string;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  montantNetFcfa: number;
  dateLivraison: string;
  /**
   * Montant déjà couvert par la caisse coopérative pré-alimentée.
   * Positif uniquement si mode_financement = 'caisse_cooperative'.
   * Quand fourni, évite de créer une nouvelle dette 401 pour cette portion.
   */
  montantCoopFcfa?: number;
}) {
  const { livraisonId, membreId, membreNom, montantBrutFcfa, avanceDeduiteFcfa, dateLivraison } = params;
  const montantCoopCouvert = Math.min(params.montantCoopFcfa ?? 0, montantBrutFcfa);
  const restePayable = montantBrutFcfa - montantCoopCouvert;
  const piece = `LIV-${livraisonId}`;
  const promises: Promise<unknown>[] = [];

  // ── Part couverte par la caisse coopérative pré-alimentée (601 / 521) ──────
  // Pas de nouvelle dette fournisseur 401 : la caisse avait déjà été débitée
  // lors de l'alimentation du délégué.
  if (montantCoopCouvert > 0) {
    const c = await resolveComptes(cooperativeId, "livraisons", "achat_cacao_caisse_coop", "601", "521");
    promises.push(proposerEcriture(cooperativeId, {
      source: "livraison", sourceId: livraisonId,
      libelle: `Achat cacao (caisse coopérative) – ${membreNom}`,
      compteDebit: c.compteDebit, compteCredit: c.compteCredit,
      montantFcfa: montantCoopCouvert, date: dateLivraison, numeroPiece: piece,
      tiersId: membreId, tiersType: "membre",
    }));
  }

  // ── Part nouvelle (601 / 401) — financée par le délégué ou mode fonds propres ─
  if (restePayable > 0) {
    const c = await resolveComptes(cooperativeId, "livraisons", "achat_cacao_producteur", "601", "401");
    promises.push(proposerEcriture(cooperativeId, {
      source: "livraison", sourceId: livraisonId,
      libelle: `Achat cacao – ${membreNom}`,
      compteDebit: c.compteDebit, compteCredit: c.compteCredit,
      montantFcfa: restePayable, date: dateLivraison, numeroPiece: piece,
      tiersId: membreId, tiersType: "membre",
    }));
  }

  // ── Déduction avance (401 / 4091) — identique dans les deux modes ───────────
  if (avanceDeduiteFcfa > 0) {
    const c = await resolveComptes(cooperativeId, "avances", "remboursement_avance", "401", "4091");
    promises.push(proposerEcriture(cooperativeId, {
      source: "livraison", sourceId: livraisonId,
      libelle: `Déduction avance sur livraison – ${membreNom}`,
      compteDebit: c.compteDebit, compteCredit: c.compteCredit,
      montantFcfa: avanceDeduiteFcfa, date: dateLivraison, numeroPiece: piece,
      tiersId: membreId, tiersType: "membre",
    }));
  }

  await Promise.all(promises);
}

/**
 * Avance octroyée
 */
export async function generateEcrituresAvance(cooperativeId: number, params: {
  avanceId: number;
  membreId?: number;
  membreNom: string;
  montantFcfa: number;
  dateOctroi: string;
}) {
  const c = await resolveComptes(cooperativeId, "avances", "octroi_avance_producteur", "4091", "521");
  await proposerEcriture(cooperativeId, {
    source: "avance", sourceId: params.avanceId,
    libelle: `Avance octroyée – ${params.membreNom}`,
    compteDebit: c.compteDebit, compteCredit: c.compteCredit,
    montantFcfa: params.montantFcfa, date: params.dateOctroi,
    numeroPiece: `AVA-${params.avanceId}`,
    tiersId: params.membreId, tiersType: "membre",
  });
}

/**
 * Vente exportateur
 */
export async function generateEcrituresVente(cooperativeId: number, params: {
  venteId: number;
  exportateurNom: string;
  montantFcfa: number;
  dateVente: string;
}) {
  const c = await resolveComptes(cooperativeId, "ventes_export", "vente_cacao_exportateur", "4111", "701");
  await proposerEcriture(cooperativeId, {
    source: "vente", sourceId: params.venteId,
    libelle: `Vente cacao – ${params.exportateurNom}`,
    compteDebit: c.compteDebit, compteCredit: c.compteCredit,
    montantFcfa: params.montantFcfa, date: params.dateVente,
    numeroPiece: `VTE-${params.venteId}`,
  });
}

/**
 * Encaissement exportateur
 */
export async function generateEcrituresEncaissement(cooperativeId: number, params: {
  venteId: number;
  exportateurNom: string;
  montantFcfa: number;
  date: string;
}) {
  const c = await resolveComptes(cooperativeId, "ventes_export", "encaissement_exportateur", "521", "4111");
  await proposerEcriture(cooperativeId, {
    source: "encaissement", sourceId: params.venteId,
    libelle: `Encaissement exportateur – ${params.exportateurNom}`,
    compteDebit: c.compteDebit, compteCredit: c.compteCredit,
    montantFcfa: params.montantFcfa, date: params.date,
    numeroPiece: `ENC-${params.venteId}`,
  });
}

/**
 * Paiement bulletin de salaire.
 * Le compteCredit du versement net est passé par l'appelant (mode de paiement).
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

  const [cBrut, cNet] = await Promise.all([
    resolveComptes(cooperativeId, "salaires", "salaire_brut", "661", "421"),
    resolveComptes(cooperativeId, "salaires", "paiement_salaire", "421", compteCredit),
  ]);

  const promises: Promise<unknown>[] = [
    proposerEcriture(cooperativeId, {
      source: "salaire", sourceId: bulletinId,
      libelle: `Charge de personnel – ${personnelNom}`,
      compteDebit: cBrut.compteDebit, compteCredit: cBrut.compteCredit,
      montantFcfa: salaireBrutFcfa, date: datePaiement, numeroPiece: piece,
    }),
    proposerEcriture(cooperativeId, {
      source: "salaire", sourceId: bulletinId,
      libelle: `Versement salaire net – ${personnelNom}`,
      compteDebit: cNet.compteDebit, compteCredit: compteCredit,
      montantFcfa: salaireNetFcfa, date: datePaiement, numeroPiece: piece,
    }),
  ];

  if (cotisationsSalarieFcfa > 0) {
    const cCotis = await resolveComptes(cooperativeId, "salaires", "cotisations_salarie", "431", "421");
    promises.push(proposerEcriture(cooperativeId, {
      source: "salaire", sourceId: bulletinId,
      libelle: `Cotisations CNPS salarié – ${personnelNom}`,
      compteDebit: cCotis.compteDebit, compteCredit: cCotis.compteCredit,
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

  const [cBrut, cNet, cCotis] = await Promise.all([
    resolveComptes(cooperativeId, "salaires", "salaire_brut", "661", "421"),
    resolveComptes(cooperativeId, "salaires", "paiement_salaire", "421", compteCredit),
    resolveComptes(cooperativeId, "salaires", "cotisations_salarie", "431", "421"),
  ]);

  async function inserer(libelle: string, d: string, cr: string, montantFcfa: number) {
    const [inserted] = await db.insert(ecrituresComptablesTable).values({
      cooperativeId,
      dateEcriture: datePaiement,
      numeroPiece: piece,
      libelle,
      compteDebit: d,
      compteCredit: cr,
      montantFcfa: Math.round(montantFcfa),
      source: "salaire",
      sourceId: bulletinId,
      exercice,
    }).returning({ id: ecrituresComptablesTable.id });
    if (inserted) await assignerNumeroPiece(inserted.id, "salaire", exercice, cooperativeId);
  }

  const taches = [
    inserer(`Charge de personnel – ${personnelNom}`, cBrut.compteDebit, cBrut.compteCredit, salaireBrutFcfa),
    inserer(`Versement salaire net – ${personnelNom}`, cNet.compteDebit, compteCredit, salaireNetFcfa),
  ];
  if (cotisationsSalarieFcfa > 0) {
    taches.push(inserer(`Cotisations CNPS salarié – ${personnelNom}`, cCotis.compteDebit, cCotis.compteCredit, cotisationsSalarieFcfa));
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

  const c = await resolveComptes(cooperativeId, "primes", "reception_prime", "521", "7588");
  await proposerEcriture(cooperativeId, {
    source: "prime_reception",
    sourceId: receptionId,
    libelle,
    compteDebit: c.compteDebit,
    compteCredit: c.compteCredit,
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
  const compteDebit = await resolveCompteDebit(cooperativeId, "commissions_delegues", "paiement_commission", "6322");

  await proposerEcriture(cooperativeId, {
    source: "commission_delegue",
    sourceId: delegueId,
    libelle: `Commission délégué – ${delegueNom} (${nbCommissions} livraison${nbCommissions > 1 ? "s" : ""})`,
    compteDebit,
    compteCredit,
    montantFcfa,
    date,
    tiersId: delegueId, tiersType: "delegue",
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
    membreId?: number;
    membreNom: string;
    montantFcfa: number;
    modePaiement: string;
    date: string;
  },
) {
  const { primeMembreId, membreNom, montantFcfa, modePaiement, date } = params;
  const mode = modePaiement.toLowerCase();
  // Crédit = compte de trésorerie selon le mode de paiement (non configurable par opération)
  const compteCredit = MODES_MOBILE_MARCHAND.has(mode) ? "554"
    : MODES_CAISSE.has(mode) ? "571"
    : "521";
  // Débit = compte de charge configurable par la coopérative
  const compteDebit = await resolveCompteDebit(cooperativeId, "primes", "paiement_prime", "6018");

  await proposerEcriture(cooperativeId, {
    source: "prime_paiement",
    sourceId: primeMembreId,
    libelle: `Prime producteur – ${membreNom}`,
    compteDebit,
    compteCredit,
    montantFcfa,
    date,
    numeroPiece: `PRM-PAY-${primeMembreId}`,
    tiersId: params.membreId, tiersType: "membre",
  });
}
