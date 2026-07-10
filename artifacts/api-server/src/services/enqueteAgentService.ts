import {
  db, missionsEnqueteTable, enqueteMembresTable, membresTable, certificationsTable,
} from "@workspace/db";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { CRITERES_PAR_TYPE } from "./certificationService.js";
import type { ReponsesCriteres } from "./missionsEnqueteService.js";

function calculerScore(reponses: ReponsesCriteres, criteres: string[]): { score: number; statut: string } {
  const actifs = criteres.filter(c => reponses[c]?.valeur !== "na");
  const oui    = actifs.filter(c => reponses[c]?.valeur === "oui").length;
  const score  = actifs.length > 0 ? Math.round((oui / actifs.length) * 100) : 0;
  const statut = score >= 70 ? "certifie" : score >= 40 ? "en_cours" : "non_conforme";
  return { score, statut };
}

// ─── Missions pour l'agent terrain ────────────────────────────────────────────

export async function getEnquetesAgent(agentId: number, cooperativeId: number) {
  const missions = await db
    .select({
      id:              missionsEnqueteTable.id,
      titre:           missionsEnqueteTable.titre,
      certificationId: missionsEnqueteTable.certificationId,
      datePrevue:      missionsEnqueteTable.datePrevue,
      statut:          missionsEnqueteTable.statut,
      objectifMembres: missionsEnqueteTable.objectifMembres,
      membresCollectes:missionsEnqueteTable.membresCollectes,
      certType:        certificationsTable.type,
    })
    .from(missionsEnqueteTable)
    .innerJoin(certificationsTable, eq(certificationsTable.id, missionsEnqueteTable.certificationId))
    .where(and(
      eq(missionsEnqueteTable.cooperativeId, cooperativeId),
      eq(missionsEnqueteTable.agentId, agentId),
      inArray(missionsEnqueteTable.statut, ["planifiee", "en_cours", "soumise", "validee"]),
    ))
    .orderBy(desc(missionsEnqueteTable.datePrevue));

  return Promise.all(missions.map(async (m) => {
    const [counts] = await db
      .select({
        total:    sql<number>`count(*)::int`,
        collectes:sql<number>`sum(case when statut != 'a_faire' then 1 else 0 end)::int`,
      })
      .from(enqueteMembresTable)
      .where(eq(enqueteMembresTable.missionId, m.id));
    return { ...m, membresTotal: counts?.total ?? 0, membresProgres: counts?.collectes ?? 0 };
  }));
}

export async function getEnqueteDetail(missionId: number, agentId: number) {
  const [mission] = await db
    .select({
      id:              missionsEnqueteTable.id,
      titre:           missionsEnqueteTable.titre,
      certificationId: missionsEnqueteTable.certificationId,
      datePrevue:      missionsEnqueteTable.datePrevue,
      statut:          missionsEnqueteTable.statut,
      instructions:    missionsEnqueteTable.instructions,
      certType:        certificationsTable.type,
    })
    .from(missionsEnqueteTable)
    .innerJoin(certificationsTable, eq(certificationsTable.id, missionsEnqueteTable.certificationId))
    .where(and(eq(missionsEnqueteTable.id, missionId), eq(missionsEnqueteTable.agentId, agentId)));

  if (!mission) return null;

  const membres = await db
    .select({
      id:          enqueteMembresTable.id,
      membreId:    enqueteMembresTable.membreId,
      statut:      enqueteMembresTable.statut,
      reponses:    enqueteMembresTable.reponses,
      notesAgent:    enqueteMembresTable.notesAgent,
      commentaireRt: enqueteMembresTable.commentaireRt,
      dateCollecte:  enqueteMembresTable.dateCollecte,
      nom:         membresTable.nom,
      prenoms:     membresTable.prenoms,
      code:        membresTable.carteProducteur,
      village:     membresTable.village,
    })
    .from(enqueteMembresTable)
    .innerJoin(membresTable, eq(membresTable.id, enqueteMembresTable.membreId))
    .where(eq(enqueteMembresTable.missionId, missionId));

  const criteres = CRITERES_PAR_TYPE[mission.certType] ?? [];
  return { ...mission, membres, criteres };
}

export async function soumettreReponses(
  missionId: number, agentId: number, membreId: number,
  reponses: ReponsesCriteres, notesAgent?: string,
) {
  const [mission] = await db
    .select({ certType: certificationsTable.type })
    .from(missionsEnqueteTable)
    .innerJoin(certificationsTable, eq(certificationsTable.id, missionsEnqueteTable.certificationId))
    .where(and(eq(missionsEnqueteTable.id, missionId), eq(missionsEnqueteTable.agentId, agentId)));

  if (!mission) throw new Error("Mission introuvable ou accès refusé");

  const criteres = CRITERES_PAR_TYPE[mission.certType] ?? [];
  const { score, statut } = calculerScore(reponses, criteres);

  await db
    .update(enqueteMembresTable)
    .set({
      statut: "collecte",
      reponses,
      scoreCalcule: score,
      statutConformite: statut,
      notesAgent: notesAgent ?? null,
      dateCollecte: new Date(),
    })
    .where(and(eq(enqueteMembresTable.missionId, missionId), eq(enqueteMembresTable.membreId, membreId)));

  await db
    .update(missionsEnqueteTable)
    .set({ statut: "en_cours", updatedAt: new Date() })
    .where(eq(missionsEnqueteTable.id, missionId));
}

export async function syncReponsesBatch(
  agentId: number,
  operations: Array<{
    localId: string;
    missionId: number;
    membreId: number;
    reponses: ReponsesCriteres;
    notesAgent?: string;
  }>,
): Promise<{ succes: string[]; echecs: Array<{ localId: string; erreur: string }> }> {
  const succes: string[] = [];
  const echecs: Array<{ localId: string; erreur: string }> = [];

  for (const op of operations) {
    try {
      await soumettreReponses(op.missionId, agentId, op.membreId, op.reponses, op.notesAgent);
      succes.push(op.localId);
    } catch (err) {
      echecs.push({ localId: op.localId, erreur: err instanceof Error ? err.message : "Erreur" });
    }
  }

  return { succes, echecs };
}

export async function soumettreEnqueteMission(missionId: number, agentId: number) {
  const [mission] = await db
    .select()
    .from(missionsEnqueteTable)
    .where(and(eq(missionsEnqueteTable.id, missionId), eq(missionsEnqueteTable.agentId, agentId)));

  if (!mission) throw new Error("Mission introuvable");

  const [counts] = await db
    .select({ collectes: sql<number>`sum(case when statut = 'collecte' then 1 else 0 end)::int` })
    .from(enqueteMembresTable)
    .where(eq(enqueteMembresTable.missionId, missionId));

  await db
    .update(missionsEnqueteTable)
    .set({ statut: "soumise", membresCollectes: counts?.collectes ?? 0, updatedAt: new Date() })
    .where(eq(missionsEnqueteTable.id, missionId));
}
