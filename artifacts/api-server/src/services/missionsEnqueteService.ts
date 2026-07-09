import {
  db, missionsEnqueteTable, enqueteMembresTable, membresTable, usersTable,
  certificationsMembresTable, certificationsTable,
} from "@workspace/db";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { CRITERES_PAR_TYPE } from "./certificationService.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReponsesCriteres {
  [critere: string]: { valeur: "oui" | "non" | "na"; commentaire?: string };
}

function calculerScore(reponses: ReponsesCriteres, criteres: string[]): { score: number; statut: string } {
  const actifs = criteres.filter(c => reponses[c]?.valeur !== "na");
  const oui    = actifs.filter(c => reponses[c]?.valeur === "oui").length;
  const score  = actifs.length > 0 ? Math.round((oui / actifs.length) * 100) : 0;
  const statut = score >= 70 ? "certifie" : score >= 40 ? "en_cours" : "non_conforme";
  return { score, statut };
}

// ─── Back-office : Missions ───────────────────────────────────────────────────

export async function listMissionsEnquete(cooperativeId: number, certificationId?: number) {
  const where = certificationId
    ? and(
        eq(missionsEnqueteTable.cooperativeId, cooperativeId),
        eq(missionsEnqueteTable.certificationId, certificationId),
      )
    : eq(missionsEnqueteTable.cooperativeId, cooperativeId);

  const missions = await db
    .select({
      id:              missionsEnqueteTable.id,
      titre:           missionsEnqueteTable.titre,
      certificationId: missionsEnqueteTable.certificationId,
      datePrevue:      missionsEnqueteTable.datePrevue,
      statut:          missionsEnqueteTable.statut,
      objectifMembres: missionsEnqueteTable.objectifMembres,
      membresCollectes:missionsEnqueteTable.membresCollectes,
      instructions:    missionsEnqueteTable.instructions,
      createdAt:       missionsEnqueteTable.createdAt,
      agentId:         missionsEnqueteTable.agentId,
      agentNom:        usersTable.nom,
      agentPrenom:     usersTable.prenoms,
    })
    .from(missionsEnqueteTable)
    .leftJoin(usersTable, eq(usersTable.id, missionsEnqueteTable.agentId))
    .where(where)
    .orderBy(desc(missionsEnqueteTable.datePrevue));

  return Promise.all(missions.map(async (m) => {
    const [counts] = await db
      .select({
        total:    sql<number>`count(*)::int`,
        collectes:sql<number>`sum(case when statut in ('collecte','valide') then 1 else 0 end)::int`,
        valides:  sql<number>`sum(case when statut = 'valide' then 1 else 0 end)::int`,
      })
      .from(enqueteMembresTable)
      .where(eq(enqueteMembresTable.missionId, m.id));
    return { ...m, membresTotal: counts?.total ?? 0, membresCollectes: counts?.collectes ?? 0, membresValides: counts?.valides ?? 0 };
  }));
}

export async function getMissionEnquete(cooperativeId: number, missionId: number) {
  const [mission] = await db
    .select()
    .from(missionsEnqueteTable)
    .where(and(eq(missionsEnqueteTable.id, missionId), eq(missionsEnqueteTable.cooperativeId, cooperativeId)));
  return mission ?? null;
}

export async function createMissionEnquete(cooperativeId: number, creePar: number, data: {
  titre: string; certificationId: number; datePrevue: string;
  agentId?: number; instructions?: string; membreIds: number[];
}) {
  const { membreIds, ...fields } = data;

  const [mission] = await db
    .insert(missionsEnqueteTable)
    .values({ cooperativeId, creePar, ...fields, objectifMembres: membreIds.length })
    .returning();

  if (membreIds.length > 0) {
    await db.insert(enqueteMembresTable).values(
      membreIds.map(membreId => ({ missionId: mission.id, membreId })),
    );
  }
  return mission;
}

export async function updateMissionStatut(cooperativeId: number, missionId: number, statut: string) {
  const [updated] = await db
    .update(missionsEnqueteTable)
    .set({ statut, updatedAt: new Date() })
    .where(and(eq(missionsEnqueteTable.id, missionId), eq(missionsEnqueteTable.cooperativeId, cooperativeId)))
    .returning();
  return updated ?? null;
}

export async function getMembresEnquete(cooperativeId: number, missionId: number) {
  const mission = await getMissionEnquete(cooperativeId, missionId);
  if (!mission) return null;

  const rows = await db
    .select({
      id:               enqueteMembresTable.id,
      membreId:         enqueteMembresTable.membreId,
      statut:           enqueteMembresTable.statut,
      reponses:         enqueteMembresTable.reponses,
      scoreCalcule:     enqueteMembresTable.scoreCalcule,
      statutConformite: enqueteMembresTable.statutConformite,
      notesAgent:       enqueteMembresTable.notesAgent,
      dateCollecte:     enqueteMembresTable.dateCollecte,
      membreNom:        membresTable.nom,
      membrePrenom:     membresTable.prenoms,
      membreCode:       membresTable.carteProducteur,
      membreVillage:    membresTable.village,
    })
    .from(enqueteMembresTable)
    .innerJoin(membresTable, and(
      eq(membresTable.id, enqueteMembresTable.membreId),
      eq(membresTable.cooperativeId, cooperativeId),
    ))
    .where(eq(enqueteMembresTable.missionId, missionId));

  return rows;
}

export async function validerEnqueteMembre(
  cooperativeId: number, missionId: number, membreId: number,
): Promise<{ ok: boolean; message?: string }> {
  const mission = await getMissionEnquete(cooperativeId, missionId);
  if (!mission) return { ok: false, message: "Mission introuvable" };

  const [enqueteRow] = await db
    .select()
    .from(enqueteMembresTable)
    .where(and(eq(enqueteMembresTable.missionId, missionId), eq(enqueteMembresTable.membreId, membreId)));

  if (!enqueteRow || enqueteRow.statut !== "collecte") {
    return { ok: false, message: "Collecte non disponible pour validation" };
  }

  await db
    .update(enqueteMembresTable)
    .set({ statut: "valide" })
    .where(eq(enqueteMembresTable.id, enqueteRow.id));

  const reponses = (enqueteRow.reponses ?? {}) as ReponsesCriteres;

  const [certif] = await db
    .select({ type: certificationsTable.type })
    .from(certificationsTable)
    .where(eq(certificationsTable.id, mission.certificationId));

  const criteres = certif ? (CRITERES_PAR_TYPE[certif.type] ?? []) : [];
  const { score, statut } = calculerScore(reponses, criteres);

  const criteresValides = Object.entries(reponses).filter(([, r]) => r.valeur === "oui").map(([k]) => k);
  const actifs = criteres.filter(c => reponses[c]?.valeur !== "na");

  await db
    .insert(certificationsMembresTable)
    .values({
      cooperativeId,
      certificationId: mission.certificationId,
      membreId,
      statutConformite: statut,
      score,
      scoreMax: actifs.length,
      criteresValides,
      dateEvaluation: new Date().toISOString().split("T")[0]!,
      evaluePar: null,
    })
    .onConflictDoUpdate({
      target: [certificationsMembresTable.certificationId, certificationsMembresTable.membreId],
      set: {
        statutConformite: statut,
        score,
        scoreMax: actifs.length,
        criteresValides,
        dateEvaluation: new Date().toISOString().split("T")[0]!,
        updatedAt: new Date(),
      },
    });

  await db
    .update(missionsEnqueteTable)
    .set({ membresCollectes: sql`membres_collectes + 1`, updatedAt: new Date() })
    .where(eq(missionsEnqueteTable.id, missionId));

  return { ok: true };
}

export async function deleteMissionEnquete(cooperativeId: number, missionId: number) {
  const mission = await getMissionEnquete(cooperativeId, missionId);
  if (!mission) return false;
  await db.delete(enqueteMembresTable).where(eq(enqueteMembresTable.missionId, missionId));
  await db.delete(missionsEnqueteTable).where(eq(missionsEnqueteTable.id, missionId));
  return true;
}

export async function getAgentsDisponibles(cooperativeId: number) {
  return db
    .select({ id: usersTable.id, nom: usersTable.nom, prenoms: usersTable.prenoms })
    .from(usersTable)
    .where(and(eq(usersTable.cooperativeId, cooperativeId), eq(usersTable.role, "agent_terrain")));
}
