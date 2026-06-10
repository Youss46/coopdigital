import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { eq, and, desc, sql, asc } from "drizzle-orm";
import { missionsTerrainTable, missionsMembresTable, messagesMissionTable, usersTable, membresTable } from "@workspace/db";
import { creerNotification, notifierParRole } from "../services/notificationService.js";
import { computeCompletude } from "./membresController";
import { calculerSuperficie } from "../services/parcelleService.js";

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

// ── Export GeoJSON d'une mission ─────────────────────────────────────────────

interface GpsPointExport { lat: number; lon: number; accuracy?: number; ts: number; }

export async function exportMissionGeoJSON(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));
  const userId    = req.user?.id;
  const userRole  = req.user?.role;

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

    const rows = await db
      .select({
        membreId:     missionsMembresTable.membreId,
        statut:       missionsMembresTable.statut,
        gpsCollecte:  missionsMembresTable.gpsCollecte,
        dateCollecte: missionsMembresTable.dateCollecte,
        nom:          membresTable.nom,
        prenoms:      membresTable.prenoms,
        village:      membresTable.village,
        section:      membresTable.section,
        superficieHa: membresTable.superficieHa,
      })
      .from(missionsMembresTable)
      .innerJoin(membresTable, eq(membresTable.id, missionsMembresTable.membreId))
      .where(
        and(
          eq(missionsMembresTable.missionId, missionId),
          sql`${missionsMembresTable.gpsCollecte} IS NOT NULL`,
          sql`${missionsMembresTable.statut} IN ('collecte', 'valide')`,
        ),
      )
      .orderBy(asc(membresTable.nom));

    const features = rows
      .map(row => {
        const pts = row.gpsCollecte as GpsPointExport[] | null;
        if (!pts || pts.length < 3) return null;
        const validPts = pts.filter(p => typeof p.lat === "number" && typeof p.lon === "number");
        if (validPts.length < 3) return null;
        const coords = validPts.map(p => [p.lon, p.lat]);
        const ring = [...coords, coords[0]];
        const latLngPoly: [number, number][] = validPts.map(p => [p.lat, p.lon]);
        const superficieCalculee = calculerSuperficie(latLngPoly);
        return {
          type: "Feature" as const,
          geometry: { type: "Polygon" as const, coordinates: [ring] },
          properties: {
            membre_id:     row.membreId,
            nom_membre:    `${row.nom} ${row.prenoms}`.trim(),
            village:       row.village ?? "",
            section:       row.section ?? "",
            superficie_ha: superficieCalculee > 0 ? superficieCalculee : parseFloat(String(row.superficieHa ?? 0)),
            date_collecte: row.dateCollecte ? new Date(row.dateCollecte as Date).toISOString().slice(0, 10) : null,
            statut:        row.statut,
            mission_id:    missionId,
            mission_titre: mission.titre,
            zone:          mission.zoneNom,
          },
        };
      })
      .filter(Boolean);

    const geojson = {
      type: "FeatureCollection",
      features,
      metadata: {
        mission_id:     missionId,
        mission_titre:  mission.titre,
        zone:           mission.zoneNom,
        generated_at:   new Date().toISOString(),
        total_parcelles: features.length,
        regulation:     "EUDR (EU) 2023/1115",
      },
    };

    const filename = `gps_terrain_mission_${missionId}_${new Date().toISOString().slice(0, 10)}.geojson`;
    res.setHeader("Content-Type", "application/geo+json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(geojson);
  } catch (err) {
    req.log.error({ err }, "Erreur exportMissionGeoJSON");
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
      void creerNotification(cooperativeId, [agentId], {
        type:         "mission_assignee",
        titre:        `Mission assignée : ${titre}`,
        message:      `Zone : ${zoneNom}. Date prévue : ${datePrevue}. ${membreIds?.length ?? 0} parcelle(s) à collecter.`,
        lien:         `/missions/${mission.id}`,
        lienLibelle:  "Voir la mission",
        gravite:      "info",
        sourceModule: "missions",
        sourceId:     mission.id,
      });
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
      void notifierParRole(cooperativeId, ["responsable_tracabilite", "pca", "directeur"], {
        type:         "mission_soumise",
        titre:        `Mission soumise : ${mission.titre}`,
        message:      `Soumise par ${agent?.prenoms ?? ""} ${agent?.nom ?? ""}. ${updated.parcellesCollectees ?? 0} parcelle(s) collectée(s) à valider.`,
        lien:         `/missions/${mission.id}`,
        lienLibelle:  "Valider les parcelles",
        gravite:      "attention",
        sourceModule: "missions",
        sourceId:     mission.id,
      });
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
        const [membre] = await db
          .select({ nom: membresTable.nom, prenoms: membresTable.prenoms })
          .from(membresTable)
          .where(eq(membresTable.id, membreId))
          .limit(1);
        void creerNotification(cooperativeId, [mission.agentId], {
          type:         "mission_parcelle_rejetee",
          titre:        `Parcelle rejetée — ${mission.titre}`,
          message:      `Membre : ${membre?.prenoms ?? ""} ${membre?.nom ?? ""}. Motif : ${motif}.`,
          lien:         `/missions/${mission.id}`,
          lienLibelle:  "Voir les corrections",
          gravite:      "attention",
          sourceModule: "missions",
          sourceId:     mission.id,
        });
      } catch { /* non bloquant */ }
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur rejeterParcelleMission");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Messages de mission (RT) ──────────────────────────────────────────────────

export async function getMessagesMission(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));

  try {
    const [mission] = await db
      .select({ id: missionsTerrainTable.id, agentId: missionsTerrainTable.agentId })
      .from(missionsTerrainTable)
      .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }

    const userRole = req.user?.role;
    const userId = req.user?.id;
    if (userRole === "agent_terrain" && mission.agentId !== userId) {
      res.status(403).json({ erreur: "Mission non assignée à cet agent" });
      return;
    }

    const messages = await db
      .select({
        id: messagesMissionTable.id,
        message: messagesMissionTable.message,
        type: messagesMissionTable.type,
        lu: messagesMissionTable.lu,
        createdAt: messagesMissionTable.createdAt,
        auteurId: messagesMissionTable.auteurId,
        auteurNom: usersTable.nom,
        auteurPrenoms: usersTable.prenoms,
        auteurRole: usersTable.role,
      })
      .from(messagesMissionTable)
      .leftJoin(usersTable, eq(usersTable.id, messagesMissionTable.auteurId))
      .where(eq(messagesMissionTable.missionId, missionId))
      .orderBy(messagesMissionTable.createdAt);

    // Marquer les messages non lus comme lus pour cet utilisateur
    await db
      .update(messagesMissionTable)
      .set({ lu: true })
      .where(and(eq(messagesMissionTable.missionId, missionId), eq(messagesMissionTable.lu, false)));

    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Erreur getMessagesMission");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function sendMessageMission(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));
  const { message, type } = req.body as { message?: string; type?: string };

  if (!message?.trim()) {
    res.status(400).json({ erreur: "Le message est requis" });
    return;
  }

  try {
    const [mission] = await db
      .select({ id: missionsTerrainTable.id, agentId: missionsTerrainTable.agentId })
      .from(missionsTerrainTable)
      .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }

    if (req.user?.role === "agent_terrain" && mission.agentId !== userId) {
      res.status(403).json({ erreur: "Mission non assignée à cet agent" });
      return;
    }

    const [msg] = await db
      .insert(messagesMissionTable)
      .values({
        missionId,
        auteurId: userId,
        message: message.trim(),
        type: (type ?? "commentaire") as "commentaire" | "probleme" | "reponse",
      })
      .returning();

    res.status(201).json(msg);
  } catch (err) {
    req.log.error({ err }, "Erreur sendMessageMission");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Valider / Rejeter la mission entière (RT) ─────────────────────────────────

// ── Validation en lot de toutes les collectes GPS d'une mission ───────────────

export async function validerToutCollectes(req: Request, res: Response): Promise<void> {
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
    if (mission.statut !== "soumise") {
      res.status(400).json({ erreur: "La mission doit être soumise pour valider les collectes" });
      return;
    }

    // Récupérer tous les membres à valider
    const toValider = await db
      .select({
        membreId:    missionsMembresTable.membreId,
        gpsCollecte: missionsMembresTable.gpsCollecte,
        dateCollecte: missionsMembresTable.dateCollecte,
      })
      .from(missionsMembresTable)
      .where(
        and(
          eq(missionsMembresTable.missionId, missionId),
          sql`${missionsMembresTable.statut} = 'collecte'`,
          sql`${missionsMembresTable.gpsCollecte} IS NOT NULL`,
        ),
      );

    if (toValider.length === 0) {
      res.status(400).json({ erreur: "Aucune collecte GPS en attente de validation" });
      return;
    }

    // Batch update missions_membres
    await db
      .update(missionsMembresTable)
      .set({ statut: "valide" })
      .where(
        and(
          eq(missionsMembresTable.missionId, missionId),
          sql`${missionsMembresTable.statut} = 'collecte'`,
          sql`${missionsMembresTable.gpsCollecte} IS NOT NULL`,
        ),
      );

    // Pour chaque membre : intégrer les données GPS + recalculer complétude
    for (const row of toValider) {
      const [updatedMembre] = await db
        .update(membresTable)
        .set({
          gpsParcelles:     row.gpsCollecte,
          gpsCollectePar:   mission.agentId,
          gpsValidePar:     userId,
          dateCollecteGps:  row.dateCollecte ?? new Date(),
          updatedAt:        new Date(),
        })
        .where(eq(membresTable.id, row.membreId))
        .returning();

      if (updatedMembre) {
        const completude = computeCompletude(updatedMembre as unknown as Record<string, unknown>);
        await db
          .update(membresTable)
          .set({ completudeFiche: completude })
          .where(eq(membresTable.id, row.membreId));
      }
    }

    // Vérifier si toute la mission est maintenant validée
    const [{ pending }] = await db
      .select({ pending: sql<number>`count(*)::int` })
      .from(missionsMembresTable)
      .where(
        and(
          eq(missionsMembresTable.missionId, missionId),
          sql`${missionsMembresTable.statut} NOT IN ('valide', 'rejete')`,
        ),
      );

    if (Number(pending) === 0) {
      await db
        .update(missionsTerrainTable)
        .set({ statut: "validee", updatedAt: new Date() })
        .where(eq(missionsTerrainTable.id, missionId));

      if (mission.agentId) {
        void creerNotification(cooperativeId, [mission.agentId], {
          type:         "mission_validee",
          titre:        `Mission validée ✓ : ${mission.titre}`,
          message:      `Toutes les collectes GPS ont été validées. ${toValider.length} parcelle(s) intégrée(s).`,
          lien:         `/missions/${mission.id}`,
          lienLibelle:  "Voir la mission",
          gravite:      "info",
          sourceModule: "missions",
          sourceId:     mission.id,
        });
      }
    }

    res.json({ ok: true, valides: toValider.length });
  } catch (err) {
    req.log.error({ err }, "Erreur validerToutCollectes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Valider mission complète (RT) ─────────────────────────────────────────────

export async function validerMissionComplete(req: Request, res: Response): Promise<void> {
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
    if (mission.statut !== "soumise") {
      res.status(400).json({ erreur: "Seules les missions soumises peuvent être validées" });
      return;
    }

    const [updated] = await db
      .update(missionsTerrainTable)
      .set({ statut: "validee", updatedAt: new Date() })
      .where(eq(missionsTerrainTable.id, missionId))
      .returning();

    // Notification à l'agent
    if (mission.agentId) {
      try {
        void creerNotification(cooperativeId, [mission.agentId], {
          type:         "mission_validee",
          titre:        `Mission validée ✓ : ${mission.titre}`,
          message:      `Votre mission a été validée. ${updated.parcellesCollectees ?? 0} parcelle(s) intégrée(s).`,
          lien:         `/missions/${mission.id}`,
          lienLibelle:  "Voir la mission",
          gravite:      "info",
          sourceModule: "missions",
          sourceId:     mission.id,
        });
      } catch { /* non bloquant */ }
    }

    res.json({ ok: true, mission: updated });
  } catch (err) {
    req.log.error({ err }, "Erreur validerMissionComplete");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function rejeterMissionComplete(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const missionId = parseInt(String(req.params["id"] ?? "0"));
  const { motif } = req.body as { motif?: string };

  if (!motif?.trim()) {
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
    if (mission.statut !== "soumise") {
      res.status(400).json({ erreur: "Seules les missions soumises peuvent être rejetées" });
      return;
    }

    const [updated] = await db
      .update(missionsTerrainTable)
      .set({ statut: "rejetee", motifRejet: motif.trim(), updatedAt: new Date() })
      .where(eq(missionsTerrainTable.id, missionId))
      .returning();

    // Ajouter un message système + notifier l'agent
    try {
      await db.insert(messagesMissionTable).values({
        missionId,
        auteurId: userId,
        message: `[MISSION REJETÉE] ${motif.trim()}`,
        type: "probleme",
      });

      if (mission.agentId) {
        void creerNotification(cooperativeId, [mission.agentId], {
          type:         "mission_rejetee",
          titre:        `Mission rejetée : ${mission.titre}`,
          message:      `Motif : ${motif.trim()}. Veuillez corriger et resoumettre.`,
          lien:         `/missions/${mission.id}`,
          lienLibelle:  "Voir les corrections",
          gravite:      "alerte",
          sourceModule: "missions",
          sourceId:     mission.id,
        });
      }
    } catch { /* non bloquant */ }

    res.json({ ok: true, mission: updated });
  } catch (err) {
    req.log.error({ err }, "Erreur rejeterMissionComplete");
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
