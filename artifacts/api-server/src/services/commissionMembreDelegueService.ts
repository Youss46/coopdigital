/**
 * Service de gestion des commissions pour les membres délégués de localités.
 *
 * Ces membres ont categorie_membre = 'délégué de localités' dans la table membres.
 * Ils reçoivent une commission sur le poids net de leurs livraisons à la pesée.
 *
 * Priorité de résolution du taux :
 *   1. (cooperative_id + campagne_id + membre_delegue_id) — taux personnalisé
 *   2. (cooperative_id + campagne_id)                     — taux campagne par défaut
 *   3. (cooperative_id)                                   — taux global de la coop
 */

import { db } from "@workspace/db";
import {
  tauxCommissionsMembresDeleguesTable,
  commissionsMembresDelaguesTable,
  membresTable,
  campagnesTable,
  avancesTable,
  remboursementsAvancesMembresTable,
  sessionsPeseeTable,
  bonsReceptionMembresDeleguesTable,
} from "@workspace/db";
import { and, eq, isNull, or, desc, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import {
  generateEcrituresCommissionDansTransaction,
  proposerEcrituresDansTransaction,
} from "./comptabiliteService.js";

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

const CATEGORIE_DELEGUE_LOCALITE = "délégué de localités";

// ─── Résolution du taux actif ─────────────────────────────────────────────

export async function getTauxActifMembre(
  cooperativeId: number,
  campagneId: number | null | undefined,
  membreDelegueId: number
): Promise<{ id: number; tauxFcfaParKg: number; frequencePaiement: "chaque_paiement" | "fin_campagne" } | null> {
  const today = new Date().toISOString().slice(0, 10);

  const candidats = await db
    .select()
    .from(tauxCommissionsMembresDeleguesTable)
    .where(
      and(
        eq(tauxCommissionsMembresDeleguesTable.cooperativeId, cooperativeId),
        eq(tauxCommissionsMembresDeleguesTable.actif, true),
        sql`${tauxCommissionsMembresDeleguesTable.dateDebut} <= ${today}`,
        or(
          isNull(tauxCommissionsMembresDeleguesTable.dateFin),
          sql`${tauxCommissionsMembresDeleguesTable.dateFin} >= ${today}`
        )
      )
    );

  // Priorité 1 : taux spécifique (coop + campagne + membre)
  if (campagneId) {
    const exact = candidats.find(
      (t) => t.campagneId === campagneId && t.membreDelegueId === membreDelegueId
    );
    if (exact) {
      return {
        id: exact.id,
        tauxFcfaParKg: toNum(exact.tauxFcfaParKg),
        frequencePaiement: exact.frequencePaiement,
      };
    }

    // Priorité 2 : taux campagne par défaut (coop + campagne, membre_delegue_id NULL)
    const parCampagne = candidats.find(
      (t) => t.campagneId === campagneId && t.membreDelegueId === null
    );
    if (parCampagne) {
      return {
        id: parCampagne.id,
        tauxFcfaParKg: toNum(parCampagne.tauxFcfaParKg),
        frequencePaiement: parCampagne.frequencePaiement,
      };
    }
  }

  // Priorité 3 : taux global coop (campagne_id NULL, membre_delegue_id NULL)
  const global = candidats.find(
    (t) => t.campagneId === null && t.membreDelegueId === null
  );
  if (global) {
    return {
      id: global.id,
      tauxFcfaParKg: toNum(global.tauxFcfaParKg),
      frequencePaiement: global.frequencePaiement,
    };
  }

  return null;
}

// ─── Création d'une commission après pesée ────────────────────────────────

/**
 * Appelé après clôture d'une session pesée si le membre est délégué de localités.
 * Retourne la commission créée, ou null si aucun taux configuré.
 */
export async function creerCommissionMembreSiTaux(
  sessionPeseeId: number,
  membreDelegueId: number,
  campagneId: number | null | undefined,
  poidsKg: number,
  cooperativeId: number
): Promise<{ id: number; montantFcfa: number } | null> {
  try {
    const taux = await getTauxActifMembre(cooperativeId, campagneId, membreDelegueId);
    if (!taux) return null;

    const montant = Math.round(poidsKg * taux.tauxFcfaParKg * 100) / 100;
    if (montant <= 0) return null;

    const [inserted] = await db
      .insert(commissionsMembresDelaguesTable)
      .values({
        membreDelegueId,
        sessionPeseeId,
        campagneId: campagneId ?? undefined,
        tauxFcfaParKg: String(taux.tauxFcfaParKg),
        poidsKg: String(poidsKg),
        montantFcfa: String(montant),
        frequencePaiement: taux.frequencePaiement,
        statut: "en_attente",
      })
      .returning();

    return inserted ? { id: inserted.id, montantFcfa: montant } : null;
  } catch (err) {
    logger.error({ err, sessionPeseeId, membreDelegueId }, "Erreur création commission membre délégué");
    return null;
  }
}

// ─── Gestion des taux ─────────────────────────────────────────────────────

export async function listTauxMembres(cooperativeId: number) {
  const rows = await db
    .select({
      taux: tauxCommissionsMembresDeleguesTable,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      campagneLibelle: campagnesTable.libelle,
    })
    .from(tauxCommissionsMembresDeleguesTable)
    .leftJoin(membresTable, eq(membresTable.id, tauxCommissionsMembresDeleguesTable.membreDelegueId))
    .leftJoin(campagnesTable, eq(campagnesTable.id, tauxCommissionsMembresDeleguesTable.campagneId))
    .where(eq(tauxCommissionsMembresDeleguesTable.cooperativeId, cooperativeId))
    .orderBy(desc(tauxCommissionsMembresDeleguesTable.createdAt));

  return rows.map((r) => ({
    ...r.taux,
    tauxFcfaParKg: toNum(r.taux.tauxFcfaParKg),
    membreNom: r.membreNom,
    membrePrenoms: r.membrePrenoms,
    campagneLibelle: r.campagneLibelle,
  }));
}

export async function upsertTauxMembre(
  cooperativeId: number,
  data: {
    id?: number;
    campagneId?: number | null;
    membreDelegueId?: number | null;
    tauxFcfaParKg: number;
    dateDebut: string;
    dateFin?: string | null;
    frequencePaiement?: "chaque_paiement" | "fin_campagne";
    actif?: boolean;
  }
) {
  if (data.id) {
    const [updated] = await db
      .update(tauxCommissionsMembresDeleguesTable)
      .set({
        campagneId: data.campagneId ?? null,
        membreDelegueId: data.membreDelegueId ?? null,
        tauxFcfaParKg: String(data.tauxFcfaParKg),
        dateDebut: data.dateDebut,
        dateFin: data.dateFin ?? null,
        frequencePaiement: data.frequencePaiement ?? "chaque_paiement",
        actif: data.actif ?? true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tauxCommissionsMembresDeleguesTable.id, data.id),
          eq(tauxCommissionsMembresDeleguesTable.cooperativeId, cooperativeId)
        )
      )
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(tauxCommissionsMembresDeleguesTable)
    .values({
      cooperativeId,
      campagneId: data.campagneId ?? null,
      membreDelegueId: data.membreDelegueId ?? null,
      tauxFcfaParKg: String(data.tauxFcfaParKg),
      dateDebut: data.dateDebut,
      dateFin: data.dateFin ?? null,
      frequencePaiement: data.frequencePaiement ?? "chaque_paiement",
      actif: data.actif ?? true,
    })
    .returning();
  return inserted;
}

export async function deleteTauxMembre(id: number, cooperativeId: number) {
  await db
    .delete(tauxCommissionsMembresDeleguesTable)
    .where(
      and(
        eq(tauxCommissionsMembresDeleguesTable.id, id),
        eq(tauxCommissionsMembresDeleguesTable.cooperativeId, cooperativeId)
      )
    );
}

// ─── Récapitulatif global par membre délégué ──────────────────────────────

export async function getRecapCommissionsParMembreDelegue(
  cooperativeId: number,
  campagneId?: number
) {
  const rows = await db
    .select({
      membreId:  commissionsMembresDelaguesTable.membreDelegueId,
      nom:       membresTable.nom,
      prenoms:   membresTable.prenoms,
      section:   membresTable.section,
      village:   membresTable.village,
      enAttente: sql<string>`COALESCE(SUM(CASE WHEN ${commissionsMembresDelaguesTable.statut} = 'en_attente' THEN ${commissionsMembresDelaguesTable.montantFcfa} ELSE 0 END), 0)`,
      totalPaye: sql<string>`COALESCE(SUM(CASE WHEN ${commissionsMembresDelaguesTable.statut} = 'payé' THEN ${commissionsMembresDelaguesTable.montantFcfa} ELSE 0 END), 0)`,
      total:     sql<string>`COALESCE(SUM(${commissionsMembresDelaguesTable.montantFcfa}), 0)`,
      nb:        sql<number>`COUNT(*)`,
    })
    .from(commissionsMembresDelaguesTable)
    .innerJoin(membresTable, eq(membresTable.id, commissionsMembresDelaguesTable.membreDelegueId))
    .where(
      and(
        eq(membresTable.cooperativeId, cooperativeId),
        eq(membresTable.categorieMembre, CATEGORIE_DELEGUE_LOCALITE),
        campagneId ? eq(commissionsMembresDelaguesTable.campagneId, campagneId) : undefined
      )
    )
    .groupBy(
      commissionsMembresDelaguesTable.membreDelegueId,
      membresTable.nom,
      membresTable.prenoms,
      membresTable.section,
      membresTable.village,
    )
    .orderBy(membresTable.nom);

  return rows.map((r) => ({
    membreId:        r.membreId,
    nom:             r.nom,
    prenoms:         r.prenoms,
    section:         r.section,
    village:         r.village,
    enAttenteFcfa:   toNum(r.enAttente),
    totalPayeFcfa:   toNum(r.totalPaye),
    totalFcfa:       toNum(r.total),
    nb:              Number(r.nb),
  }));
}

// ─── Commissions d'un membre délégué précis ───────────────────────────────

export async function getCommissionsMembreDelegue(
  membreDelegueId: number,
  cooperativeId: number,
  campagneId?: number
) {
  // Vérifier que le membre appartient bien à la coopérative
  const [membre] = await db
    .select({ id: membresTable.id })
    .from(membresTable)
    .where(
      and(
        eq(membresTable.id, membreDelegueId),
        eq(membresTable.cooperativeId, cooperativeId),
        eq(membresTable.categorieMembre, CATEGORIE_DELEGUE_LOCALITE)
      )
    )
    .limit(1);

  if (!membre) return [];

  const rows = await db
    .select()
    .from(commissionsMembresDelaguesTable)
    .where(
      and(
        eq(commissionsMembresDelaguesTable.membreDelegueId, membreDelegueId),
        campagneId ? eq(commissionsMembresDelaguesTable.campagneId, campagneId) : undefined
      )
    )
    .orderBy(desc(commissionsMembresDelaguesTable.createdAt));

  return rows.map((r) => ({
    ...r,
    tauxFcfaParKg: toNum(r.tauxFcfaParKg),
    poidsKg:       toNum(r.poidsKg),
    montantFcfa:   toNum(r.montantFcfa),
  }));
}

// ─── Paiement des commissions ─────────────────────────────────────────────

export async function payerCommissionsMembreDelegue(
  membreDelegueId: number,
  cooperativeId: number,
  data: {
    commissionIds?: number[];
    modePaiement: string;
    referencePaiement?: string | null;
  }
): Promise<{ montantTotal: number; totalRetenu: number; montantNet: number; nb: number }> {
  const datePaiement = new Date().toISOString().slice(0, 10);
  const paiement = await db.transaction(async (tx) => {
  // Vérifier appartenance
  const [membre] = await tx
    .select({ id: membresTable.id, nom: membresTable.nom, prenoms: membresTable.prenoms })
    .from(membresTable)
    .where(
      and(
        eq(membresTable.id, membreDelegueId),
        eq(membresTable.cooperativeId, cooperativeId),
        eq(membresTable.categorieMembre, CATEGORIE_DELEGUE_LOCALITE)
      )
    )
    .limit(1);

  if (!membre) throw new Error("Membre délégué introuvable");

  // Un verrou transactionnel par membre évite deux paiements concurrents
  // de déduire la même commission ou la même avance.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${membreDelegueId})`);

  // Récupérer les commissions en attente (triées par date pour déduire avances des plus anciennes d'abord)
  const toutes = await tx
    .select()
    .from(commissionsMembresDelaguesTable)
    .where(and(
      eq(commissionsMembresDelaguesTable.membreDelegueId, membreDelegueId),
      eq(commissionsMembresDelaguesTable.statut, "en_attente"),
    ))
    .orderBy(commissionsMembresDelaguesTable.createdAt);

  const aTraiter = data.commissionIds?.length
    ? toutes.filter((c) => data.commissionIds!.includes(c.id))
    : toutes;

  if (aTraiter.length === 0) {
    return { membre, aTraiter, montantTotal: 0, totalRetenu: 0, montantNet: 0 };
  }

  // Une commission configurée « fin de campagne » ne peut être réglée
  // qu'après la fermeture de sa campagne. Le paiement reste manuel afin que
  // le responsable choisisse le moyen de règlement au moment du solde.
  const campagnesFinDeCampagne = aTraiter.filter(
    (commission) => commission.frequencePaiement === "fin_campagne",
  );
  if (campagnesFinDeCampagne.length > 0) {
    const campagneIds = [...new Set(campagnesFinDeCampagne.map((commission) => commission.campagneId))];
    if (campagneIds.some((id) => id === null)) {
      throw new Error("Une commission prévue en fin de campagne n'est rattachée à aucune campagne.");
    }
    const campagnes = await tx
      .select({ id: campagnesTable.id, statut: campagnesTable.statut, libelle: campagnesTable.libelle })
      .from(campagnesTable)
      .where(inArray(campagnesTable.id, campagneIds as number[]));
    const campagneNonFermee = campagnes.find(
      (campagne) => campagne.statut !== "fermee" && campagne.statut !== "archivee",
    );
    if (campagneNonFermee) {
      throw new Error(
        `Le paiement des commissions de "${campagneNonFermee.libelle}" est prévu en fin de campagne.`,
      );
    }
  }

  // ── Déduction des avances membres ─────────────────────────────────────────
  // Les avances sont déduites des commissions (oldest first) en appliquant planType.
  const avancesEnCours = await tx
    .select()
    .from(avancesTable)
    .where(and(
      eq(avancesTable.membreId, membreDelegueId),
      inArray(avancesTable.statut, ["en_cours", "en_retard"] as const),
      eq(avancesTable.deductionSource, "commission"),
    ))
    .orderBy(avancesTable.dateOctroi);

  // Préparer une map commissionId → retenue à appliquer
  const retenueParCommission = new Map<number, number>(aTraiter.map(c => [c.id, 0]));
  const remboursementsAutomatiques: Array<{ avanceId: number; commissionMembreDelegueId: number; montantFcfa: number }> = [];

  // Itérer avances, déduire séquentiellement des commissions
  let idxCommission = 0;
  for (const avance of avancesEnCours) {
    let retenueTotale: number;
    if (avance.planType === "integral") {
      retenueTotale = avance.soldeRestantFcfa;
    } else if (avance.planType === "partiel" && avance.montantPartielFcfa) {
      retenueTotale = Math.min(avance.montantPartielFcfa, avance.soldeRestantFcfa);
    } else if (avance.planType === "reporte") {
      if (!avance.reportDate || datePaiement < String(avance.reportDate)) continue;
      retenueTotale = avance.soldeRestantFcfa;
    } else {
      continue;
    }
    if (retenueTotale <= 0) continue;

    let resteAvance = retenueTotale;
    // Distribuer la retenue sur les commissions dans l'ordre
    while (resteAvance > 0 && idxCommission < aTraiter.length) {
      const comm = aTraiter[idxCommission]!;
      const montantComm = toNum(comm.montantFcfa);
      const dejaRetenu  = retenueParCommission.get(comm.id) ?? 0;
      const disponible  = montantComm - dejaRetenu; // montant restant non encore couvert par une retenue
      if (disponible <= 0) { idxCommission++; continue; }
      const prise = Math.min(resteAvance, disponible);
      retenueParCommission.set(comm.id, dejaRetenu + prise);
      remboursementsAutomatiques.push({
        avanceId: avance.id,
        commissionMembreDelegueId: comm.id,
        montantFcfa: prise,
      });
      resteAvance -= prise;
      if (dejaRetenu + prise >= montantComm) idxCommission++;
    }
    // Une avance ne peut être remboursée que dans la limite des commissions
    // effectivement disponibles. Le reliquat reste dû pour un paiement futur.
    const retenueAppliquee = retenueTotale - resteAvance;
    if (retenueAppliquee <= 0) continue;

    // Mettre à jour le solde de l'avance
    const nouveauSolde     = avance.soldeRestantFcfa - retenueAppliquee;
    const nouveauRembourse = avance.montantRembourse_fcfa + retenueAppliquee;
    const nouveauStatut    = nouveauSolde === 0 ? "rembourse" : "en_cours";
    await tx.update(avancesTable).set({
      montantRembourse_fcfa: nouveauRembourse,
      soldeRestantFcfa:      nouveauSolde,
      statut:                nouveauStatut as "en_cours" | "rembourse" | "en_retard",
    }).where(eq(avancesTable.id, avance.id));
  }

  if (remboursementsAutomatiques.length > 0) {
    await tx.insert(remboursementsAvancesMembresTable).values(
      remboursementsAutomatiques.map((remboursement) => ({
        ...remboursement,
        note: "Retenue sur commission de délégué de localités",
      })),
    );
  }

  const totalRetenu = [...retenueParCommission.values()].reduce((s, v) => s + v, 0);
  const montantTotal = aTraiter.reduce((s, c) => s + toNum(c.montantFcfa), 0);
  const montantNet   = Math.max(0, montantTotal - totalRetenu);
  const now = new Date();

  // Marquer chaque commission comme payée avec sa retenue individuelle
  for (const comm of aTraiter) {
    const retenue = retenueParCommission.get(comm.id) ?? 0;
    await tx
      .update(commissionsMembresDelaguesTable)
      .set({
        statut:             "payé",
        datePaiement:       now,
        modePaiement:       data.modePaiement,
        referencePaiement:  data.referencePaiement ?? null,
        retenueAvancesFcfa: retenue,
      })
      .where(eq(commissionsMembresDelaguesTable.id, comm.id));
  }

  const membreNomComplet = `${membre.nom} ${membre.prenoms ?? ""}`.trim();
  if (montantNet > 0) {
    await generateEcrituresCommissionDansTransaction(tx, cooperativeId, {
      delegueId: membreDelegueId,
      delegueNom: membreNomComplet,
      montantFcfa: montantNet,
      modePaiement: data.modePaiement,
      date: datePaiement,
      nbCommissions: aTraiter.length,
    });
  }
  const ecritures = [];
  if (totalRetenu > 0) {
    ecritures.push({
      source: "avance" as const,
      libelle: `Retenue avance sur commission – ${membreNomComplet}`,
      compteDebit: "401",
      compteCredit: "4091",
      montantFcfa: totalRetenu,
      date: datePaiement,
      tiersId: membreDelegueId,
      tiersType: "membre" as const,
    });
  }
  const sessionIds = aTraiter.map(c => c.sessionPeseeId).filter((id): id is number => id != null);
  if (sessionIds.length > 0) {
    const sessions = await tx.select({ bonReceptionId: sessionsPeseeTable.bonReceptionId })
      .from(sessionsPeseeTable).where(inArray(sessionsPeseeTable.id, sessionIds));
    const bonIds = sessions.map(s => s.bonReceptionId).filter((id): id is number => id != null);
    if (bonIds.length > 0) {
      const bons = await tx.select({
        carburant: bonsReceptionMembresDeleguesTable.fraisCarburantFcfa,
        autres: bonsReceptionMembresDeleguesTable.autresChargesFcfa,
      }).from(bonsReceptionMembresDeleguesTable)
        .where(inArray(bonsReceptionMembresDeleguesTable.id, bonIds));
      const totalTransport = bons.reduce((s, b) => s + (b.carburant ?? 0) + (b.autres ?? 0), 0);
      if (totalTransport > 0) {
        ecritures.push({
          source: "transport" as const,
          libelle: `Frais transport collecte – ${membreNomComplet} (${aTraiter.length} session${aTraiter.length > 1 ? "s" : ""})`,
          compteDebit: "624",
          compteCredit: "521",
          montantFcfa: totalTransport,
          date: datePaiement,
          tiersId: membreDelegueId,
          tiersType: "membre" as const,
        });
      }
    }
  }
  await proposerEcrituresDansTransaction(tx, cooperativeId, ecritures);
  return { membre, aTraiter, montantTotal, totalRetenu, montantNet };
  });

  const { membre, aTraiter, montantTotal, totalRetenu, montantNet } = paiement;
  logger.info({ membreDelegueId, montantTotal, totalRetenu, montantNet, nb: aTraiter.length }, "Commissions membre délégué payées");

  return { montantTotal, totalRetenu, montantNet, nb: aTraiter.length };
}
