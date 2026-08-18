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
} from "@workspace/db";
import { and, eq, isNull, or, desc, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger.js";

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

// ─── Résolution du taux actif ─────────────────────────────────────────────

export async function getTauxActifMembre(
  cooperativeId: number,
  campagneId: number | null | undefined,
  membreDelegueId: number
): Promise<{ id: number; tauxFcfaParKg: number } | null> {
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
    if (exact) return { id: exact.id, tauxFcfaParKg: toNum(exact.tauxFcfaParKg) };

    // Priorité 2 : taux campagne par défaut (coop + campagne, membre_delegue_id NULL)
    const parCampagne = candidats.find(
      (t) => t.campagneId === campagneId && t.membreDelegueId === null
    );
    if (parCampagne) return { id: parCampagne.id, tauxFcfaParKg: toNum(parCampagne.tauxFcfaParKg) };
  }

  // Priorité 3 : taux global coop (campagne_id NULL, membre_delegue_id NULL)
  const global = candidats.find(
    (t) => t.campagneId === null && t.membreDelegueId === null
  );
  if (global) return { id: global.id, tauxFcfaParKg: toNum(global.tauxFcfaParKg) };

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
    })
    .from(tauxCommissionsMembresDeleguesTable)
    .leftJoin(membresTable, eq(membresTable.id, tauxCommissionsMembresDeleguesTable.membreDelegueId))
    .where(eq(tauxCommissionsMembresDeleguesTable.cooperativeId, cooperativeId))
    .orderBy(desc(tauxCommissionsMembresDeleguesTable.createdAt));

  return rows.map((r) => ({
    ...r.taux,
    tauxFcfaParKg: toNum(r.taux.tauxFcfaParKg),
    membreNom: r.membreNom,
    membrePrenoms: r.membrePrenoms,
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
        eq(membresTable.cooperativeId, cooperativeId)
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
): Promise<{ montantTotal: number; nb: number }> {
  // Vérifier appartenance
  const [membre] = await db
    .select({ id: membresTable.id, nom: membresTable.nom, prenoms: membresTable.prenoms })
    .from(membresTable)
    .where(
      and(
        eq(membresTable.id, membreDelegueId),
        eq(membresTable.cooperativeId, cooperativeId)
      )
    )
    .limit(1);

  if (!membre) throw new Error("Membre délégué introuvable");

  // Récupérer les commissions en attente
  const conditions = [
    eq(commissionsMembresDelaguesTable.membreDelegueId, membreDelegueId),
    eq(commissionsMembresDelaguesTable.statut, "en_attente"),
  ];

  const toutes = await db
    .select()
    .from(commissionsMembresDelaguesTable)
    .where(and(...conditions));

  const aTraiter = data.commissionIds?.length
    ? toutes.filter((c) => data.commissionIds!.includes(c.id))
    : toutes;

  if (aTraiter.length === 0) return { montantTotal: 0, nb: 0 };

  const montantTotal = aTraiter.reduce((s, c) => s + toNum(c.montantFcfa), 0);
  const now = new Date();

  // Marquer comme payées
  const idsAMarquer = aTraiter.map(c => c.id);
  await db
    .update(commissionsMembresDelaguesTable)
    .set({
      statut:            "payé",
      datePaiement:      now,
      modePaiement:      data.modePaiement,
      referencePaiement: data.referencePaiement ?? null,
    })
    .where(
      and(
        eq(commissionsMembresDelaguesTable.membreDelegueId, membreDelegueId),
        inArray(commissionsMembresDelaguesTable.id, idsAMarquer),
      )
    );

  return { montantTotal, nb: aTraiter.length };
}
