/**
 * Service de comptabilité OHADA — génération automatique des écritures comptables.
 * Toutes les fonctions sont fire-and-forget : les appeler APRÈS la transaction principale.
 *
 * proposerEcriture() est la fonction centrale :
 * - En mode automatique (config activé) → insère directement dans ecritures_comptables
 * - En mode manuel (config désactivé) → met en attente dans ecritures_en_attente
 */
import { db, ecrituresComptablesTable, configComptableTable, ecrituresEnAttenteTable, livraisonsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { assignerNumeroPiece } from "../lib/numeroPiece";
import { getParamsEcriture } from "./planComptableService.js";
import { normaliserComptes, normaliserNumeroCompte } from "../lib/numeroCompte.js";

export type ComptabiliteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  tiersType?: "membre" | "fournisseur" | "fournisseur_ext" | "exportateur" | "delegue" | "personnel";
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

async function getConfigComptable(
  cooperativeId: number,
  executor: typeof db | ComptabiliteTransaction = db,
) {
  const rows = await executor
    .select()
    .from(configComptableTable)
    .where(eq(configComptableTable.cooperativeId, cooperativeId))
    .limit(1);
  if (rows.length === 0) {
    await executor.insert(configComptableTable).values({ cooperativeId }).onConflictDoNothing();
    const rows2 = await executor
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
    const comptes = normaliserComptes(payload.compteDebit, payload.compteCredit);
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
        compteDebit: comptes.compteDebit,
        compteCredit: comptes.compteCredit,
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
      compteDebitPropose: comptes.compteDebit,
      compteCreditPropose: comptes.compteCredit,
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

/**
 * Variante transactionnelle utilisée lorsqu'un événement métier produit
 * plusieurs écritures. Aucun appel ne doit sortir de la transaction : une
 * erreur sur une écriture annule également les précédentes.
 */
export async function proposerEcrituresDansTransaction(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  payloads: ProposerEcriturePayload[],
): Promise<void> {
  const config = await getConfigComptable(cooperativeId, tx);

  for (const payload of payloads) {
    const comptes = normaliserComptes(payload.compteDebit, payload.compteCredit);
    const cle = AUTO_KEY_MAP[payload.source];
    const modeAuto = config[cle] === true;

    if (modeAuto) {
      const exercice = new Date(payload.date).getFullYear();
      await tx.insert(ecrituresComptablesTable).values({
        cooperativeId,
        dateEcriture: payload.date,
        numeroPiece: payload.numeroPiece ?? null,
        libelle: payload.libelle,
         compteDebit: comptes.compteDebit,
         compteCredit: comptes.compteCredit,
        montantFcfa: Math.round(payload.montantFcfa),
        source: DB_SOURCE_MAP[payload.source],
        sourceId: payload.sourceId ?? null,
        tiersId: payload.tiersId ?? null,
        tiersType: payload.tiersType ?? null,
        exercice,
      });
    } else {
      await tx.insert(ecrituresEnAttenteTable).values({
        cooperativeId,
        source: DB_SOURCE_MAP[payload.source],
        sourceId: payload.sourceId ?? null,
        libelleProppose: payload.libelle,
         compteDebitPropose: comptes.compteDebit,
         compteCreditPropose: comptes.compteCredit,
        montantFcfa: Math.round(payload.montantFcfa),
        dateProposee: payload.date,
        statut: "en_attente",
      });
    }
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
    if (p) return normaliserComptes(p.compteDebit, p.compteCredit);
  } catch {
    /* ignore — utiliser le fallback */
  }
  return normaliserComptes(fallbackDebit, fallbackCredit);
}

/**
 * Compte fournisseur producteur effectivement crédité lors de l'achat cacao.
 * Les retenues et le paiement final doivent tous débiter ce même compte.
 */
export async function resolveCompteDetteProducteur(
  cooperativeId: number,
  compteFige?: string | null,
): Promise<string> {
  if (compteFige?.trim()) return normaliserNumeroCompte(compteFige);
  const comptes = await resolveComptes(
    cooperativeId,
    "livraisons",
    "achat_cacao_producteur",
    "601",
    "401",
  );
  return comptes.compteCredit;
}

// Variante : ne résoudre que le compte débit (crédit déterminé par le mode de paiement).
export async function resolveCompteDebit(
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
 *   2) 4091 / trésorerie puis 401 / 4091 = charges payées pour le compte du membre
 *   3) 401 / 4091 = avanceDéduite (imputation créance avance)
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
  /** Fournisseur externe (pisteur) — exclusif avec membreId */
  fournisseurId?: number;
  membreNom: string;
  montantBrutFcfa: number;
  avanceDeduiteFcfa: number;
  montantNetFcfa: number;
  dateLivraison: string;
  /** Ventilation réservée aux livraisons depuis un bon de réception membre délégué. */
  fraisCarburantAvancesFcfa?: number;
  autresChargesAvanceesFcfa?: number;
  fraisCarburantDeduitsFcfa?: number;
  autresChargesDeduitesFcfa?: number;
  autresChargesLibelle?: string | null;
  /**
   * Montant déjà couvert par la caisse coopérative pré-alimentée.
   * Positif uniquement si mode_financement = 'caisse_cooperative'.
   * Quand fourni, évite de créer une nouvelle dette 401 pour cette portion.
   */
  montantCoopFcfa?: number;
}) {
  const {
    livraisonId,
    membreId,
    fournisseurId,
    membreNom,
    montantBrutFcfa,
    avanceDeduiteFcfa,
    dateLivraison,
  } = params;
  // tiersId/tiersType : membre prioritaire, sinon fournisseur externe
  const tiersId   = membreId ?? fournisseurId;
  const tiersType = membreId ? "membre" : fournisseurId ? "fournisseur_ext" : undefined;
  const montantCoopCouvert = Math.min(params.montantCoopFcfa ?? 0, montantBrutFcfa);
  const restePayable = montantBrutFcfa - montantCoopCouvert;
  const fraisCarburantAvanceFcfa = Math.max(0, Math.round(
    params.fraisCarburantAvancesFcfa ?? params.fraisCarburantDeduitsFcfa ?? 0,
  ));
  const autresChargesAvanceFcfa = Math.max(0, Math.round(
    params.autresChargesAvanceesFcfa ?? params.autresChargesDeduitesFcfa ?? 0,
  ));
  const fraisCarburantDemandeDeduitFcfa = Math.max(0, Math.round(params.fraisCarburantDeduitsFcfa ?? 0));
  const autresChargesDemandeesDeduitesFcfa = Math.max(0, Math.round(params.autresChargesDeduitesFcfa ?? 0));
  // Les retenues ne peuvent pas débiter le compte 401 au-delà de la dette
  // produit effectivement créée. Carburant, autres charges, puis avance.
  let disponiblePourRetenuesFcfa = Math.max(0, restePayable);
  const fraisCarburantRetenusFcfa = Math.min(
    fraisCarburantAvanceFcfa,
    fraisCarburantDemandeDeduitFcfa,
    disponiblePourRetenuesFcfa,
  );
  disponiblePourRetenuesFcfa -= fraisCarburantRetenusFcfa;
  const autresChargesRetenuesFcfa = Math.min(
    autresChargesAvanceFcfa,
    autresChargesDemandeesDeduitesFcfa,
    disponiblePourRetenuesFcfa,
  );
  disponiblePourRetenuesFcfa -= autresChargesRetenuesFcfa;
  const avanceImputableFcfa = Math.min(
    Math.max(0, Math.round(avanceDeduiteFcfa)),
    disponiblePourRetenuesFcfa,
  );
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
      tiersId, tiersType,
    }));
  }

  // Résoudre une seule fois l'écriture qui crée la dette producteur. Toutes les
  // retenues doivent débiter exactement le compte crédité ici.
  const comptesAchatProducteur = restePayable > 0
    ? await resolveComptes(cooperativeId, "livraisons", "achat_cacao_producteur", "601", "401")
    : null;
  const compteDetteProducteur = comptesAchatProducteur?.compteCredit ?? "401";
  if (restePayable > 0) {
    await db
      .update(livraisonsTable)
      .set({ compteDetteProducteur })
      .where(eq(livraisonsTable.id, livraisonId));
  }

  // ── Part nouvelle (601 / 401) — financée par le délégué ou mode fonds propres ─
  if (restePayable > 0 && comptesAchatProducteur) {
    promises.push(proposerEcriture(cooperativeId, {
      source: "livraison", sourceId: livraisonId,
      libelle: `Achat cacao – ${membreNom}`,
      compteDebit: comptesAchatProducteur.compteDebit,
      compteCredit: comptesAchatProducteur.compteCredit,
      montantFcfa: restePayable, date: dateLivraison, numeroPiece: piece,
      tiersId, tiersType,
    }));
  }

  // ── Créances sur le membre au titre du bon de réception ────────────────────
  // La coopérative paie ces dépenses pour le compte du membre : ce ne sont ni
  // ses propres charges, ni un produit lors de la récupération. L'avance crée
  // une créance 4091, puis la retenue sur le règlement solde cette créance par
  // le compte 401. Toute part non retenue reste ouverte au débit du 4091.
  const ajouterChargeBon = async (
    montantAvanceFcfa: number,
    montantRetenuFcfa: number,
    libelle: string,
    operationCreance: string,
    operationRetenue: string,
  ) => {
    const montantAvance = Math.max(0, Math.round(montantAvanceFcfa));
    const montantRetenu = Math.min(montantAvance, Math.max(0, Math.round(montantRetenuFcfa)));
    if (montantAvance === 0 || !membreId) return;

    const comptesCreanceConfigures = await resolveComptes(
      cooperativeId,
      "receptions_membres_delegues",
      operationCreance,
      "4091",
      "521",
    );
    // Une ancienne personnalisation peut encore pointer vers un compte de
    // charge (604x/618) malgré la migration. Ne jamais réintroduire ce modèle :
    // les avances pour un fournisseur membre restent dans la famille 409.
    const compteCreance = comptesCreanceConfigures.compteDebit.startsWith("409")
      ? comptesCreanceConfigures.compteDebit
      : "4091";
    if (compteCreance !== comptesCreanceConfigures.compteDebit) {
      logger.warn({
        cooperativeId,
        operation: operationCreance,
        compteConfigure: comptesCreanceConfigures.compteDebit,
        compteUtilise: compteCreance,
      }, "Compte incompatible ignoré pour une créance de charges membre");
    }
    // Les deux côtés de la récupération sont dérivés des écritures sources :
    // dette créée par l'achat et créance créée par l'avance. Les anciens
    // paramètres restent consultés uniquement pour signaler une incohérence.
    const comptesRetenueConfigures = await resolveComptes(
      cooperativeId,
      "receptions_membres_delegues",
      operationRetenue,
      compteDetteProducteur,
      compteCreance,
    );
    if (
      comptesRetenueConfigures.compteDebit !== compteDetteProducteur ||
      comptesRetenueConfigures.compteCredit !== compteCreance
    ) {
      logger.warn({
        cooperativeId,
        operation: operationRetenue,
        comptesConfigures: comptesRetenueConfigures,
        compteDetteUtilise: compteDetteProducteur,
        compteCreanceUtilise: compteCreance,
      }, "Comptes de retenue réalignés sur la dette et la créance membre");
    }
    promises.push(
      proposerEcriture(cooperativeId, {
        source: "livraison", sourceId: livraisonId,
        libelle: `${libelle} avancé – ${membreNom}`,
        compteDebit: compteCreance,
        compteCredit: comptesCreanceConfigures.compteCredit,
        montantFcfa: montantAvance, date: dateLivraison, numeroPiece: piece,
        tiersId: membreId, tiersType: "membre",
      }),
    );
    if (montantRetenu > 0) {
      promises.push(proposerEcriture(cooperativeId, {
        source: "livraison", sourceId: livraisonId,
        libelle: `Retenue ${libelle.toLowerCase()} – ${membreNom}`,
        compteDebit: compteDetteProducteur,
        compteCredit: compteCreance,
        montantFcfa: montantRetenu, date: dateLivraison, numeroPiece: piece,
        tiersId: membreId, tiersType: "membre",
      }));
    }
  };

  await ajouterChargeBon(
    fraisCarburantAvanceFcfa,
    fraisCarburantRetenusFcfa,
    "Carburant",
    "frais_carburant",
    "retenue_carburant",
  );
  await ajouterChargeBon(
    autresChargesAvanceFcfa,
    autresChargesRetenuesFcfa,
    params.autresChargesLibelle?.trim() || "Autres charges",
    "autres_charges",
    "retenue_autres_charges",
  );

  // ── Déduction avance (401 / 4091) — membres seulement ───────────────────────
  if (avanceImputableFcfa > 0 && membreId) {
    const c = await resolveComptes(cooperativeId, "avances", "remboursement_avance", "401", "4091");
    if (c.compteDebit !== compteDetteProducteur) {
      logger.warn({
        cooperativeId,
        operation: "remboursement_avance",
        compteConfigure: c.compteDebit,
        compteUtilise: compteDetteProducteur,
      }, "Compte de remboursement d'avance réaligné sur la dette producteur");
    }
    promises.push(proposerEcriture(cooperativeId, {
      source: "livraison", sourceId: livraisonId,
      libelle: `Déduction avance sur livraison – ${membreNom}`,
      compteDebit: compteDetteProducteur, compteCredit: c.compteCredit,
      montantFcfa: avanceImputableFcfa, date: dateLivraison, numeroPiece: piece,
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
  modePaiement?: "especes" | "mobile" | "banque";
}) {
  // Le mode de paiement indique quel actif diminue au décaissement.
  // 571 = caisse, 552 = Mobile Money/Marchand, 521 = banque.
  const compteCreditParMode: Record<NonNullable<typeof params.modePaiement>, string> = {
    especes: "571",
    mobile: "552",
    banque: "521",
  };
  const c = await resolveComptes(cooperativeId, "avances", "octroi_avance_producteur", "4091", "521");
  const compteCredit = params.modePaiement
    ? compteCreditParMode[params.modePaiement]
    : c.compteCredit;
  await proposerEcriture(cooperativeId, {
    source: "avance", sourceId: params.avanceId,
    libelle: `Avance octroyée – ${params.membreNom}`,
    compteDebit: c.compteDebit, compteCredit,
    montantFcfa: params.montantFcfa, date: params.dateOctroi,
    numeroPiece: `AVA-${params.avanceId}`,
    tiersId: params.membreId, tiersType: "membre",
  });
}

/**
 * Avance octroyée à un délégué de localité.
 *
 *   Débit  4098 Avances et acomptes agents/délégués
 *   Crédit  571 Caisse (décaissement espèces)
 *
 * Les comptes peuvent être configurés par la coopérative via
 * parametres_comptes_modules (module: "avances_delegues", operation: "octroi_avance_delegue").
 */
export async function generateEcrituresAvanceDelegue(cooperativeId: number, params: {
  avanceId: number;
  delegueId?: number;
  delegueNom: string;
  montantFcfa: number;
  dateOctroi: string;
}) {
  const c = await resolveComptes(cooperativeId, "avances_delegues", "octroi_avance_delegue", "4098", "571");
  await proposerEcriture(cooperativeId, {
    source: "avance", sourceId: params.avanceId,
    libelle: `Avance délégué – ${params.delegueNom}`,
    compteDebit: c.compteDebit, compteCredit: c.compteCredit,
    montantFcfa: params.montantFcfa, date: params.dateOctroi,
    numeroPiece: `AVD-${params.avanceId}`,
    tiersId: params.delegueId, tiersType: "delegue",
  });
}

/**
 * Vente exportateur
 */
export async function generateEcrituresVente(cooperativeId: number, params: {
  venteId: number;
  exportateurId?: number;
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
    tiersId: params.exportateurId, tiersType: params.exportateurId ? "exportateur" : undefined,
  });
}

/**
 * Encaissement exportateur
 */
export async function generateEcrituresEncaissement(cooperativeId: number, params: {
  venteId: number;
  exportateurId?: number;
  exportateurNom: string;
  montantFcfa: number;
  date: string;
  compteDebit?: string;
}) {
  const c = await resolveComptes(cooperativeId, "ventes_export", "encaissement_exportateur", params.compteDebit ?? "521", "4111");
  await proposerEcriture(cooperativeId, {
    source: "encaissement", sourceId: params.venteId,
    libelle: `Encaissement exportateur – ${params.exportateurNom}`,
    compteDebit: c.compteDebit, compteCredit: c.compteCredit,
    montantFcfa: params.montantFcfa, date: params.date,
    numeroPiece: `ENC-${params.venteId}`,
    tiersId: params.exportateurId, tiersType: params.exportateurId ? "exportateur" : undefined,
  });
}

export async function generateEcrituresEncaissementDansTransaction(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  params: {
    venteId: number;
    exportateurId?: number;
    exportateurNom: string;
    montantFcfa: number;
    date: string;
    compteDebit: string;
    compteCredit?: string;
    libelle?: string;
  },
): Promise<void> {
  await proposerEcrituresDansTransaction(tx, cooperativeId, [{
    source: "encaissement",
    sourceId: params.venteId,
    libelle: params.libelle ?? `Encaissement exportateur – ${params.exportateurNom}`,
    compteDebit: params.compteDebit,
    compteCredit: params.compteCredit ?? "4111",
    montantFcfa: params.montantFcfa,
    date: params.date,
    numeroPiece: `ENC-${params.venteId}-${params.compteDebit}`,
    tiersId: params.exportateurId,
    tiersType: params.exportateurId ? "exportateur" : undefined,
  }]);
}

/**
 * Paiement bulletin de salaire.
 * Le compteCredit du versement net est passé par l'appelant (mode de paiement).
 */
export async function generateEcrituresSalaire(cooperativeId: number, params: {
  bulletinId: number;
  personnelNom: string;
  personnelId?: number;
  salaireNetFcfa: number;
  salaireBrutFcfa: number;
  cotisationsSalarieFcfa: number;
  datePaiement: string;
  compteCredit?: string;
}) {
  const { bulletinId, personnelNom, personnelId, salaireNetFcfa, salaireBrutFcfa, cotisationsSalarieFcfa, datePaiement, compteCredit = "521" } = params;
  const piece = `SAL-${bulletinId}`;
  const tiers = personnelId ? { tiersId: personnelId, tiersType: "personnel" as const } : {};

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
      ...tiers,
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
  personnelId?: number;
  salaireNetFcfa: number;
  salaireBrutFcfa: number;
  cotisationsSalarieFcfa: number;
  datePaiement: string;
  compteCredit?: string;
}) {
  const { bulletinId, personnelNom, personnelId, salaireNetFcfa, salaireBrutFcfa, cotisationsSalarieFcfa, datePaiement, compteCredit = "521" } = params;
  const piece = `SAL-${bulletinId}`;
  const exercice = new Date(datePaiement).getFullYear();

  const [cBrut, cNet, cCotis] = await Promise.all([
    resolveComptes(cooperativeId, "salaires", "salaire_brut", "661", "421"),
    resolveComptes(cooperativeId, "salaires", "paiement_salaire", "421", compteCredit),
    resolveComptes(cooperativeId, "salaires", "cotisations_salarie", "431", "421"),
  ]);

  async function inserer(libelle: string, d: string, cr: string, montantFcfa: number, extraTiers?: { tiersId: number; tiersType: string }) {
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
      tiersId: extraTiers?.tiersId ?? null,
      tiersType: extraTiers?.tiersType ?? null,
    }).returning({ id: ecrituresComptablesTable.id });
    if (inserted) await assignerNumeroPiece(inserted.id, "salaire", exercice, cooperativeId);
  }

  const tiersArg = personnelId ? { tiersId: personnelId, tiersType: "personnel" } : undefined;
  const taches = [
    inserer(`Charge de personnel – ${personnelNom}`, cBrut.compteDebit, cBrut.compteCredit, salaireBrutFcfa),
    inserer(`Versement salaire net – ${personnelNom}`, cNet.compteDebit, compteCredit, salaireNetFcfa, tiersArg),
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

export async function generateEcrituresCommissionDansTransaction(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  params: Parameters<typeof generateEcrituresCommission>[1],
): Promise<void> {
  const { delegueId, delegueNom, montantFcfa, modePaiement, date, nbCommissions } = params;
  const mode = modePaiement.toLowerCase();
  const compteCredit = MODES_MOBILE_MARCHAND.has(mode) ? "554"
    : MODES_CAISSE.has(mode) ? "571"
    : "521";
  const compteDebit = await resolveCompteDebit(cooperativeId, "commissions_delegues", "paiement_commission", "6322");

  await proposerEcrituresDansTransaction(tx, cooperativeId, [{
    source: "commission_delegue",
    sourceId: delegueId,
    libelle: `Commission délégué – ${delegueNom} (${nbCommissions} livraison${nbCommissions > 1 ? "s" : ""})`,
    compteDebit,
    compteCredit,
    montantFcfa,
    date,
    numeroPiece: `COM-${delegueId}-${date}`,
    tiersId: delegueId,
    tiersType: "delegue",
  }]);
}

/**
 * Alimentation de la caisse d'un délégué depuis la caisse principale.
 * SYSCOHADA :
 *   Débit  571 Caisse déléguée (sous-caisse terrain)
 *   Crédit 521 Banque / caisse principale coopérative
 *
 * Représente un reclassement d'actif : les fonds sortent de la caisse
 * centrale (521) et entrent dans la sous-caisse terrain (571).
 */
export async function generateEcrituresAlimentationCaisse(
  cooperativeId: number,
  params: {
    /** ID of the mouvements_caisse row recorded on the source caisse — used for reconciliation. */
    mouvementSourceId: number;
    delegueId: number;
    delegueNom: string;
    montantFcfa: number;
    date: string;
  },
): Promise<void> {
  const { mouvementSourceId, delegueId, delegueNom, montantFcfa, date } = params;
  const c = await resolveComptes(
    cooperativeId,
    "delegues",
    "alimentation_caisse_delegue",
    "571",
    "521",
  );
  await proposerEcriture(cooperativeId, {
    source: "caisse",
    sourceId: mouvementSourceId,
    libelle: `Alimentation caisse délégué – ${delegueNom}`,
    compteDebit: c.compteDebit,
    compteCredit: c.compteCredit,
    montantFcfa,
    date,
    numeroPiece: `ALIM-DEL-${delegueId}-${date}`,
    tiersId: delegueId,
    tiersType: "delegue",
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

/** Variante atomique du paiement de prime : aucune écriture ne sort de tx. */
export async function generateEcrituresPrimePaiementDansTransaction(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  params: Parameters<typeof generateEcrituresPrimePaiement>[1],
): Promise<void> {
  const { primeMembreId, membreNom, montantFcfa, modePaiement, date } = params;
  const mode = modePaiement.toLowerCase();
  const compteCredit = MODES_MOBILE_MARCHAND.has(mode) ? "554"
    : MODES_CAISSE.has(mode) ? "571"
    : "521";
  const compteDebit = await resolveCompteDebit(cooperativeId, "primes", "paiement_prime", "6018");

  await proposerEcrituresDansTransaction(tx, cooperativeId, [{
    source: "prime_paiement",
    sourceId: primeMembreId,
    libelle: `Prime producteur – ${membreNom}`,
    compteDebit,
    compteCredit,
    montantFcfa,
    date,
    numeroPiece: `PRM-PAY-${primeMembreId}`,
    tiersId: params.membreId,
    tiersType: "membre",
  }]);
}
