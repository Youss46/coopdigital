import { logger } from "../lib/logger.js";
import {
  db,
  zonesCollecteTable,
  planningsCollecteTable,
  notificationsCollecteTable,
  membresTable,
  livraisonsTable,
} from "@workspace/db";
import { eq, and, gte, lte, inArray, sql, desc } from "drizzle-orm";
import { envoyerPushGroupePortail, envoyerPushGroupe } from "./pushService.js";



// ──────────────────────────────────────────────
// Zones
// ──────────────────────────────────────────────

export async function listZones(cooperativeId: number) {
  const rows = await db
    .select({
      id: zonesCollecteTable.id,
      nom: zonesCollecteTable.nom,
      section: zonesCollecteTable.section,
      villages: zonesCollecteTable.villages,
      agentResponsableId: zonesCollecteTable.agentResponsableId,
      objectifTonnageKg: zonesCollecteTable.objectifTonnageKg,
      createdAt: zonesCollecteTable.createdAt,
    })
    .from(zonesCollecteTable)
    .where(eq(zonesCollecteTable.cooperativeId, cooperativeId))
    .orderBy(zonesCollecteTable.nom);
  return rows;
}

export async function createZone(cooperativeId: number, data: {
  nom: string;
  section?: string;
  villages?: string[];
  agentResponsableId?: number;
  objectifTonnageKg?: number;
}) {
  const [row] = await db
    .insert(zonesCollecteTable)
    .values({
      cooperativeId: cooperativeId,
      nom: data.nom,
      section: data.section ?? null,
      villages: data.villages ?? [],
      agentResponsableId: data.agentResponsableId ?? null,
      objectifTonnageKg: data.objectifTonnageKg?.toString() ?? "0",
    })
    .returning();
  return row;
}

export async function updateZone(
  cooperativeId: number,
  id: number,
  data: {
    nom?: string;
    section?: string;
    villages?: string[];
    agentResponsableId?: number | null;
    objectifTonnageKg?: number;
  }
) {
  const [row] = await db
    .update(zonesCollecteTable)
    .set({
      nom: data.nom,
      section: data.section,
      villages: data.villages,
      agentResponsableId: data.agentResponsableId,
      objectifTonnageKg: data.objectifTonnageKg?.toString(),
    })
    .where(
      and(eq(zonesCollecteTable.id, id), eq(zonesCollecteTable.cooperativeId, cooperativeId))
    )
    .returning();
  return row ?? null;
}

export async function deleteZone(cooperativeId: number, id: number) {
  await db
    .delete(zonesCollecteTable)
    .where(
      and(eq(zonesCollecteTable.id, id), eq(zonesCollecteTable.cooperativeId, cooperativeId))
    );
}

// ──────────────────────────────────────────────
// Plannings
// ──────────────────────────────────────────────

export async function listPlannings(cooperativeId: number, opts: {
  agentId?: number;
  zoneId?: number;
  semaine?: string; // date ISO du lundi de la semaine
  statut?: string;
}) {
  const result = await db.execute<{
    id: number;
    cooperative_id: number;
    campagne_id: number | null;
    zone_collecte_id: number | null;
    zone_nom: string | null;
    zone_section: string | null;
    agent_id: number | null;
    agent_nom: string | null;
    date_collecte: string;
    heure_debut: string | null;
    heure_fin: string | null;
    villages_prevus: string[] | null;
    objectif_kg: string;
    statut: string;
    tonnage_realise_kg: string;
    nb_producteurs_prevus: number;
    nb_producteurs_venus: number;
    observations: string | null;
    sms_envoye: boolean;
    created_at: string;
    updated_at: string | null;
  }>(sql`
    SELECT
      p.id,
      p.cooperative_id,
      p.campagne_id,
      p.zone_collecte_id,
      z.nom          AS zone_nom,
      z.section      AS zone_section,
      p.agent_id,
      u.nom          AS agent_nom,
      p.date_collecte::text,
      p.heure_debut::text,
      p.heure_fin::text,
      p.villages_prevus,
      p.objectif_kg,
      p.statut,
      p.tonnage_realise_kg,
      p.nb_producteurs_prevus,
      p.nb_producteurs_venus,
      p.observations,
      p.sms_envoye,
      p.created_at,
      p.updated_at
    FROM plannings_collecte p
    LEFT JOIN zones_collecte  z ON z.id = p.zone_collecte_id
    LEFT JOIN users           u ON u.id = p.agent_id
    WHERE p.cooperative_id = ${cooperativeId}
      ${opts.agentId ? sql`AND p.agent_id = ${opts.agentId}` : sql``}
      ${opts.zoneId  ? sql`AND p.zone_collecte_id = ${opts.zoneId}` : sql``}
      ${opts.statut  ? sql`AND p.statut = ${opts.statut}` : sql``}
      ${
        opts.semaine
          ? sql`AND p.date_collecte >= ${opts.semaine}::date
                AND p.date_collecte <= (${opts.semaine}::date + interval '6 days')`
          : sql``
      }
    ORDER BY p.date_collecte, p.heure_debut
  `);
  return result.rows;
}

export async function getPlanningsSemaine(cooperativeId: number) {
  // lundi de la semaine courante
  const lundi = new Date();
  const day = lundi.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  lundi.setDate(lundi.getDate() + diff);
  const lundiStr = lundi.toISOString().slice(0, 10);
  return listPlannings(cooperativeId, { semaine: lundiStr });
}

export async function getPlanning(cooperativeId: number, id: number) {
  const result = await db.execute<{
    id: number;
    zone_collecte_id: number | null;
    zone_nom: string | null;
    zone_villages: string[] | null;
    agent_id: number | null;
    agent_nom: string | null;
    agent_telephone: string | null;
    date_collecte: string;
    heure_debut: string | null;
    heure_fin: string | null;
    villages_prevus: string[] | null;
    objectif_kg: string;
    statut: string;
    tonnage_realise_kg: string;
    nb_producteurs_prevus: number;
    nb_producteurs_venus: number;
    observations: string | null;
    sms_envoye: boolean;
    campagne_id: number | null;
  }>(sql`
    SELECT
      p.id,
      p.zone_collecte_id,
      z.nom           AS zone_nom,
      z.villages      AS zone_villages,
      p.agent_id,
      u.nom           AS agent_nom,
      u.telephone     AS agent_telephone,
      p.date_collecte::text,
      p.heure_debut::text,
      p.heure_fin::text,
      p.villages_prevus,
      p.objectif_kg,
      p.statut,
      p.tonnage_realise_kg,
      p.nb_producteurs_prevus,
      p.nb_producteurs_venus,
      p.observations,
      p.sms_envoye,
      p.campagne_id
    FROM plannings_collecte p
    LEFT JOIN zones_collecte z ON z.id = p.zone_collecte_id
    LEFT JOIN users          u ON u.id = p.agent_id
    WHERE p.id = ${id} AND p.cooperative_id = ${cooperativeId}
  `);
  return result.rows[0] ?? null;
}

export async function createPlanning(cooperativeId: number, data: {
  campagneId?: number;
  zoneCollecteId: number;
  agentId?: number;
  dateCollecte: string;
  heureDebut?: string;
  heureFin?: string;
  villagesPrevus?: string[];
  objectifKg?: number;
  nbProducteursPrevus?: number;
  observations?: string;
}) {
  const [row] = await db
    .insert(planningsCollecteTable)
    .values({
      cooperativeId: cooperativeId,
      campagneId: data.campagneId ?? null,
      zoneCollecteId: data.zoneCollecteId,
      agentId: data.agentId ?? null,
      dateCollecte: data.dateCollecte,
      heureDebut: data.heureDebut ?? "07:00",
      heureFin: data.heureFin ?? "17:00",
      villagesPrevus: data.villagesPrevus ?? [],
      objectifKg: data.objectifKg?.toString() ?? "0",
      nbProducteursPrevus: data.nbProducteursPrevus ?? 0,
      observations: data.observations ?? null,
    })
    .returning();
  return row;
}

export async function updatePlanning(
  cooperativeId: number,
  id: number,
  data: {
    zoneCollecteId?: number;
    agentId?: number | null;
    dateCollecte?: string;
    heureDebut?: string;
    heureFin?: string;
    villagesPrevus?: string[];
    objectifKg?: number;
    nbProducteursPrevus?: number;
    observations?: string;
  }
) {
  const [row] = await db
    .update(planningsCollecteTable)
    .set({
      ...(data.zoneCollecteId    !== undefined && { zoneCollecteId: data.zoneCollecteId }),
      ...(data.agentId           !== undefined && { agentId: data.agentId }),
      ...(data.dateCollecte      !== undefined && { dateCollecte: data.dateCollecte }),
      ...(data.heureDebut        !== undefined && { heureDebut: data.heureDebut }),
      ...(data.heureFin          !== undefined && { heureFin: data.heureFin }),
      ...(data.villagesPrevus    !== undefined && { villagesPrevus: data.villagesPrevus }),
      ...(data.objectifKg        !== undefined && { objectifKg: data.objectifKg.toString() }),
      ...(data.nbProducteursPrevus !== undefined && { nbProducteursPrevus: data.nbProducteursPrevus }),
      ...(data.observations      !== undefined && { observations: data.observations }),
      updatedAt: new Date(),
    })
    .where(
      and(eq(planningsCollecteTable.id, id), eq(planningsCollecteTable.cooperativeId, cooperativeId))
    )
    .returning();
  return row ?? null;
}

export async function demarrerPlanning(cooperativeId: number, id: number) {
  const [row] = await db
    .update(planningsCollecteTable)
    .set({ statut: "en_cours", updatedAt: new Date() })
    .where(
      and(eq(planningsCollecteTable.id, id), eq(planningsCollecteTable.cooperativeId, cooperativeId))
    )
    .returning();
  return row ?? null;
}

// ──────────────────────────────────────────────
// Notifier les membres de la zone
// ──────────────────────────────────────────────

export async function notifierMembresZone(cooperativeId: number, planningId: number) {
  const planning = await getPlanning(cooperativeId, planningId);
  if (!planning) throw new Error(`Planning ${planningId} introuvable`);

  // Récupérer la coopérative (pour le nom)
  const coopResult = await db.execute<{ nom: string }>(sql`
    SELECT nom FROM cooperatives WHERE id = ${cooperativeId} LIMIT 1
  `);
  const coopNom = coopResult.rows[0]?.nom ?? "votre coopérative";

  // Villages de la zone
  const villagesZone: string[] =
    (planning.zone_villages ?? planning.villages_prevus ?? []) as string[];

  // Membres actifs dont le village est dans la zone
  let membres: { id: number; nom: string; telephone: string; village: string | null }[] = [];
  if (villagesZone.length > 0) {
    membres = await db
      .select({
        id: membresTable.id,
        nom: membresTable.nom,
        telephone: membresTable.telephone,
        village: membresTable.village,
      })
      .from(membresTable)
      .where(
        and(
          eq(membresTable.cooperativeId, cooperativeId),
          eq(membresTable.statut, "actif"),
          inArray(membresTable.village as typeof membresTable.village, villagesZone as [string, ...string[]])
        )
      );
  } else {
    // Si pas de villages ciblés, notifier tous les membres actifs de la coop
    membres = await db
      .select({
        id: membresTable.id,
        nom: membresTable.nom,
        telephone: membresTable.telephone,
        village: membresTable.village,
      })
      .from(membresTable)
      .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif")));
  }

  if (membres.length === 0) {
    return { envoyes: 0, echecs: 0 };
  }

  const heureDebut = (planning.heure_debut ?? "07:00").slice(0, 5);
  const dateStr = new Date(planning.date_collecte + "T00:00:00").toLocaleDateString("fr-FR");
  const villagesStr = (planning.villages_prevus ?? villagesZone).join(", ") || "votre village";
  const agentTel = planning.agent_telephone ?? "N/A";

  // Générer les SMS et envoyer
  const telephones = membres.map((m) => m.telephone).filter(Boolean);
  const messagesParMembre: Array<{ membreId: number; telephone: string; message: string }> = [];

  for (const m of membres) {
    if (!m.telephone) continue;
    const msg = `Bonjour ${m.nom}, ${coopNom} organise une collecte le ${dateStr} à partir de ${heureDebut} à ${villagesStr}. Préparez votre cacao. Infos : ${agentTel}`;
    messagesParMembre.push({ membreId: m.id, telephone: m.telephone, message: msg });
  }

  const msgTemplate = `Bonjour, ${coopNom} organise une collecte le ${dateStr} à partir de ${heureDebut} à ${villagesStr}. Préparez votre cacao. Infos : ${agentTel}`;
  const membreIds = membres.map((m) => m.id);

  void envoyerPushGroupePortail(membreIds, {
    title: "🚜 Collecte programmée",
    body: msgTemplate.slice(0, 200),
    url: "/",
  });

  // Enregistrer dans notifications_collecte
  const now = new Date();
  if (messagesParMembre.length > 0) {
    await db.insert(notificationsCollecteTable).values(
      messagesParMembre.map((entry) => ({
        planningId,
        membreId: entry.membreId,
        telephone: entry.telephone,
        messageEnvoye: msgTemplate,
        statutEnvoi: "envoye" as const,
        dateEnvoi: now,
      }))
    );
  }

  // Marquer notification envoyée
  await db
    .update(planningsCollecteTable)
    .set({ smsEnvoye: true, updatedAt: new Date() })
    .where(eq(planningsCollecteTable.id, planningId));

  logger.info({ planningId, nbMembres: membres.length }, "Notifications collecte envoyées");

  return { envoyes: membres.length, echecs: 0, nbMembres: membres.length };
}

// ──────────────────────────────────────────────
// Clôturer un planning
// ──────────────────────────────────────────────

export async function cloturerPlanning(cooperativeId: number, planningId: number) {
  const planning = await getPlanning(cooperativeId, planningId);
  if (!planning) throw new Error(`Planning ${planningId} introuvable`);

  const villagesZone: string[] =
    (planning.zone_villages ?? planning.villages_prevus ?? []) as string[];

  // Agréger les livraisons du jour dans la zone
  let tonnage = 0;
  let nbProducteurs = 0;

  if (villagesZone.length > 0) {
    const livResult = await db.execute<{
      total_kg: string | null;
      nb_producteurs: string | null;
    }>(sql`
      SELECT
        COALESCE(SUM(l.poids_kg), 0) AS total_kg,
        COUNT(DISTINCT l.membre_id)  AS nb_producteurs
      FROM livraisons l
      JOIN membres m ON m.id = l.membre_id
      WHERE l.date_livraison = ${planning.date_collecte}::date
        AND m.cooperative_id = ${cooperativeId}
        AND m.village = ANY(${sql.raw(`ARRAY[${villagesZone.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")}]`)}::text[])
    `);
    tonnage = parseFloat(livResult.rows[0]?.total_kg ?? "0") || 0;
    nbProducteurs = parseInt(livResult.rows[0]?.nb_producteurs ?? "0") || 0;
  }

  // Mettre à jour le planning
  const [updated] = await db
    .update(planningsCollecteTable)
    .set({
      statut: "termine",
      tonnageRealiseKg: tonnage.toString(),
      nbProducteursVenus: nbProducteurs,
      updatedAt: new Date(),
    })
    .where(eq(planningsCollecteTable.id, planningId))
    .returning();

  // Rapport SMS au directeur
  const objectifKg = parseFloat(planning.objectif_kg ?? "0") || 0;
  const taux = objectifKg > 0 ? Math.round((tonnage / objectifKg) * 100) : 0;
  const dateStr = new Date(planning.date_collecte + "T00:00:00").toLocaleDateString("fr-FR");

  const rapportMsg = `Collecte ${planning.zone_nom ?? "?"} du ${dateStr} : ${nbProducteurs} producteurs — ${tonnage.toLocaleString("fr-FR")} kg. Objectif : ${objectifKg.toLocaleString("fr-FR")} kg. Taux : ${taux}%. Agent : ${planning.agent_nom ?? "N/A"}`;

  // Envoyer au directeur (users avec role='directeur')
  try {
    const directeurs = await db.execute<{ id: number }>(sql`
      SELECT id FROM users
      WHERE cooperative_id = ${cooperativeId}
        AND role = 'directeur'
        AND actif = true
    `);
    const userIds = directeurs.rows.map((r) => r.id).filter(Boolean);
    if (userIds.length > 0) {
      void envoyerPushGroupe(userIds, {
        title: "📊 Rapport de collecte",
        body: rapportMsg.slice(0, 200),
        url: "/planning",
      });
      logger.info({ planningId, userIds }, "Rapport clôture envoyé aux directeurs");
    }
  } catch (err) {
    logger.warn({ err, planningId }, "Impossible d'envoyer rapport SMS directeur");
  }

  return { planning: updated, tonnageRealiseKg: tonnage, nbProducteursVenus: nbProducteurs, taux };
}

// ──────────────────────────────────────────────
// Rapport
// ──────────────────────────────────────────────

export async function getRapportPlanning(cooperativeId: number, planningId: number) {
  const planning = await getPlanning(cooperativeId, planningId);
  if (!planning) return null;

  const villagesZone: string[] =
    (planning.zone_villages ?? planning.villages_prevus ?? []) as string[];

  let livraisons: Array<{ membre_nom: string; village: string | null; poids_kg: string; montant_net_fcfa: string | null }> = [];
  if (villagesZone.length > 0) {
    const lResult = await db.execute<{
      membre_nom: string;
      village: string | null;
      poids_kg: string;
      montant_net_fcfa: string | null;
    }>(sql`
      SELECT
        m.nom   AS membre_nom,
        m.village,
        l.poids_kg,
        l.montant_net_fcfa
      FROM livraisons l
      JOIN membres m ON m.id = l.membre_id
      WHERE l.date_livraison = ${planning.date_collecte}::date
        AND m.cooperative_id = ${cooperativeId}
        AND m.village = ANY(${sql.raw(`ARRAY[${villagesZone.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")}]`)}::text[])
      ORDER BY m.nom
    `);
    livraisons = lResult.rows;
  }

  // Notifications envoyées
  const notifResult = await db.execute<{ nb: string }>(sql`
    SELECT COUNT(*) AS nb FROM notifications_collecte WHERE planning_id = ${planningId}
  `);

  return {
    planning,
    livraisons,
    nbNotifications: parseInt(notifResult.rows[0]?.nb ?? "0"),
  };
}

// ──────────────────────────────────────────────
// Statistiques
// ──────────────────────────────────────────────

export async function getStatsPlannings(cooperativeId: number) {
  const statsResult = await db.execute<{
    nb_plannings: string;
    tonnage_prevu: string;
    tonnage_realise: string;
    nb_termines: string;
    nb_annules: string;
  }>(sql`
    SELECT
      COUNT(*)                                                 AS nb_plannings,
      COALESCE(SUM(objectif_kg), 0)                           AS tonnage_prevu,
      COALESCE(SUM(tonnage_realise_kg), 0)                    AS tonnage_realise,
      COUNT(*) FILTER (WHERE statut = 'termine')              AS nb_termines,
      COUNT(*) FILTER (WHERE statut = 'annule')               AS nb_annules
    FROM plannings_collecte
    WHERE cooperative_id = ${cooperativeId}
  `);

  const agentResult = await db.execute<{ agent_nom: string; nb: string }>(sql`
    SELECT u.nom AS agent_nom, COUNT(*) AS nb
    FROM plannings_collecte p
    JOIN users u ON u.id = p.agent_id
    WHERE p.cooperative_id = ${cooperativeId} AND p.statut = 'termine'
    GROUP BY u.nom
    ORDER BY nb DESC
    LIMIT 1
  `);

  const s = statsResult.rows[0];
  const tonnagePrevu = parseFloat(s?.tonnage_prevu ?? "0");
  const tonnageRealise = parseFloat(s?.tonnage_realise ?? "0");
  const tauxRealisation = tonnagePrevu > 0 ? Math.round((tonnageRealise / tonnagePrevu) * 100) : 0;

  return {
    nbPlannings: parseInt(s?.nb_plannings ?? "0"),
    tonnagePrevu,
    tonnageRealise,
    nbTermines: parseInt(s?.nb_termines ?? "0"),
    nbAnnules: parseInt(s?.nb_annules ?? "0"),
    tauxRealisationPct: tauxRealisation,
    agentPlusActif: agentResult.rows[0]?.agent_nom ?? null,
  };
}

// ──────────────────────────────────────────────
// Stats par zone
// ──────────────────────────────────────────────

export async function getStatsZones(cooperativeId: number) {
  const result = await db.execute<{
    zone_id: number;
    zone_nom: string;
    nb_plannings: string;
    tonnage_prevu: string;
    tonnage_realise: string;
  }>(sql`
    SELECT
      z.id   AS zone_id,
      z.nom  AS zone_nom,
      COUNT(p.id)                                          AS nb_plannings,
      COALESCE(SUM(p.objectif_kg), 0)                     AS tonnage_prevu,
      COALESCE(SUM(p.tonnage_realise_kg), 0)               AS tonnage_realise
    FROM zones_collecte z
    LEFT JOIN plannings_collecte p ON p.zone_collecte_id = z.id
    WHERE z.cooperative_id = ${cooperativeId}
    GROUP BY z.id, z.nom
    ORDER BY z.nom
  `);

  return result.rows.map((r) => ({
    zoneId: r.zone_id,
    zoneNom: r.zone_nom,
    nbPlannings: parseInt(r.nb_plannings),
    tonnagePrevu: parseFloat(r.tonnage_prevu),
    tonnageRealise: parseFloat(r.tonnage_realise),
    tauxRealisation:
      parseFloat(r.tonnage_prevu) > 0
        ? Math.round((parseFloat(r.tonnage_realise) / parseFloat(r.tonnage_prevu)) * 100)
        : 0,
  }));
}

// Annuler un planning
export async function annulerPlanning(cooperativeId: number, id: number) {
  const [row] = await db
    .update(planningsCollecteTable)
    .set({ statut: "annule", updatedAt: new Date() })
    .where(
      and(eq(planningsCollecteTable.id, id), eq(planningsCollecteTable.cooperativeId, cooperativeId))
    )
    .returning();
  return row ?? null;
}
