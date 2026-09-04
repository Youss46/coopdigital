import {
  db,
  vehiculesTable,
  chauffeursTable,
  missionsTransportTable,
  entretienVehiculeTable,
  depensesVehiculeTable,
  bonsCarburantTable,
  paiementsTable,
} from "@workspace/db";
import { eq, and, sql, desc, lte, gte } from "drizzle-orm";
import { logger } from "../lib/logger";



// ─── VÉHICULES ────────────────────────────────────────────────────────────────

export async function getVehicules(cooperativeId: number) {
  return db
    .select()
    .from(vehiculesTable)
    .where(eq(vehiculesTable.cooperativeId, cooperativeId))
    .orderBy(vehiculesTable.immatriculation);
}

export async function getVehicule(cooperativeId: number, id: number) {
  const [row] = await db
    .select()
    .from(vehiculesTable)
    .where(and(eq(vehiculesTable.id, id), eq(vehiculesTable.cooperativeId, cooperativeId)))
    .limit(1);
  return row ?? null;
}

export async function createVehicule(
  cooperativeId: number,
  data: Omit<typeof vehiculesTable.$inferInsert, "id" | "cooperativeId" | "createdAt" | "updatedAt">,
) {
  const [row] = await db
    .insert(vehiculesTable)
    .values({ cooperativeId, ...data })
    .returning();
  return row;
}

export async function updateVehicule(
  cooperativeId: number,
  id: number,
  data: Partial<typeof vehiculesTable.$inferInsert>,
) {
  const [row] = await db
    .update(vehiculesTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(vehiculesTable.id, id), eq(vehiculesTable.cooperativeId, cooperativeId)))
    .returning();
  return row ?? null;
}

// ─── ALERTES VÉHICULES ────────────────────────────────────────────────────────

export async function getAlertes(cooperativeId: number, joursAlerte = 30) {
  const today = new Date();
  const limite = new Date(today);
  limite.setDate(today.getDate() + joursAlerte);
  const limiteStr = limite.toISOString().split("T")[0];

  const vehicules = await db
    .select()
    .from(vehiculesTable)
    .where(eq(vehiculesTable.cooperativeId, cooperativeId));

  const alertes: Array<{
    vehicule_id: number;
    immatriculation: string;
    type: string;
    message: string;
    date_expiration: string | null;
  }> = [];

  for (const v of vehicules) {
    if (v.assuranceExpiration && v.assuranceExpiration <= limiteStr) {
      alertes.push({
        vehicule_id: v.id,
        immatriculation: v.immatriculation,
        type: "assurance",
        message: `Assurance expire le ${v.assuranceExpiration}`,
        date_expiration: v.assuranceExpiration,
      });
    }
    if (v.visiteTechniqueExpiration && v.visiteTechniqueExpiration <= limiteStr) {
      alertes.push({
        vehicule_id: v.id,
        immatriculation: v.immatriculation,
        type: "visite_technique",
        message: `Visite technique expire le ${v.visiteTechniqueExpiration}`,
        date_expiration: v.visiteTechniqueExpiration,
      });
    }
    if (v.prochainEntretienDate && v.prochainEntretienDate <= limiteStr) {
      alertes.push({
        vehicule_id: v.id,
        immatriculation: v.immatriculation,
        type: "entretien",
        message: `Entretien prévu le ${v.prochainEntretienDate}`,
        date_expiration: v.prochainEntretienDate,
      });
    }
    if (v.prochainEntretienKm && v.kilometrageActuel >= v.prochainEntretienKm - 500) {
      alertes.push({
        vehicule_id: v.id,
        immatriculation: v.immatriculation,
        type: "entretien_km",
        message: `Entretien dû à ${v.prochainEntretienKm} km (actuel: ${v.kilometrageActuel} km)`,
        date_expiration: null,
      });
    }
  }

  return alertes;
}

// ─── ENTRETIENS ───────────────────────────────────────────────────────────────

export async function getEntretiens(vehiculeId: number) {
  return db
    .select()
    .from(entretienVehiculeTable)
    .where(eq(entretienVehiculeTable.vehiculeId, vehiculeId))
    .orderBy(desc(entretienVehiculeTable.dateEntretien));
}

export async function createEntretien(
  vehiculeId: number,
  data: {
    typeEntretien: string;
    dateEntretien: string;
    kilometrageEntretien?: number | null;
    description?: string | null;
    coutFcfa?: string | null;
    garage?: string | null;
    prochainEntretienKm?: number | null;
    prochainEntretienDate?: string | null;
  },
) {
  const [entretien] = await db
    .insert(entretienVehiculeTable)
    .values({ vehiculeId, ...data })
    .returning();

  // Mettre à jour le kilométrage et le prochain entretien sur le véhicule
  const updates: Partial<typeof vehiculesTable.$inferInsert> = { updatedAt: new Date() };
  if (data.kilometrageEntretien != null) {
    updates.kilometrageActuel = data.kilometrageEntretien;
  }
  if (data.prochainEntretienKm != null) {
    updates.prochainEntretienKm = data.prochainEntretienKm;
  }
  if (data.prochainEntretienDate != null) {
    updates.prochainEntretienDate = data.prochainEntretienDate;
  }

  await db
    .update(vehiculesTable)
    .set(updates)
    .where(eq(vehiculesTable.id, vehiculeId));

  return entretien;
}

// ─── CHAUFFEURS ───────────────────────────────────────────────────────────────

export async function getChauffeurs(cooperativeId: number) {
  return db
    .select()
    .from(chauffeursTable)
    .where(eq(chauffeursTable.cooperativeId, cooperativeId))
    .orderBy(chauffeursTable.nom);
}

export async function getChauffeur(cooperativeId: number, id: number) {
  const [row] = await db
    .select()
    .from(chauffeursTable)
    .where(and(eq(chauffeursTable.id, id), eq(chauffeursTable.cooperativeId, cooperativeId)))
    .limit(1);
  return row ?? null;
}

export async function createChauffeur(
  cooperativeId: number,
  data: Omit<typeof chauffeursTable.$inferInsert, "id" | "cooperativeId" | "createdAt">,
) {
  const [row] = await db
    .insert(chauffeursTable)
    .values({ cooperativeId, ...data })
    .returning();
  return row;
}

export async function updateChauffeur(
  cooperativeId: number,
  id: number,
  data: Partial<typeof chauffeursTable.$inferInsert>,
) {
  const [row] = await db
    .update(chauffeursTable)
    .set(data)
    .where(and(eq(chauffeursTable.id, id), eq(chauffeursTable.cooperativeId, cooperativeId)))
    .returning();
  return row ?? null;
}

export async function deleteChauffeur(cooperativeId: number, id: number) {
  const [deleted] = await db
    .delete(chauffeursTable)
    .where(and(eq(chauffeursTable.id, id), eq(chauffeursTable.cooperativeId, cooperativeId)))
    .returning({ id: chauffeursTable.id });
  return deleted != null;
}

// ─── MISSIONS ─────────────────────────────────────────────────────────────────

export async function getMissions(cooperativeId: number, statut?: string) {
  const conditions = [eq(missionsTransportTable.cooperativeId, cooperativeId)];
  if (statut) {
    conditions.push(eq(missionsTransportTable.statut, statut));
  }
  return db
    .select({
      mission: missionsTransportTable,
      vehicule: {
        id: vehiculesTable.id,
        immatriculation: vehiculesTable.immatriculation,
        marque: vehiculesTable.marque,
        modele: vehiculesTable.modele,
      },
      chauffeur: {
        id: chauffeursTable.id,
        nom: chauffeursTable.nom,
        prenoms: chauffeursTable.prenoms,
      },
    })
    .from(missionsTransportTable)
    .leftJoin(vehiculesTable, eq(missionsTransportTable.vehiculeId, vehiculesTable.id))
    .leftJoin(chauffeursTable, eq(missionsTransportTable.chauffeurId, chauffeursTable.id))
    .where(and(...conditions))
    .orderBy(desc(missionsTransportTable.dateDepart));
}

export async function getMission(cooperativeId: number, id: number) {
  const [row] = await db
    .select()
    .from(missionsTransportTable)
    .where(and(eq(missionsTransportTable.id, id), eq(missionsTransportTable.cooperativeId, cooperativeId)))
    .limit(1);
  return row ?? null;
}

export async function createMission(
  cooperativeId: number,
  data: Omit<typeof missionsTransportTable.$inferInsert, "id" | "cooperativeId" | "createdAt" | "updatedAt">,
) {
  const [row] = await db
    .insert(missionsTransportTable)
    .values({ cooperativeId, ...data, statut: "planifiee" })
    .returning();

  // Mettre le véhicule en statut "en_mission" si départ immédiat
  return row;
}

export async function demarrerMission(cooperativeId: number, id: number) {
  const mission = await getMission(cooperativeId, id);
  if (!mission || mission.statut !== "planifiee") return null;

  const [updated] = await db
    .update(missionsTransportTable)
    .set({ statut: "en_cours", updatedAt: new Date() })
    .where(and(eq(missionsTransportTable.id, id), eq(missionsTransportTable.cooperativeId, cooperativeId)))
    .returning();

  // Mettre véhicule en mission
  await db
    .update(vehiculesTable)
    .set({ statut: "en_mission", updatedAt: new Date() })
    .where(eq(vehiculesTable.id, mission.vehiculeId));

  return updated ?? null;
}

export async function terminerMission(
  cooperativeId: number,
  id: number,
  data: {
    dateArriveeReelle: Date;
    kilometrageArrivee: number;
    coutCarburantFcfa: number;
    coutChauffeurFcfa: number;
    coutPeageFcfa: number;
    coutDiversFcfa?: number;
    poidsChargeKg: number;
    observations?: string;
  },
) {
  const mission = await getMission(cooperativeId, id);
  if (!mission || mission.statut !== "en_cours") return null;

  const coutTotal = data.coutCarburantFcfa + data.coutChauffeurFcfa
    + data.coutPeageFcfa + (data.coutDiversFcfa ?? 0);
  const distanceKm = mission.kilometrageDepart != null
    ? data.kilometrageArrivee - mission.kilometrageDepart
    : null;
  const coutParKg = data.poidsChargeKg > 0
    ? coutTotal / data.poidsChargeKg
    : null;

  const [updated] = await db
    .update(missionsTransportTable)
    .set({
      statut: "terminee",
      dateArriveeReelle: data.dateArriveeReelle,
      kilometrageArrivee: data.kilometrageArrivee,
      distanceKm,
      coutCarburantFcfa: String(data.coutCarburantFcfa),
      coutChauffeurFcfa: String(data.coutChauffeurFcfa),
      coutPeageFcfa: String(data.coutPeageFcfa),
      coutDiversFcfa: String(data.coutDiversFcfa ?? 0),
      coutTotalFcfa: String(coutTotal),
      coutParKgFcfa: coutParKg != null ? String(coutParKg.toFixed(4)) : null,
      poidsChargeKg: String(data.poidsChargeKg),
      observations: data.observations ?? mission.observations,
      updatedAt: new Date(),
    })
    .where(and(eq(missionsTransportTable.id, id), eq(missionsTransportTable.cooperativeId, cooperativeId)))
    .returning();

  // Mettre à jour le kilométrage du véhicule et le remettre disponible
  await db
    .update(vehiculesTable)
    .set({
      statut: "disponible",
      kilometrageActuel: data.kilometrageArrivee,
      updatedAt: new Date(),
    })
    .where(eq(vehiculesTable.id, mission.vehiculeId));

  return updated ?? null;
}

// ─── RAPPORTS ─────────────────────────────────────────────────────────────────

export async function getRapportCampagne(cooperativeId: number, campagneId?: number) {
  const conditions = [
    eq(missionsTransportTable.cooperativeId, cooperativeId),
    eq(missionsTransportTable.statut, "terminee"),
  ];
  if (campagneId) {
    conditions.push(eq(missionsTransportTable.campagneId, campagneId));
  }

  const [stats] = await db
    .select({
      nb_missions:       sql<string>`COUNT(*)`,
      distance_totale:   sql<string>`COALESCE(SUM(distance_km), 0)`,
      cout_total:        sql<string>`COALESCE(SUM(cout_total_fcfa), 0)`,
      tonnage_total:     sql<string>`COALESCE(SUM(poids_charge_kg), 0)`,
    })
    .from(missionsTransportTable)
    .where(and(...conditions));

  // Véhicule le plus utilisé
  const vehiculeStats = await db
    .select({
      vehicule_id:      missionsTransportTable.vehiculeId,
      immatriculation:  vehiculesTable.immatriculation,
      nb_missions:      sql<string>`COUNT(*)`,
    })
    .from(missionsTransportTable)
    .leftJoin(vehiculesTable, eq(missionsTransportTable.vehiculeId, vehiculesTable.id))
    .where(and(...conditions))
    .groupBy(missionsTransportTable.vehiculeId, vehiculesTable.immatriculation)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(1);

  const nbMissions = parseInt(stats?.nb_missions ?? "0");
  const tonnage = parseFloat(stats?.tonnage_total ?? "0");
  const coutTotal = parseFloat(stats?.cout_total ?? "0");

  return {
    nb_missions: nbMissions,
    distance_totale_km: parseInt(stats?.distance_totale ?? "0"),
    cout_total_fcfa: Math.round(coutTotal),
    cout_moyen_kg_fcfa: tonnage > 0 ? Math.round((coutTotal / tonnage) * 100) / 100 : 0,
    tonnage_transporte_kg: Math.round(tonnage * 10) / 10,
    vehicule_plus_utilise: vehiculeStats[0] ?? null,
  };
}

export async function getRapportVehicule(cooperativeId: number, vehiculeId: number) {
  const vehicule = await getVehicule(cooperativeId, vehiculeId);
  if (!vehicule) return null;

  const missions = await db
    .select()
    .from(missionsTransportTable)
    .where(and(
      eq(missionsTransportTable.vehiculeId, vehiculeId),
      eq(missionsTransportTable.cooperativeId, cooperativeId),
    ))
    .orderBy(desc(missionsTransportTable.dateDepart));

  const entretiens = await getEntretiens(vehiculeId);

  const [coutStats] = await db
    .select({
      cout_total:  sql<string>`COALESCE(SUM(cout_total_fcfa), 0)`,
      nb_missions: sql<string>`COUNT(*)`,
    })
    .from(missionsTransportTable)
    .where(and(
      eq(missionsTransportTable.vehiculeId, vehiculeId),
      eq(missionsTransportTable.statut, "terminee"),
    ));

  const [entretiensStats] = await db
    .select({
      cout_entretiens: sql<string>`COALESCE(SUM(cout_fcfa), 0)`,
    })
    .from(entretienVehiculeTable)
    .where(eq(entretienVehiculeTable.vehiculeId, vehiculeId));

  return {
    vehicule,
    missions,
    entretiens,
    cout_missions_fcfa:   Math.round(parseFloat(coutStats?.cout_total ?? "0")),
    cout_entretiens_fcfa: Math.round(parseFloat(entretiensStats?.cout_entretiens ?? "0")),
    nb_missions:          parseInt(coutStats?.nb_missions ?? "0"),
  };
}

// ─── DÉPENSES VÉHICULES ───────────────────────────────────────────────────────

export interface DepenseVehiculeFilters {
  vehiculeId?: number;
  type?: string;
  dateDebut?: string;
  dateFin?: string;
}

export async function getDepenses(cooperativeId: number, filters: DepenseVehiculeFilters = {}) {
  const conditions = [eq(depensesVehiculeTable.cooperativeId, cooperativeId)];
  if (filters.vehiculeId) conditions.push(eq(depensesVehiculeTable.vehiculeId, filters.vehiculeId));
  if (filters.type)       conditions.push(eq(depensesVehiculeTable.type, filters.type));
  if (filters.dateDebut)  conditions.push(gte(depensesVehiculeTable.dateDepense, filters.dateDebut));
  if (filters.dateFin)    conditions.push(lte(depensesVehiculeTable.dateDepense, filters.dateFin));

  const rows = await db
    .select({
      depense: depensesVehiculeTable,
      immatriculation: vehiculesTable.immatriculation,
    })
    .from(depensesVehiculeTable)
    .leftJoin(vehiculesTable, eq(vehiculesTable.id, depensesVehiculeTable.vehiculeId))
    .where(and(...conditions))
    .orderBy(desc(depensesVehiculeTable.dateDepense));

  const total = rows.reduce((s, r) => s + parseFloat(r.depense.montantFcfa), 0);
  return { rows, total };
}

export async function getDepense(cooperativeId: number, id: number) {
  const [row] = await db
    .select({
      depense: depensesVehiculeTable,
      immatriculation: vehiculesTable.immatriculation,
      marque: vehiculesTable.marque,
      modele: vehiculesTable.modele,
    })
    .from(depensesVehiculeTable)
    .leftJoin(vehiculesTable, eq(vehiculesTable.id, depensesVehiculeTable.vehiculeId))
    .where(and(eq(depensesVehiculeTable.id, id), eq(depensesVehiculeTable.cooperativeId, cooperativeId)))
    .limit(1);
  return row ?? null;
}

export async function emettreBonAchatPiece(cooperativeId: number, id: number, userId: number) {
  return db.transaction(async (tx) => {
    const [depense] = await tx
      .select()
      .from(depensesVehiculeTable)
      .where(and(eq(depensesVehiculeTable.id, id), eq(depensesVehiculeTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);
    if (!depense) throw new Error("Dépense introuvable");
    if (depense.type !== "piece_rechange") throw new Error("Le bon d'achat est réservé aux pièces de rechange");

    const [existant] = await tx
      .select({ id: paiementsTable.id })
      .from(paiementsTable)
      .where(eq(paiementsTable.depenseVehiculeId, id))
      .limit(1);
    if (existant) return { paiementId: existant.id, dejaEmis: true };

    const [paiement] = await tx
      .insert(paiementsTable)
      .values({
        depenseVehiculeId: id,
        montantFcfa: Math.round(Number(depense.montantFcfa)),
        montantAPayerFcfa: depense.montantFcfa,
        montantVerseFcfa: "0",
        resteAPayerFcfa: depense.montantFcfa,
        libelle: `Achat pièce de rechange — ${depense.libelle}`,
        statut: "en_attente",
        initialisePar: userId,
      })
      .returning({ id: paiementsTable.id });
    return { paiementId: paiement!.id, dejaEmis: false };
  });
}

export async function createDepense(
  cooperativeId: number,
  vehiculeId: number,
  data: Omit<typeof depensesVehiculeTable.$inferInsert, "id" | "cooperativeId" | "vehiculeId" | "createdAt" | "updatedAt">,
) {
  const [row] = await db
    .insert(depensesVehiculeTable)
    .values({ cooperativeId, vehiculeId, ...data })
    .returning();
  return row;
}

export class DepenseRegleeError extends Error {
  readonly code = "DEPENSE_REGLEE";

  constructor(action: "modification du montant ou du libellé" | "suppression") {
    super(`Cette dépense est déjà liée à un règlement : ${action} interdite`);
    this.name = "DepenseRegleeError";
  }
}

export async function updateDepense(
  cooperativeId: number,
  id: number,
  data: Partial<typeof depensesVehiculeTable.$inferInsert>,
) {
  const modifiesReglementData = data.montantFcfa !== undefined || data.libelle !== undefined;

  if (!modifiesReglementData) {
    const [row] = await db
      .update(depensesVehiculeTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(depensesVehiculeTable.id, id), eq(depensesVehiculeTable.cooperativeId, cooperativeId)))
      .returning();
    return row ?? null;
  }

  return db.transaction(async (tx) => {
    const [depense] = await tx
      .select({ id: depensesVehiculeTable.id })
      .from(depensesVehiculeTable)
      .where(and(eq(depensesVehiculeTable.id, id), eq(depensesVehiculeTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);
    if (!depense) return null;

    const [paiement] = await tx
      .select({ id: paiementsTable.id })
      .from(paiementsTable)
      .where(eq(paiementsTable.depenseVehiculeId, id))
      .limit(1);
    if (paiement) throw new DepenseRegleeError("modification du montant ou du libellé");

    const [row] = await tx
      .update(depensesVehiculeTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(depensesVehiculeTable.id, id), eq(depensesVehiculeTable.cooperativeId, cooperativeId)))
      .returning();
    return row ?? null;
  });
}

export async function deleteDepense(cooperativeId: number, id: number) {
  return db.transaction(async (tx) => {
    const [depense] = await tx
      .select({ id: depensesVehiculeTable.id })
      .from(depensesVehiculeTable)
      .where(and(eq(depensesVehiculeTable.id, id), eq(depensesVehiculeTable.cooperativeId, cooperativeId)))
      .for("update")
      .limit(1);
    if (!depense) return false;

    const [paiement] = await tx
      .select({ id: paiementsTable.id })
      .from(paiementsTable)
      .where(eq(paiementsTable.depenseVehiculeId, id))
      .limit(1);
    if (paiement) throw new DepenseRegleeError("suppression");

    const [deleted] = await tx
      .delete(depensesVehiculeTable)
      .where(and(eq(depensesVehiculeTable.id, id), eq(depensesVehiculeTable.cooperativeId, cooperativeId)))
      .returning({ id: depensesVehiculeTable.id });
    return deleted != null;
  });
}

// ─── BONS DE CARBURANT ────────────────────────────────────────────────────────

async function genNumero(cooperativeId: number): Promise<string> {
  const [last] = await db
    .select({ numero: bonsCarburantTable.numero })
    .from(bonsCarburantTable)
    .where(eq(bonsCarburantTable.cooperativeId, cooperativeId))
    .orderBy(desc(bonsCarburantTable.id))
    .limit(1);
  const match = last?.numero?.match(/(\d+)$/);
  const next  = (parseInt(match?.[1] ?? "0") + 1).toString().padStart(5, "0");
  return `BC-${next}`;
}

export interface BonCarburantFilters {
  vehiculeId?: number;
  chauffeurId?: number;
  statut?: string;
  dateDebut?: string;
  dateFin?: string;
}

export async function getBonsCarburant(cooperativeId: number, filters: BonCarburantFilters = {}) {
  const conds = [eq(bonsCarburantTable.cooperativeId, cooperativeId)];
  if (filters.vehiculeId)  conds.push(eq(bonsCarburantTable.vehiculeId, filters.vehiculeId));
  if (filters.chauffeurId) conds.push(eq(bonsCarburantTable.chauffeurId, filters.chauffeurId));
  if (filters.statut)      conds.push(eq(bonsCarburantTable.statut, filters.statut));
  if (filters.dateDebut)   conds.push(gte(bonsCarburantTable.dateEmission, filters.dateDebut));
  if (filters.dateFin)     conds.push(lte(bonsCarburantTable.dateEmission, filters.dateFin));

  return db
    .select({
      bon:              bonsCarburantTable,
      immatriculation:  vehiculesTable.immatriculation,
      marque:           vehiculesTable.marque,
      chauffeurNom:     chauffeursTable.nom,
      chauffeurPrenoms: chauffeursTable.prenoms,
    })
    .from(bonsCarburantTable)
    .leftJoin(vehiculesTable,  eq(vehiculesTable.id,  bonsCarburantTable.vehiculeId))
    .leftJoin(chauffeursTable, eq(chauffeursTable.id, bonsCarburantTable.chauffeurId))
    .where(and(...conds))
    .orderBy(desc(bonsCarburantTable.createdAt));
}

export async function getBonCarburantByNumero(numero: string) {
  const rows = await db
    .select({
      bon:              bonsCarburantTable,
      immatriculation:  vehiculesTable.immatriculation,
      marque:           vehiculesTable.marque,
      modele:           vehiculesTable.modele,
      chauffeurNom:     chauffeursTable.nom,
      chauffeurPrenoms: chauffeursTable.prenoms,
    })
    .from(bonsCarburantTable)
    .leftJoin(vehiculesTable,  eq(vehiculesTable.id,  bonsCarburantTable.vehiculeId))
    .leftJoin(chauffeursTable, eq(chauffeursTable.id, bonsCarburantTable.chauffeurId))
    .where(eq(bonsCarburantTable.numero, numero))
    .limit(1);
  return rows[0] ?? null;
}

export async function getBonCarburant(cooperativeId: number, id: number) {
  const rows = await db
    .select({
      bon:              bonsCarburantTable,
      immatriculation:  vehiculesTable.immatriculation,
      marque:           vehiculesTable.marque,
      modele:           vehiculesTable.modele,
      chauffeurNom:     chauffeursTable.nom,
      chauffeurPrenoms: chauffeursTable.prenoms,
    })
    .from(bonsCarburantTable)
    .leftJoin(vehiculesTable,  eq(vehiculesTable.id,  bonsCarburantTable.vehiculeId))
    .leftJoin(chauffeursTable, eq(chauffeursTable.id, bonsCarburantTable.chauffeurId))
    .where(and(eq(bonsCarburantTable.id, id), eq(bonsCarburantTable.cooperativeId, cooperativeId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Crée un bon en statut "demande" (initié par le chauffeur depuis le terrain). */
export async function createDemandeBon(
  cooperativeId: number,
  createdBy: number,
  data: { vehiculeId: number; chauffeurId?: number | null; typeCarburant: string; montantAutoriseFcfa: string; quantiteAutorisee?: string | null; stationService?: string | null; motif?: string | null; dateEmission: string },
) {
  const numero = await genNumero(cooperativeId);
  const [row] = await db
    .insert(bonsCarburantTable)
    .values({ cooperativeId, createdBy, numero, statut: "demande", ...data })
    .returning();
  return row!;
}

export async function createBonCarburant(
  cooperativeId: number,
  createdBy: number,
  data: { vehiculeId: number; chauffeurId?: number | null; typeCarburant: string; montantAutoriseFcfa: string; quantiteAutorisee?: string | null; stationService?: string | null; motif?: string | null; dateEmission: string },
) {
  const numero = await genNumero(cooperativeId);
  const [row] = await db
    .insert(bonsCarburantTable)
    .values({ cooperativeId, createdBy, numero, statut: "brouillon", ...data })
    .returning();
  return row!;
}

export async function transitionBon(cooperativeId: number, id: number, statut: string, extra?: Record<string, unknown>) {
  const [row] = await db
    .update(bonsCarburantTable)
    .set({ statut, updatedAt: new Date(), ...extra })
    .where(and(eq(bonsCarburantTable.id, id), eq(bonsCarburantTable.cooperativeId, cooperativeId)))
    .returning();
  return row ?? null;
}

export async function getStatsCarburant(cooperativeId: number, filters: { vehiculeId?: number; dateDebut?: string; dateFin?: string } = {}) {
  const conds = [
    eq(bonsCarburantTable.cooperativeId, cooperativeId),
    eq(bonsCarburantTable.statut, "utilise"),
  ];
  if (filters.vehiculeId) conds.push(eq(bonsCarburantTable.vehiculeId, filters.vehiculeId));
  if (filters.dateDebut)  conds.push(gte(bonsCarburantTable.dateEmission, filters.dateDebut));
  if (filters.dateFin)    conds.push(lte(bonsCarburantTable.dateEmission, filters.dateFin));

  const [totaux] = await db
    .select({
      nb_bons:            sql<string>`COUNT(*)`,
      qte_autorisee_l:    sql<string>`COALESCE(SUM(quantite_autorisee),0)`,
      qte_livree_l:       sql<string>`COALESCE(SUM(quantite_livree),0)`,
      montant_autorise_total_fcfa: sql<string>`COALESCE(SUM(${bonsCarburantTable.montantAutoriseFcfa}),0)`,
      montant_total_fcfa: sql<string>`COALESCE(SUM(montant_fcfa),0)`,
    })
    .from(bonsCarburantTable)
    .where(and(...conds));

  const parVehicule = await db
    .select({
      vehicule_id:      bonsCarburantTable.vehiculeId,
      immatriculation:  vehiculesTable.immatriculation,
      marque:           vehiculesTable.marque,
      nb_bons:          sql<string>`COUNT(*)`,
      qte_livree_l:     sql<string>`COALESCE(SUM(quantite_livree),0)`,
      montant_autorise_fcfa: sql<string>`COALESCE(SUM(${bonsCarburantTable.montantAutoriseFcfa}),0)`,
      montant_fcfa:     sql<string>`COALESCE(SUM(${bonsCarburantTable.montantFcfa}),0)`,
    })
    .from(bonsCarburantTable)
    .leftJoin(vehiculesTable, eq(vehiculesTable.id, bonsCarburantTable.vehiculeId))
    .where(and(...conds))
    .groupBy(bonsCarburantTable.vehiculeId, vehiculesTable.immatriculation, vehiculesTable.marque)
    .orderBy(desc(sql`SUM(quantite_livree)`));

  return {
    nb_bons:            parseInt(totaux?.nb_bons ?? "0"),
    qte_autorisee_l:    parseFloat(totaux?.qte_autorisee_l ?? "0"),
    qte_livree_l:       parseFloat(totaux?.qte_livree_l ?? "0"),
    montant_autorise_total_fcfa: Math.round(parseFloat(totaux?.montant_autorise_total_fcfa ?? "0")),
    montant_total_fcfa: Math.round(parseFloat(totaux?.montant_total_fcfa ?? "0")),
    par_vehicule:       parVehicule.map(r => ({
      vehicule_id:     r.vehicule_id,
      immatriculation: r.immatriculation,
      marque:          r.marque,
      nb_bons:         parseInt(r.nb_bons),
      qte_livree_l:    parseFloat(r.qte_livree_l),
       montant_autorise_fcfa: Math.round(parseFloat(r.montant_autorise_fcfa)),
      montant_fcfa:    Math.round(parseFloat(r.montant_fcfa)),
    })),
  };
}

// ─── ALERTES CHAUFFEURS ───────────────────────────────────────────────────────

export async function getAlertesChauffeurs(cooperativeId: number, joursAlerte = 30) {
  const limite = new Date();
  limite.setDate(limite.getDate() + joursAlerte);
  const limiteStr = limite.toISOString().split("T")[0];

  const chauffeurs = await db
    .select()
    .from(chauffeursTable)
    .where(and(
      eq(chauffeursTable.cooperativeId, cooperativeId),
      eq(chauffeursTable.statut, "actif"),
    ));

  return chauffeurs
    .filter(c => c.dateExpirationPermis && c.dateExpirationPermis <= limiteStr)
    .map(c => ({
      chauffeur_id: c.id,
      nom: `${c.nom} ${c.prenoms ?? ""}`.trim(),
      type: "permis",
      message: `Permis expire le ${c.dateExpirationPermis}`,
      date_expiration: c.dateExpirationPermis,
    }));
}
