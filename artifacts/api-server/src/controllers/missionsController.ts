import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { missionsTerrainTable, missionsMembresTable, usersTable, membresTable } from "@workspace/db";
import { sendSMS } from "../services/smsService.js";
import { computeCompletude } from "./membresController";

// ── Liste des missions ────────────────────────────────────────────────────────

export async function listMissions(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  const userRole = req.user?.role;
  const userId = req.user?.id;

  try {
    const statut = req.query["statut"] as string | undefined;

    const conditions = [eq(missionsTerrainTable.cooperativeId, cooperativeId)];

    if (userRole === "agent_terrain" && userId) {
      conditions.push(eq(missionsTerrainTable.agentId, userId));
    }
    if (statut) conditions.push(eq(missionsTerrainTable.statut, statut));

    const missions = await db
      .select({
        id: missionsTerrainTable.id,
        titre: missionsTerrainTable.titre,
        zoneType: missionsTerrainTable.zoneType,
        zoneNom: missionsTerrainTable.zoneNom,
        datePrevue: missionsTerrainTable.datePrevue,
        statut: missionsTerrainTable.statut,
        objectifParcelles: missionsTerrainTable.objectifParcelles,
        parcellesCollectees: missionsTerrainTable.parcellesCollectees,
        notes: missionsTerrainTable.notes,
        createdAt: missionsTerrainTable.createdAt,
        agentNom: usersTable.nom,
        agentPrenoms: usersTable.prenoms,
      })
      .from(missionsTerrainTable)
      .leftJoin(usersTable, eq(usersTable.id, missionsTerrainTable.agentId))
      .where(and(...conditions))
      .orderBy(desc(missionsTerrainTable.datePrevue));

    res.json(missions);
  } catch (err) {
    req.log.error({ err }, "Erreur listMissions");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Détail d'une mission ──────────────────────────────────────────────────────

export async function getMissionById(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));
  const userId = req.user?.id;
  const userRole = req.user?.role;

  try {
    const [mission] = await db
      .select()
      .from(missionsTerrainTable)
      .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }

    if (userRole === "agent_terrain" && mission.agentId !== userId) {
      res.status(403).json({ erreur: "Mission non assignée à cet agent" });
      return;
    }

    // Membres de la mission
    const membres = await db
      .select({
        missionMembreId: missionsMembresTable.id,
        membreId: missionsMembresTable.membreId,
        statut: missionsMembresTable.statut,
        gpsCollecte: missionsMembresTable.gpsCollecte,
        photosCollectees: missionsMembresTable.photosCollectees,
        notesAgent: missionsMembresTable.notesAgent,
        dateCollecte: missionsMembresTable.dateCollecte,
        motifRejet: missionsMembresTable.motifRejet,
        nom: membresTable.nom,
        prenoms: membresTable.prenoms,
        village: membresTable.village,
        telephone: membresTable.telephone,
        gpsParcelles: membresTable.gpsParcelles,
        nombreParcelles: membresTable.nombreParcelles,
      })
      .from(missionsMembresTable)
      .innerJoin(membresTable, eq(membresTable.id, missionsMembresTable.membreId))
      .where(eq(missionsMembresTable.missionId, missionId))
      .orderBy(asc(membresTable.nom));

    res.json({ ...mission, membres });
  } catch (err) {
    req.log.error({ err }, "Erreur getMissionById");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Créer une mission ─────────────────────────────────────────────────────────

export async function createMission(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const { titre, zoneType, zoneNom, datePrevue, agentId, membreIds, objectifParcelles, notes } = req.body as {
    titre: string;
    zoneType: string;
    zoneNom: string;
    datePrevue: string;
    agentId?: number;
    membreIds?: number[];
    objectifParcelles?: number;
    notes?: string;
  };

  if (!titre || !zoneType || !zoneNom || !datePrevue) {
    res.status(400).json({ erreur: "titre, zoneType, zoneNom et datePrevue sont obligatoires" });
    return;
  }

  try {
    const [mission] = await db
      .insert(missionsTerrainTable)
      .values({
        cooperativeId,
        titre,
        zoneType,
        zoneNom,
        datePrevue,
        agentId: agentId ?? null,
        creePar: userId,
        objectifParcelles: objectifParcelles ?? (membreIds?.length ?? 0),
        notes: notes ?? null,
      })
      .returning();

    // Ajouter les membres à la mission
    if (membreIds && membreIds.length > 0) {
      await db.insert(missionsMembresTable).values(
        membreIds.map((mid) => ({ missionId: mission.id, membreId: mid }))
      );
    }

    // SMS à l'agent assigné
    if (agentId) {
      try {
        const [agent] = await db
          .select({ telephone: usersTable.telephone, nom: usersTable.nom, prenoms: usersTable.prenoms })
          .from(usersTable)
          .where(eq(usersTable.id, agentId))
          .limit(1);
        if (agent?.telephone) {
          const msg = `Nouvelle mission assignée : ${titre} — ${zoneNom}. Date : ${datePrevue}. ${membreIds?.length ?? 0} parcelles. [Voir dans CoopDigital Terrain]`;
          void sendSMS(agent.telephone, msg);
        }
      } catch { /* non bloquant */ }
    }

    res.status(201).json(mission);
  } catch (err) {
    req.log.error({ err }, "Erreur createMission");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Démarrer une mission (agent) ──────────────────────────────────────────────

export async function demarrerMission(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));

  try {
    const [mission] = await db
      .select()
      .from(missionsTerrainTable)
      .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    if (mission.agentId !== userId) { res.status(403).json({ erreur: "Mission non assignée à cet agent" }); return; }
    if (mission.statut !== "planifiee") {
      res.status(400).json({ erreur: "La mission ne peut être démarrée que depuis le statut 'planifiée'" });
      return;
    }

    const [updated] = await db
      .update(missionsTerrainTable)
      .set({ statut: "en_cours", updatedAt: new Date() })
      .where(eq(missionsTerrainTable.id, missionId))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur demarrerMission");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Collecte GPS par agent ────────────────────────────────────────────────────

export async function collecterGpsMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));
  const membreId = parseInt(String(req.params["membreId"] ?? "0"));
  const { gpsCollecte, photosCollectees, notesAgent } = req.body as {
    gpsCollecte?: unknown;
    photosCollectees?: unknown;
    notesAgent?: string;
  };

  try {
    const [mission] = await db
      .select({ agentId: missionsTerrainTable.agentId, statut: missionsTerrainTable.statut })
      .from(missionsTerrainTable)
      .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    if (mission.agentId !== userId) { res.status(403).json({ erreur: "Mission non assignée à cet agent" }); return; }

    const [mm] = await db
      .update(missionsMembresTable)
      .set({
        statut: "collecte",
        gpsCollecte: gpsCollecte ?? null,
        photosCollectees: photosCollectees ?? null,
        notesAgent: notesAgent ?? null,
        dateCollecte: new Date(),
      })
      .where(and(eq(missionsMembresTable.missionId, missionId), eq(missionsMembresTable.membreId, membreId)))
      .returning();

    if (!mm) { res.status(404).json({ erreur: "Membre non trouvé dans cette mission" }); return; }

    // Recalcul progression
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(missionsMembresTable)
      .where(and(eq(missionsMembresTable.missionId, missionId), eq(missionsMembresTable.statut, "collecte")));

    await db
      .update(missionsTerrainTable)
      .set({ parcellesCollectees: total, updatedAt: new Date() })
      .where(eq(missionsTerrainTable.id, missionId));

    res.json(mm);
  } catch (err) {
    req.log.error({ err }, "Erreur collecterGpsMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Soumission de la mission par l'agent ─────────────────────────────────────

export async function soumettreMission(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));

  try {
    const [mission] = await db
      .select()
      .from(missionsTerrainTable)
      .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    if (mission.agentId !== userId) { res.status(403).json({ erreur: "Mission non assignée à cet agent" }); return; }
    if (mission.statut !== "en_cours") {
      res.status(400).json({ erreur: "La mission doit être en cours pour être soumise" });
      return;
    }

    const [updated] = await db
      .update(missionsTerrainTable)
      .set({ statut: "soumise", updatedAt: new Date() })
      .where(eq(missionsTerrainTable.id, missionId))
      .returning();

    // Notification RT
    try {
      const [agent] = await db
        .select({ nom: usersTable.nom, prenoms: usersTable.prenoms })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      const rtUsers = await db
        .select({ telephone: usersTable.telephone })
        .from(usersTable)
        .where(and(eq(usersTable.cooperativeId, cooperativeId), eq(usersTable.role, "responsable_tracabilite")));
      const msg = `Mission "${mission.titre}" soumise par ${agent?.prenoms ?? ""} ${agent?.nom ?? ""}. ${updated.parcellesCollectees ?? 0} parcelles collectées. [Valider dans CoopDigital]`;
      for (const rt of rtUsers) {
        if (rt.telephone) void sendSMS(rt.telephone, msg);
      }
    } catch { /* non bloquant */ }

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur soumettreMission");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Validation d'une parcelle par RT ─────────────────────────────────────────

export async function validerParcelleMission(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));
  const membreId = parseInt(String(req.params["membreId"] ?? "0"));

  try {
    const [mission] = await db
      .select()
      .from(missionsTerrainTable)
      .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }

    const [mm] = await db
      .select()
      .from(missionsMembresTable)
      .where(and(eq(missionsMembresTable.missionId, missionId), eq(missionsMembresTable.membreId, membreId)))
      .limit(1);

    if (!mm || !mm.gpsCollecte) {
      res.status(400).json({ erreur: "Aucune donnée GPS collectée pour ce membre" });
      return;
    }

    // Valider la parcelle dans la mission
    await db
      .update(missionsMembresTable)
      .set({ statut: "valide" })
      .where(and(eq(missionsMembresTable.missionId, missionId), eq(missionsMembresTable.membreId, membreId)));

    // Intégrer les données GPS dans la fiche membre
    const [membreActuel] = await db
      .select()
      .from(membresTable)
      .where(eq(membresTable.id, membreId))
      .limit(1);

    if (membreActuel) {
      const updatedMembre = await db
        .update(membresTable)
        .set({
          gpsParcelles: mm.gpsCollecte,
          gpsCollectePar: mission.agentId,
          gpsValidePar: userId,
          dateCollecteGps: mm.dateCollecte ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(membresTable.id, membreId))
        .returning();

      // Recalculer completude
      if (updatedMembre[0]) {
        const completude = computeCompletude(updatedMembre[0] as unknown as Record<string, unknown>);
        await db
          .update(membresTable)
          .set({ completudeFiche: completude })
          .where(eq(membresTable.id, membreId));
      }
    }

    // Vérifier si toute la mission est validée
    const [{ pending }] = await db
      .select({ pending: sql<number>`count(*)::int` })
      .from(missionsMembresTable)
      .where(
        and(
          eq(missionsMembresTable.missionId, missionId),
          sql`${missionsMembresTable.statut} NOT IN ('valide', 'rejete')`
        )
      );

    if (Number(pending) === 0) {
      await db
        .update(missionsTerrainTable)
        .set({ statut: "validee", updatedAt: new Date() })
        .where(eq(missionsTerrainTable.id, missionId));
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur validerParcelleMission");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Rejet d'une parcelle par RT ───────────────────────────────────────────────

export async function rejeterParcelleMission(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));
  const membreId = parseInt(String(req.params["membreId"] ?? "0"));
  const { motif } = req.body as { motif?: string };

  if (!motif) {
    res.status(400).json({ erreur: "Le motif de rejet est obligatoire" });
    return;
  }

  try {
    const [mission] = await db
      .select()
      .from(missionsTerrainTable)
      .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }

    await db
      .update(missionsMembresTable)
      .set({ statut: "rejete", motifRejet: motif })
      .where(and(eq(missionsMembresTable.missionId, missionId), eq(missionsMembresTable.membreId, membreId)));

    // Notifier l'agent
    if (mission.agentId) {
      try {
        const [agent] = await db
          .select({ telephone: usersTable.telephone })
          .from(usersTable)
          .where(eq(usersTable.id, mission.agentId))
          .limit(1);
        const [membre] = await db
          .select({ nom: membresTable.nom, prenoms: membresTable.prenoms })
          .from(membresTable)
          .where(eq(membresTable.id, membreId))
          .limit(1);
        if (agent?.telephone) {
          const msg = `Parcelle rejetée dans la mission "${mission.titre}" — Membre : ${membre?.prenoms ?? ""} ${membre?.nom ?? ""}. Motif : ${motif}. [Voir les corrections dans CoopDigital Terrain]`;
          void sendSMS(agent.telephone, msg);
        }
      } catch { /* non bloquant */ }
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur rejeterParcelleMission");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Membres sans GPS pour une zone ───────────────────────────────────────────

export async function membresSansGps(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const { zoneNom } = req.query as { zoneNom?: string };

  try {
    const conditions = [
      eq(membresTable.cooperativeId, cooperativeId),
      eq(membresTable.statutMembre, "actif"),
      sql`${membresTable.gpsParcelles} IS NULL`,
    ];
    if (zoneNom) {
      conditions.push(sql`(${membresTable.zoneNom} ILIKE ${`%${zoneNom}%`} OR ${membresTable.village} ILIKE ${`%${zoneNom}%`})`);
    }

    const membres = await db
      .select({
        id: membresTable.id,
        nom: membresTable.nom,
        prenoms: membresTable.prenoms,
        village: membresTable.village,
        zoneNom: membresTable.zoneNom,
        nombreParcelles: membresTable.nombreParcelles,
        superficieHa: membresTable.superficieHa,
      })
      .from(membresTable)
      .where(and(...conditions))
      .orderBy(asc(membresTable.nom))
      .limit(200);

    res.json(membres);
  } catch (err) {
    req.log.error({ err }, "Erreur membresSansGps");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Liste agents terrain ──────────────────────────────────────────────────────

export async function listAgentsTerrain(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  try {
    const agents = await db
      .select({
        id: usersTable.id,
        nom: usersTable.nom,
        prenoms: usersTable.prenoms,
        telephone: usersTable.telephone,
        zoneNom: usersTable.zoneNom,
        actif: usersTable.actif,
      })
      .from(usersTable)
      .where(and(eq(usersTable.cooperativeId, cooperativeId), eq(usersTable.role, "agent_terrain")))
      .orderBy(asc(usersTable.nom));

    res.json(agents);
  } catch (err) {
    req.log.error({ err }, "Erreur listAgentsTerrain");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
