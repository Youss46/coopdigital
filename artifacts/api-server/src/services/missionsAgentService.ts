import {
  db, missionsTerrainTable, missionsMembresTable, messagesMissionTable,
  membresTable, usersTable,
} from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";

type GpsPoint = { lat: number; lon: number; accuracy?: number; ts?: number };
const GPS_CRS = "EPSG:4326";

function orientation(a: GpsPoint, b: GpsPoint, c: GpsPoint): number {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
}

function hasSelfIntersection(points: GpsPoint[]): boolean {
  if (points.length < 4) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!, d = points[(j + 1) % points.length]!;
      const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
      const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
      if (((o1 > 1e-10 && o2 < -1e-10) || (o1 < -1e-10 && o2 > 1e-10))
        && ((o3 > 1e-10 && o4 < -1e-10) || (o3 < -1e-10 && o4 > 1e-10))) return true;
    }
  }
  return false;
}

function polygonAreaHa(points: GpsPoint[]): number {
  if (points.length < 3) return 0;
  const R = 6371000;
  const lat0 = points[0]!.lat * Math.PI / 180;
  const xy = points.map(p => ({
    x: (p.lon - points[0]!.lon) * Math.PI / 180 * R * Math.cos(lat0),
    y: (p.lat - points[0]!.lat) * Math.PI / 180 * R,
  }));
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    area += xy[i]!.x * xy[j]!.y - xy[j]!.x * xy[i]!.y;
  }
  return Math.abs(area) / 2 / 10000;
}

function validatePolygon(raw: unknown, crs?: string): GpsPoint[] {
  if (crs !== undefined && crs !== GPS_CRS) {
    throw new Error(`Système de coordonnées non supporté : ${crs}. Utilisez ${GPS_CRS}.`);
  }
  if (!Array.isArray(raw) || raw.length < 3) throw new Error("Le contour GPS doit comporter au moins 3 points");
  const points = raw as GpsPoint[];
  if (points.some(p => !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180)) {
    throw new Error("Le contour GPS contient une coordonnée invalide");
  }
  const normalizedPoints = points.map((point) => ({
    ...point,
    lat: Number(point.lat.toFixed(6)),
    lon: Number(point.lon.toFixed(6)),
  }));
  if (hasSelfIntersection(normalizedPoints)) throw new Error("Le contour GPS se croise. Corrigez les points avant validation.");
  const areaHa = polygonAreaHa(normalizedPoints);
  if (!Number.isFinite(areaHa) || areaHa < 0.0001) throw new Error("La superficie calculée est trop faible ou nulle. Vérifiez le contour GPS.");
  return normalizedPoints;
}

export async function getMissionsAgent(agentId: number, cooperativeId: number) {
  const missions = await db
    .select()
    .from(missionsTerrainTable)
    .where(
      and(
        eq(missionsTerrainTable.cooperativeId, cooperativeId),
        eq(missionsTerrainTable.agentId, agentId),
        sql`(statut IN ('planifiee', 'en_cours', 'soumise', 'rejetee') OR (statut = 'validee' AND updated_at > NOW() - INTERVAL '30 days'))`,
      ),
    )
    .orderBy(desc(missionsTerrainTable.datePrevue));

  return Promise.all(
    missions.map(async (m) => {
      const [counts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          collectes: sql<number>`sum(case when statut IN ('collecte','valide') then 1 else 0 end)::int`,
          rejetes: sql<number>`sum(case when statut = 'rejete' then 1 else 0 end)::int`,
        })
        .from(missionsMembresTable)
        .where(eq(missionsMembresTable.missionId, m.id));

      return {
        ...m,
        membresTotal: counts?.total ?? 0,
        membresCollectes: counts?.collectes ?? 0,
        membresRejetes: counts?.rejetes ?? 0,
      };
    }),
  );
}

export async function getMissionDetail(missionId: number, agentId: number) {
  const [mission] = await db
    .select()
    .from(missionsTerrainTable)
    .where(
      and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.agentId, agentId)),
    );

  if (!mission) return null;

  const membres = await db
    .select({
      id: missionsMembresTable.id,
      membreId: missionsMembresTable.membreId,
      statut: missionsMembresTable.statut,
      gpsCollecte: missionsMembresTable.gpsCollecte,
      photosCollectees: missionsMembresTable.photosCollectees,
      notesAgent: missionsMembresTable.notesAgent,
      dateCollecte: missionsMembresTable.dateCollecte,
      motifRejet: missionsMembresTable.motifRejet,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      membreVillage: membresTable.village,
      membreSection: membresTable.section,
      superficieHa: membresTable.superficieHa,
    })
    .from(missionsMembresTable)
    .leftJoin(membresTable, eq(membresTable.id, missionsMembresTable.membreId))
    .where(eq(missionsMembresTable.missionId, missionId));

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
    .orderBy(messagesMissionTable.createdAt)
    .limit(100);

  return { ...mission, membres, messages };
}

export async function collecterParcelleAgent(
  missionId: number,
  membreId: number,
  agentId: number,
  data: {
    polygoneGps: object;
    crs?: string;
    photos: string[];
    notes?: string;
    superficieCalculeeHa?: number;
    probleme?: { type: string; description: string };
  },
) {
  const [mission] = await db
    .select()
    .from(missionsTerrainTable)
    .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.agentId, agentId)));

  if (!mission) throw new Error("Mission introuvable ou non assignée à cet agent");

  const [missionMembre] = await db
    .select()
    .from(missionsMembresTable)
    .where(
      and(
        eq(missionsMembresTable.missionId, missionId),
        eq(missionsMembresTable.membreId, membreId),
      ),
    );

  if (!missionMembre) throw new Error("Membre non trouvé dans cette mission");
  const polygoneGps = validatePolygon(data.polygoneGps, data.crs);
  const [membre] = await db.select({ superficieHa: membresTable.superficieHa })
    .from(membresTable).where(eq(membresTable.id, membreId)).limit(1);
  const areaHa = polygonAreaHa(polygoneGps);
  const declaredHa = membre?.superficieHa ? Number(membre.superficieHa) : 0;
  if (declaredHa > 0 && Math.abs(areaHa - declaredHa) / declaredHa > 0.75 && !data.probleme) {
    throw new Error("La superficie GPS est très éloignée de la superficie déclarée. Vérifiez les points ou indiquez un problème terrain.");
  }
  if (!data.photos || data.photos.length < 2) {
    throw new Error("Au moins 2 photos requises pour documenter la parcelle");
  }

  await db
    .update(missionsMembresTable)
    .set({
      statut: "collecte",
       gpsCollecte: polygoneGps,
       gpsCrs: GPS_CRS,
      photosCollectees: data.photos,
      notesAgent: data.notes ?? null,
      dateCollecte: new Date(),
    })
    .where(eq(missionsMembresTable.id, missionMembre.id));

  const [counts] = await db
    .select({
      collectes: sql<number>`sum(case when statut IN ('collecte','valide') then 1 else 0 end)::int`,
    })
    .from(missionsMembresTable)
    .where(eq(missionsMembresTable.missionId, missionId));

  if (mission.statut === "planifiee" || mission.statut === "rejetee") {
    await db
      .update(missionsTerrainTable)
      .set({ parcellesCollectees: counts?.collectes ?? 0, statut: "en_cours", updatedAt: new Date() })
      .where(eq(missionsTerrainTable.id, missionId));
  } else {
    await db
      .update(missionsTerrainTable)
      .set({ parcellesCollectees: counts?.collectes ?? 0, updatedAt: new Date() })
      .where(eq(missionsTerrainTable.id, missionId));
  }

  await db
    .update(membresTable)
     .set({ polygoneGps, gpsParcelles: polygoneGps, gpsCrs: GPS_CRS })
    .where(eq(membresTable.id, membreId));

  if (data.probleme) {
    await db.insert(messagesMissionTable).values({
      missionId,
      auteurId: agentId,
      message: `[PROBLÈME – ${data.probleme.type}] ${data.probleme.description}`,
      type: "probleme",
    });
  }

  return { ok: true };
}

export async function soumettresMission(missionId: number, agentId: number) {
  const [mission] = await db
    .select()
    .from(missionsTerrainTable)
    .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.agentId, agentId)));

  if (!mission) throw new Error("Mission introuvable");

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      collectes: sql<number>`sum(case when statut IN ('collecte','valide') then 1 else 0 end)::int`,
    })
    .from(missionsMembresTable)
    .where(eq(missionsMembresTable.missionId, missionId));

  const total = counts?.total ?? 0;
  const collectes = counts?.collectes ?? 0;

  if (total > 0 && collectes < total) {
    throw new Error(`${total - collectes} parcelle(s) non encore collectée(s)`);
  }

  await db
    .update(missionsTerrainTable)
    .set({ statut: "soumise", updatedAt: new Date() })
    .where(eq(missionsTerrainTable.id, missionId));

  return { ok: true };
}

export async function getMessages(missionId: number, agentId: number) {
  const [mission] = await db
    .select({ agentId: missionsTerrainTable.agentId })
    .from(missionsTerrainTable)
    .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.agentId, agentId)));
  if (!mission) throw new Error("Mission introuvable ou accès non autorisé");

  return db
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
}

export async function sendMessage(
  missionId: number,
  auteurId: number,
  message: string,
  type: string,
) {
  const [mission] = await db
    .select({ agentId: missionsTerrainTable.agentId })
    .from(missionsTerrainTable)
    .where(and(eq(missionsTerrainTable.id, missionId), eq(missionsTerrainTable.agentId, auteurId)));
  if (!mission) throw new Error("Mission introuvable ou accès non autorisé");

  const [msg] = await db
    .insert(messagesMissionTable)
    .values({ missionId, auteurId, message, type: type as "commentaire" | "probleme" | "reponse" })
    .returning();
  return msg;
}

export async function getStatsAgent(agentId: number) {
  const [missions] = await db
    .select({
      total: sql<number>`count(*)::int`,
      validees: sql<number>`sum(case when statut = 'validee' then 1 else 0 end)::int`,
    })
    .from(missionsTerrainTable)
    .where(eq(missionsTerrainTable.agentId, agentId));

  const [parcelles] = await db
    .select({
      valides: sql<number>`sum(case when ${missionsMembresTable.statut} IN ('collecte','valide') then 1 else 0 end)::int`,
    })
    .from(missionsMembresTable)
    .innerJoin(
      missionsTerrainTable,
      eq(missionsTerrainTable.id, missionsMembresTable.missionId),
    )
    .where(eq(missionsTerrainTable.agentId, agentId));

  const missionsTotal = missions?.total ?? 0;
  const missionsValidees = missions?.validees ?? 0;
  const tauxValidation = missionsTotal > 0 ? Math.round((missionsValidees / missionsTotal) * 100) : 0;

  return {
    parcellesMappees: parcelles?.valides ?? 0,
    missionsTerminees: missionsValidees,
    missionsTotal,
    tauxValidation,
  };
}

export async function getHistoriqueAgent(agentId: number, cooperativeId: number) {
  const missions = await db
    .select()
    .from(missionsTerrainTable)
    .where(
      and(
        eq(missionsTerrainTable.cooperativeId, cooperativeId),
        eq(missionsTerrainTable.agentId, agentId),
      ),
    )
    .orderBy(desc(missionsTerrainTable.updatedAt));

  return Promise.all(
    missions.map(async (m) => {
      const [counts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          collectes: sql<number>`sum(case when statut IN ('collecte','valide') then 1 else 0 end)::int`,
          valides: sql<number>`sum(case when statut = 'valide' then 1 else 0 end)::int`,
        })
        .from(missionsMembresTable)
        .where(eq(missionsMembresTable.missionId, m.id));

      const total = counts?.total ?? 0;
      const collectes = counts?.collectes ?? 0;
      const valides = counts?.valides ?? 0;

      return {
        ...m,
        membresTotal: total,
        membresCollectes: collectes,
        membresValides: valides,
        tauxValidation: collectes > 0 ? Math.round((valides / collectes) * 100) : 0,
      };
    }),
  );
}
