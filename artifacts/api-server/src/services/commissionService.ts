/**
 * Service de gestion des commissions délégués.
 *
 * Option A : la commission est attribuée au délégué du membre (membres.delegue_id),
 * quel que soit l'agent qui a saisi la livraison.
 *
 * Priorité de résolution du taux :
 *   1. (cooperative_id + campagne_id + delegue_id) — taux personnalisé pour ce délégué cette campagne
 *   2. (cooperative_id + campagne_id)              — taux campagne par défaut (delegue_id IS NULL)
 *   3. (cooperative_id)                            — taux global de la coop (campagne_id IS NULL)
 */

import { db } from "@workspace/db";
import {
  tauxCommissionsDeleguesTable,
  commissionsDeleguesTable,
  caissesTable,
  mouvementsCaisseTable,
  comptesMobilesMarchandsTable,
  mouvementsMobileMarchandTable,
  comptesBancairesTable,
  mouvementsBanqueTable,
  chequesEmisTable,
  usersTable,
  campagnesTable,
  transfertsStockTable,
  avancesDeleguesTable,
  remboursementsAvancesDeleguesTable,
} from "@workspace/db";
import { and, eq, isNull, or, desc, inArray, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { generateEcrituresCommission } from "./comptabiliteService.js";

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

// ─── Résolution du taux actif ─────────────────────────────────────────────

export async function getTauxActif(
  cooperativeId: number,
  campagneId: number | null | undefined,
  delegueId: number
): Promise<{ id: number; tauxFcfaParKg: number } | null> {
  const today = new Date().toISOString().slice(0, 10);

  // Chercher tous les taux actifs pour cette coopérative, non expirés
  const candidats = await db
    .select()
    .from(tauxCommissionsDeleguesTable)
    .where(
      and(
        eq(tauxCommissionsDeleguesTable.cooperativeId, cooperativeId),
        eq(tauxCommissionsDeleguesTable.actif, true),
        sql`${tauxCommissionsDeleguesTable.dateDebut} <= ${today}`,
        or(
          isNull(tauxCommissionsDeleguesTable.dateFin),
          sql`${tauxCommissionsDeleguesTable.dateFin} >= ${today}`
        )
      )
    );

  // Priorité 1 : taux spécifique (coop + campagne + délégué)
  if (campagneId) {
    const exact = candidats.find(
      (t) => t.campagneId === campagneId && t.delegueId === delegueId
    );
    if (exact) return { id: exact.id, tauxFcfaParKg: toNum(exact.tauxFcfaParKg) };

    // Priorité 2 : taux campagne par défaut (coop + campagne, delegue_id NULL)
    const parCampagne = candidats.find(
      (t) => t.campagneId === campagneId && t.delegueId === null
    );
    if (parCampagne) return { id: parCampagne.id, tauxFcfaParKg: toNum(parCampagne.tauxFcfaParKg) };
  }

  // Priorité 3 : taux global coop (campagne_id NULL, delegue_id NULL)
  const global = candidats.find(
    (t) => t.campagneId === null && t.delegueId === null
  );
  if (global) return { id: global.id, tauxFcfaParKg: toNum(global.tauxFcfaParKg) };

  return null;
}

// ─── Création d'une commission après livraison ────────────────────────────

/**
 * Appelé après chaque livraison terrain (fire-and-forget acceptable).
 * Retourne le montant FCFA calculé, ou null si aucun taux configuré.
 */
export async function creerCommissionSiTaux(
  livraisonId: number,
  delegueId: number,
  campagneId: number | null | undefined,
  poidsKg: number,
  cooperativeId: number
): Promise<number | null> {
  try {
    const taux = await getTauxActif(cooperativeId, campagneId, delegueId);
    if (!taux) return null;

    const montant = Math.round(poidsKg * taux.tauxFcfaParKg * 100) / 100;
    if (montant <= 0) return null;

    await db.insert(commissionsDeleguesTable).values({
      delegueId,
      livraisonId,
      campagneId: campagneId ?? undefined,
      tauxFcfaParKg: String(taux.tauxFcfaParKg),
      poidsKg: String(poidsKg),
      montantFcfa: String(montant),
      statut: "en_attente",
    });

    return montant;
  } catch (err) {
    logger.error({ err, livraisonId, delegueId }, "Erreur création commission délégué");
    return null;
  }
}

/**
 * Crée une commission sur le poids net confirmé après pesée physique au magasin central.
 * Appelé après la confirmation d'un transfert (terminerSession), fire-and-forget acceptable.
 * Aucune commission si statut = litige (poids contesté).
 */
export async function creerCommissionTransfert(
  transfertId: number,
  delegueId: number,
  campagneId: number | null | undefined,
  poidsKg: number,
  cooperativeId: number
): Promise<number | null> {
  try {
    const taux = await getTauxActif(cooperativeId, campagneId, delegueId);
    if (!taux) return null;

    const montantBrut = Math.round(poidsKg * taux.tauxFcfaParKg * 100) / 100;
    if (montantBrut <= 0) return null;

    // Récupérer les charges de transport du transfert.
    // Seules les charges "cooperative" sont déduites de la commission —
    // les charges "delegue" sont à sa charge personnelle, sans impact sur la commission.
    const [transfert] = await db
      .select({
        fraisCarburantFcfa: transfertsStockTable.fraisCarburantFcfa,
        fraisCarburantPar:  transfertsStockTable.fraisCarburantPar,
        autresChargesFcfa:  transfertsStockTable.autresChargesFcfa,
        autresChargesPar:   transfertsStockTable.autresChargesPar,
      })
      .from(transfertsStockTable)
      .where(eq(transfertsStockTable.id, transfertId))
      .limit(1);

    const carburantDeductible =
      transfert?.fraisCarburantPar === "cooperative" ? (transfert.fraisCarburantFcfa ?? 0) : 0;
    const autresDeductible =
      transfert?.autresChargesPar === "cooperative" ? (transfert.autresChargesFcfa ?? 0) : 0;
    const chargesDéduites = carburantDeductible + autresDeductible;

    const montantNet = Math.max(0, montantBrut - chargesDéduites);

    // Si les charges absorbent toute la commission, on enregistre quand même
    // à 0 pour la traçabilité (le délégué a travaillé mais les charges couvrent tout)
    await db.insert(commissionsDeleguesTable).values({
      delegueId,
      livraisonId: null,
      transfertId,
      campagneId: campagneId ?? undefined,
      tauxFcfaParKg: String(taux.tauxFcfaParKg),
      poidsKg: String(poidsKg),
      montantBrutFcfa: String(montantBrut),
      chargesDeduitesFcfa: chargesDéduites > 0 ? chargesDéduites : null,
      montantFcfa: String(montantNet),
      statut: "en_attente",
    });

    logger.info(
      { transfertId, delegueId, poidsKg, montantBrut, chargesDéduites, montantNet },
      "Commission transfert créée"
    );
    return montantNet;
  } catch (err) {
    logger.error({ err, transfertId, delegueId }, "Erreur création commission transfert");
    return null;
  }
}

// ─── Moyens de paiement acceptés ─────────────────────────────────────────

export const MODES_PAIEMENT_COMMISSION = [
  "especes",
  "orange_money",
  "mtn_momo",
  "wave",
  "virement",
  "cheque",
] as const;

export type ModePaiementCommission = typeof MODES_PAIEMENT_COMMISSION[number];

// ─── Paiement des commissions en lot ─────────────────────────────────────

/**
 * Enregistre le paiement des commissions en_attente d'un délégué
 * via le moyen de paiement choisi (espèces, virement, chèque, mobile money…).
 * Si commissionIds est fourni, ne paye que celles-là ; sinon toutes.
 */
export async function payerCommissions(
  delegueId: number,
  cooperativeId: number,
  modePaiement: ModePaiementCommission,
  commissionIds?: number[],
  referencePaiement?: string
): Promise<{ montantTotal: number; nb: number }> {
  // Récupérer les commissions en attente
  const whereClause = commissionIds?.length
    ? and(
        eq(commissionsDeleguesTable.delegueId, delegueId),
        eq(commissionsDeleguesTable.statut, "en_attente"),
        inArray(commissionsDeleguesTable.id, commissionIds)
      )
    : and(
        eq(commissionsDeleguesTable.delegueId, delegueId),
        eq(commissionsDeleguesTable.statut, "en_attente")
      );

  const commissions = await db
    .select()
    .from(commissionsDeleguesTable)
    .where(whereClause);

  if (commissions.length === 0) return { montantTotal: 0, nb: 0 };

  const montantTotal = commissions.reduce((s, c) => s + toNum(c.montantFcfa), 0);

  // Nom du délégué — utilisé pour le chèque et l'écriture comptable
  const [delegueRow] = await db
    .select({ nom: usersTable.nom, prenoms: usersTable.prenoms })
    .from(usersTable)
    .where(eq(usersTable.id, delegueId))
    .limit(1);
  const delegueNom = delegueRow
    ? `${delegueRow.prenoms ?? ""} ${delegueRow.nom}`.trim()
    : `Délégué #${delegueId}`;

  const today = new Date().toISOString().slice(0, 10);
  const libelleMvt = `Paiement commissions délégué (${commissions.length} livraison${commissions.length > 1 ? "s" : ""})`;

  // ── Avances en cours du délégué (pour retenue automatique) ───────────────
  const avancesEnCours = await db
    .select()
    .from(avancesDeleguesTable)
    .where(and(
      eq(avancesDeleguesTable.delegueId, delegueId),
      eq(avancesDeleguesTable.cooperativeId, cooperativeId),
      inArray(avancesDeleguesTable.statut, ["en_cours", "en_retard"] as const),
    ))
    .orderBy(avancesDeleguesTable.createdAt);

  // ── Transaction atomique : marquer payé + débiter le compte ──────────────
  // Si le débit échoue (solde insuffisant, compte manquant…), le statut des
  // commissions est automatiquement rollbacké à "en_attente".
  await db.transaction(async (tx) => {
    // 1. Marquer les commissions comme payées
    await tx
      .update(commissionsDeleguesTable)
      .set({
        statut: "payé",
        datePaiement: new Date(),
        modePaiement,
        referencePaiement: referencePaiement ?? null,
      })
      .where(inArray(commissionsDeleguesTable.id, commissions.map((c) => c.id)));

    // 2. Débiter la source de financement selon le mode de paiement

    // ── Espèces → caisse centrale ───────────────────────────────────────────
    if (modePaiement === "especes") {
      const [caisse] = await tx
        .select({ id: caissesTable.id, solde: caissesTable.soldeActuelFcfa })
        .from(caissesTable)
        .where(
          and(
            eq(caissesTable.cooperativeId, cooperativeId),
            eq(caissesTable.typeCaisse, "centrale"),
            eq(caissesTable.actif, true),
          )
        )
        .limit(1);

      if (!caisse) {
        throw new Error("Aucune caisse centrale active trouvée. Créez ou activez une caisse principale avant de payer des commissions en espèces.");
      }

      const nouveauSolde = toNum(caisse.solde) - montantTotal;
      await tx.update(caissesTable)
        .set({ soldeActuelFcfa: String(nouveauSolde) })
        .where(eq(caissesTable.id, caisse.id));
      await tx.insert(mouvementsCaisseTable).values({
        caisseId:       caisse.id,
        cooperativeId,
        type:           "sortie",
        motif:          "commission_delegue",
        montantFcfa:    String(montantTotal),
        libelle:        libelleMvt,
        soldeApresFcfa: String(nouveauSolde),
      });
    }

    // ── Mobile money → compte marchand ─────────────────────────────────────
    const OPERATEURS_MOBILE = ["wave", "orange_money", "mtn_momo"] as const;
    type OperateurMobile = typeof OPERATEURS_MOBILE[number];

    if (OPERATEURS_MOBILE.includes(modePaiement as OperateurMobile)) {
      const operateur = modePaiement as OperateurMobile;

      const [compte] = await tx
        .select({ id: comptesMobilesMarchandsTable.id, solde: comptesMobilesMarchandsTable.soldeActuelFcfa, nom: comptesMobilesMarchandsTable.nom })
        .from(comptesMobilesMarchandsTable)
        .where(
          and(
            eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
            eq(comptesMobilesMarchandsTable.operateur, operateur),
            eq(comptesMobilesMarchandsTable.actif, true),
          )
        )
        .limit(1);

      if (!compte) {
        throw new Error(`Aucun compte marchand ${operateur.replace("_", " ")} actif trouvé. Créez-en un dans le module Mobile Marchand avant de payer via ce canal.`);
      }

      const soldeActuel = toNum(compte.solde);
      if (soldeActuel < montantTotal) {
        throw new Error(`Solde insuffisant sur le compte ${compte.nom} — disponible : ${soldeActuel.toLocaleString("fr-FR")} FCFA, requis : ${montantTotal.toLocaleString("fr-FR")} FCFA.`);
      }

      const nouveauSolde = soldeActuel - montantTotal;
      await tx.update(comptesMobilesMarchandsTable)
        .set({ soldeActuelFcfa: String(nouveauSolde) })
        .where(eq(comptesMobilesMarchandsTable.id, compte.id));

      await tx.insert(mouvementsMobileMarchandTable).values({
        compteId:       compte.id,
        cooperativeId,
        type:           "debit",
        motif:          "commission_delegue",
        montantFcfa:    String(montantTotal),
        libelle:        libelleMvt,
        reference:      referencePaiement ?? null,
        dateOperation:  today,
        soldeApresFcfa: String(nouveauSolde),
      });
    }

    // ── Virement / Chèque → compte bancaire ────────────────────────────────
    if (modePaiement === "virement" || modePaiement === "cheque") {
      const [compte] = await tx
        .select({
          id:    comptesBancairesTable.id,
          solde: comptesBancairesTable.soldeActuelFcfa,
          nom:   comptesBancairesTable.nom,
        })
        .from(comptesBancairesTable)
        .where(
          and(
            eq(comptesBancairesTable.cooperativeId, cooperativeId),
            eq(comptesBancairesTable.actif, true),
          )
        )
        .limit(1);

      if (!compte) {
        throw new Error(
          "Aucun compte bancaire actif trouvé. Créez ou activez un compte bancaire avant de payer des commissions par virement ou chèque."
        );
      }

      const soldeActuel = toNum(compte.solde);
      if (soldeActuel < montantTotal) {
        throw new Error(
          `Solde insuffisant sur le compte ${compte.nom} — disponible : ${soldeActuel.toLocaleString("fr-FR")} FCFA, requis : ${montantTotal.toLocaleString("fr-FR")} FCFA.`
        );
      }

      const nouveauSolde = soldeActuel - montantTotal;
      await tx
        .update(comptesBancairesTable)
        .set({ soldeActuelFcfa: String(nouveauSolde) })
        .where(eq(comptesBancairesTable.id, compte.id));

      const [mvt] = await tx
        .insert(mouvementsBanqueTable)
        .values({
          compteId:       compte.id,
          cooperativeId,
          type:           "debit",
          motif:          "commission_delegue",
          montantFcfa:    String(montantTotal),
          libelle:        libelleMvt,
          reference:      referencePaiement ?? null,
          dateOperation:  today,
          soldeApresFcfa: String(nouveauSolde),
        })
        .returning({ id: mouvementsBanqueTable.id });

      if (modePaiement === "cheque") {
        await tx.insert(chequesEmisTable).values({
          cooperativeId,
          numeroCheque:     referencePaiement ?? null,
          beneficiaire:     delegueNom,
          montantFcfa:      montantTotal,
          compteBancaireId: compte.id,
          dateEmission:     today,
          statut:           "emis",
          mouvementBanqueId: mvt?.id ?? null,
        });
      }
    }

    // 3. Retenue automatique sur avances du délégué ─────────────────────────
    for (const avance of avancesEnCours) {
      if (avance.statut === "rembourse") continue;
      let retenueFcfa: number;
      if (avance.planType === "integral") {
        retenueFcfa = avance.soldeRestantFcfa;
      } else if (avance.planType === "partiel" && avance.montantPartielFcfa) {
        retenueFcfa = Math.min(avance.montantPartielFcfa, avance.soldeRestantFcfa);
      } else if (avance.planType === "reporte") {
        // Reporté sans date → jamais de retenue automatique
        // Reporté avec date → reprend la retenue intégrale dès que la date est atteinte
        if (!avance.reportDate || today < String(avance.reportDate)) continue;
        retenueFcfa = avance.soldeRestantFcfa;
      } else {
        continue;
      }
      if (retenueFcfa <= 0) continue;

      const nouveauSolde     = avance.soldeRestantFcfa - retenueFcfa;
      const nouveauRembourse = avance.montantRembourse + retenueFcfa;
      const nouveauStatut    = nouveauSolde === 0 ? "rembourse" : "en_cours";

      await tx.update(avancesDeleguesTable).set({
        montantRembourse: nouveauRembourse,
        soldeRestantFcfa: nouveauSolde,
        statut:           nouveauStatut as "en_cours" | "rembourse" | "en_retard",
      }).where(eq(avancesDeleguesTable.id, avance.id));

      await tx.insert(remboursementsAvancesDeleguesTable).values({
        avanceId:     avance.id,
        commissionId: commissions[0]?.id ?? null,
        montantFcfa:  retenueFcfa,
        note:         `Retenue automatique — paiement commissions du ${today}`,
      });
    }
  }); // fin transaction

  // ── Écriture comptable OHADA (fire-and-forget, hors transaction) ──────────
  // 6625 Commissions versées / 571 Caisse | 554 Mobile | 521 Banque
  generateEcrituresCommission(cooperativeId, {
    delegueId,
    delegueNom,
    montantFcfa: montantTotal,
    modePaiement,
    date: today,
    nbCommissions: commissions.length,
  }).catch((err) =>
    logger.error({ err, delegueId, cooperativeId }, "Erreur écriture comptable commission délégué")
  );

  return { montantTotal, nb: commissions.length };
}

// ─── Lecture des commissions d'un délégué (admin) ────────────────────────

export async function getCommissionsDelegue(
  delegueId: number,
  cooperativeId: number,
  campagneId?: number
) {
  const rows = await db
    .select({
      id:           commissionsDeleguesTable.id,
      livraisonId:  commissionsDeleguesTable.livraisonId,
      campagneId:   commissionsDeleguesTable.campagneId,
      tauxFcfaParKg: commissionsDeleguesTable.tauxFcfaParKg,
      poidsKg:      commissionsDeleguesTable.poidsKg,
      montantFcfa:  commissionsDeleguesTable.montantFcfa,
      statut:       commissionsDeleguesTable.statut,
      datePaiement: commissionsDeleguesTable.datePaiement,
      createdAt:    commissionsDeleguesTable.createdAt,
    })
    .from(commissionsDeleguesTable)
    .where(
      and(
        eq(commissionsDeleguesTable.delegueId, delegueId),
        campagneId ? eq(commissionsDeleguesTable.campagneId, campagneId) : undefined
      )
    )
    .orderBy(desc(commissionsDeleguesTable.createdAt));

  const totaux = {
    enAttente: rows.filter((r) => r.statut === "en_attente").reduce((s, r) => s + toNum(r.montantFcfa), 0),
    paye: rows.filter((r) => r.statut === "payé").reduce((s, r) => s + toNum(r.montantFcfa), 0),
    total: rows.reduce((s, r) => s + toNum(r.montantFcfa), 0),
  };

  return { commissions: rows, totaux };
}

// ─── Résumé des commissions (pour l'accueil terrain délégué) ─────────────

export async function getResumeMesCommissions(
  delegueId: number,
  campagneId?: number
) {
  // Filtre de base : toujours ce délégué, + campagne si fournie
  const baseWhere = campagneId
    ? and(
        eq(commissionsDeleguesTable.delegueId, delegueId),
        eq(commissionsDeleguesTable.campagneId, campagneId)
      )
    : eq(commissionsDeleguesTable.delegueId, delegueId);

  // Totaux (filtrés)
  const [row] = await db
    .select({
      enAttente: sql<string>`COALESCE(SUM(CASE WHEN ${commissionsDeleguesTable.statut} = 'en_attente' THEN ${commissionsDeleguesTable.montantFcfa} ELSE 0 END), 0)`,
      paye:      sql<string>`COALESCE(SUM(CASE WHEN ${commissionsDeleguesTable.statut} = 'payé'     THEN ${commissionsDeleguesTable.montantFcfa} ELSE 0 END), 0)`,
      total:     sql<string>`COALESCE(SUM(${commissionsDeleguesTable.montantFcfa}), 0)`,
      nb:        sql<number>`COUNT(*)`,
    })
    .from(commissionsDeleguesTable)
    .where(baseWhere);

  // 20 dernières (filtrées)
  const recentes = await db
    .select()
    .from(commissionsDeleguesTable)
    .where(baseWhere)
    .orderBy(desc(commissionsDeleguesTable.createdAt))
    .limit(20);

  // Liste des campagnes ayant au moins une commission pour ce délégué (pour le sélecteur)
  const campagnesRows = await db
    .selectDistinct({
      id:      campagnesTable.id,
      libelle: campagnesTable.libelle,
      anneeDebut: campagnesTable.anneeDebut,
      anneeFin:   campagnesTable.anneeFin,
      statut:     campagnesTable.statut,
    })
    .from(commissionsDeleguesTable)
    .innerJoin(
      campagnesTable,
      eq(campagnesTable.id, commissionsDeleguesTable.campagneId)
    )
    .where(eq(commissionsDeleguesTable.delegueId, delegueId))
    .orderBy(desc(campagnesTable.anneeDebut));

  return {
    enAttenteFcfa: toNum(row?.enAttente),
    payeFcfa:      toNum(row?.paye),
    totalFcfa:     toNum(row?.total),
    nb:            Number(row?.nb ?? 0),
    recentes,
    campagnes: campagnesRows,
  };
}

// ─── Gestion des taux (admin) ─────────────────────────────────────────────

export async function listTaux(cooperativeId: number) {
  const rows = await db
    .select({
      id:            tauxCommissionsDeleguesTable.id,
      cooperativeId: tauxCommissionsDeleguesTable.cooperativeId,
      campagneId:    tauxCommissionsDeleguesTable.campagneId,
      delegueId:     tauxCommissionsDeleguesTable.delegueId,
      tauxFcfaParKg: tauxCommissionsDeleguesTable.tauxFcfaParKg,
      dateDebut:     tauxCommissionsDeleguesTable.dateDebut,
      dateFin:       tauxCommissionsDeleguesTable.dateFin,
      actif:         tauxCommissionsDeleguesTable.actif,
      createdAt:     tauxCommissionsDeleguesTable.createdAt,
      // Enrichissement : nom de la campagne
      campagneLibelle: campagnesTable.libelle,
      // Enrichissement : nom du délégué
      delegueNom:    usersTable.nom,
      deleguePrenoms: usersTable.prenoms,
    })
    .from(tauxCommissionsDeleguesTable)
    .leftJoin(campagnesTable, eq(campagnesTable.id, tauxCommissionsDeleguesTable.campagneId))
    .leftJoin(usersTable, eq(usersTable.id, tauxCommissionsDeleguesTable.delegueId))
    .where(eq(tauxCommissionsDeleguesTable.cooperativeId, cooperativeId))
    .orderBy(desc(tauxCommissionsDeleguesTable.createdAt));

  return rows;
}

export async function upsertTaux(
  cooperativeId: number,
  data: {
    id?: number;
    campagneId?: number | null;
    delegueId?: number | null;
    tauxFcfaParKg: number;
    dateDebut: string;
    dateFin?: string | null;
    actif?: boolean;
  }
) {
  if (data.id) {
    const [updated] = await db
      .update(tauxCommissionsDeleguesTable)
      .set({
        campagneId:    data.campagneId ?? null,
        delegueId:     data.delegueId ?? null,
        tauxFcfaParKg: String(data.tauxFcfaParKg),
        dateDebut:     data.dateDebut,
        dateFin:       data.dateFin ?? null,
        actif:         data.actif ?? true,
        updatedAt:     new Date(),
      })
      .where(
        and(
          eq(tauxCommissionsDeleguesTable.id, data.id),
          eq(tauxCommissionsDeleguesTable.cooperativeId, cooperativeId)
        )
      )
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(tauxCommissionsDeleguesTable)
    .values({
      cooperativeId,
      campagneId:    data.campagneId ?? undefined,
      delegueId:     data.delegueId ?? undefined,
      tauxFcfaParKg: String(data.tauxFcfaParKg),
      dateDebut:     data.dateDebut,
      dateFin:       data.dateFin ?? undefined,
      actif:         data.actif ?? true,
    })
    .returning();
  return inserted;
}

export async function deleteTaux(id: number, cooperativeId: number) {
  await db
    .delete(tauxCommissionsDeleguesTable)
    .where(
      and(
        eq(tauxCommissionsDeleguesTable.id, id),
        eq(tauxCommissionsDeleguesTable.cooperativeId, cooperativeId)
      )
    );
}

// ─── Récapitulatif global pour la liste des délégués ─────────────────────

export async function getRecapCommissionsParDelegue(cooperativeId: number, campagneId?: number) {
  const rows = await db
    .select({
      delegueId:   commissionsDeleguesTable.delegueId,
      nom:         usersTable.nom,
      prenoms:     usersTable.prenoms,
      section:     usersTable.section,
      enAttente:   sql<string>`COALESCE(SUM(CASE WHEN ${commissionsDeleguesTable.statut} = 'en_attente' THEN ${commissionsDeleguesTable.montantFcfa} ELSE 0 END), 0)`,
      totalPaye:   sql<string>`COALESCE(SUM(CASE WHEN ${commissionsDeleguesTable.statut} = 'payé'     THEN ${commissionsDeleguesTable.montantFcfa} ELSE 0 END), 0)`,
      total:       sql<string>`COALESCE(SUM(${commissionsDeleguesTable.montantFcfa}), 0)`,
      nb:          sql<number>`COUNT(*)`,
    })
    .from(commissionsDeleguesTable)
    .innerJoin(usersTable, eq(usersTable.id, commissionsDeleguesTable.delegueId))
    .where(and(
      eq(usersTable.cooperativeId, cooperativeId),
      campagneId ? eq(commissionsDeleguesTable.campagneId, campagneId) : undefined,
    ))
    .groupBy(commissionsDeleguesTable.delegueId, usersTable.nom, usersTable.prenoms, usersTable.section)
    .orderBy(usersTable.nom);

  return rows.map(r => ({
    delegueId: r.delegueId,
    nom:         r.nom,
    prenoms:     r.prenoms,
    section:     r.section,
    enAttenteFcfa: toNum(r.enAttente),
    totalPayeFcfa: toNum(r.totalPaye),
    totalFcfa:   toNum(r.total),
    nb:          Number(r.nb),
  }));
}
