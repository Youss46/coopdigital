import {
  db,
  vehiculesTable,
  chauffeursTable,
  missionsTransportTable,
  entretienVehiculeTable,
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

export async function getAlertes(cooperativeId: number) {
  const today = new Date();
  const limite = new Date(today);
  limite.setDate(today.getDate() + 30);
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

// ─── ALERTES CHAUFFEURS ───────────────────────────────────────────────────────

export async function getAlertesChauffeurs(cooperativeId: number) {
  const limite = new Date();
  limite.setDate(limite.getDate() + 30);
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
