import {
  db,
  sessionsPeseeTable,
  lignesPeseeTable,
  membresTable,
} from "@workspace/db";
import { eq, and, desc, sql, isNull } from "drizzle-orm";

// ─── Génération numéro de session ─────────────────────────────────────────────
async function generateNumeroSession(cooperativeId: number): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PSE-${year}-`;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionsPeseeTable)
    .where(
      and(
        eq(sessionsPeseeTable.cooperativeId, cooperativeId),
        sql`to_char(${sessionsPeseeTable.createdAt}, 'YYYY') = ${String(year)}`,
      ),
    );
  const seq = (row?.count ?? 0) + 1;
  return `${prefix}${String(seq).padStart(5, "0")}`;
}

// ─── Créer une session ────────────────────────────────────────────────────────
export async function createSession(
  cooperativeId: number,
  data: {
    membreId?: number;
    produit?: string;
    operation?: string;
    peseurId?: number;
    balanceId?: number;
    notes?: string;
  },
) {
  const numeroSession = await generateNumeroSession(cooperativeId);
  const [session] = await db
    .insert(sessionsPeseeTable)
    .values({
      cooperativeId,
      numeroSession,
      membreId: data.membreId,
      produit: data.produit ?? "cacao",
      operation: data.operation ?? "reception",
      peseurId: data.peseurId,
      balanceId: data.balanceId,
      notes: data.notes,
    })
    .returning();
  return session!;
}

// ─── Lister sessions (avec lignes count) ──────────────────────────────────────
export async function getSessions(
  cooperativeId: number,
  opts: { statut?: string; membreId?: number; limit?: number } = {},
) {
  const conditions = [eq(sessionsPeseeTable.cooperativeId, cooperativeId)];
  if (opts.statut) {
    conditions.push(
      sql`${sessionsPeseeTable.statut}::text = ${opts.statut}`,
    );
  }
  if (opts.membreId) {
    conditions.push(eq(sessionsPeseeTable.membreId, opts.membreId));
  }

  const sessions = await db
    .select({
      id: sessionsPeseeTable.id,
      cooperativeId: sessionsPeseeTable.cooperativeId,
      numeroSession: sessionsPeseeTable.numeroSession,
      membreId: sessionsPeseeTable.membreId,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      produit: sessionsPeseeTable.produit,
      operation: sessionsPeseeTable.operation,
      statut: sessionsPeseeTable.statut,
      poidsTotalKg: sessionsPeseeTable.poidsTotalKg,
      nbSacsTotal: sessionsPeseeTable.nbSacsTotal,
      nbLignes: sql<number>`(
        select count(*) from lignes_pesee lp where lp.session_id = ${sessionsPeseeTable.id}
      )::int`,
      dateDebut: sessionsPeseeTable.dateDebut,
      dateFin: sessionsPeseeTable.dateFin,
      notes: sessionsPeseeTable.notes,
      livraisonId: sessionsPeseeTable.livraisonId,
      createdAt: sessionsPeseeTable.createdAt,
    })
    .from(sessionsPeseeTable)
    .leftJoin(membresTable, eq(membresTable.id, sessionsPeseeTable.membreId))
    .where(and(...conditions))
    .orderBy(desc(sessionsPeseeTable.createdAt))
    .limit(opts.limit ?? 50);

  return sessions;
}

// ─── Détail session avec lignes ───────────────────────────────────────────────
export async function getSessionDetail(cooperativeId: number, sessionId: number) {
  const [session] = await db
    .select({
      id: sessionsPeseeTable.id,
      cooperativeId: sessionsPeseeTable.cooperativeId,
      numeroSession: sessionsPeseeTable.numeroSession,
      membreId: sessionsPeseeTable.membreId,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      produit: sessionsPeseeTable.produit,
      operation: sessionsPeseeTable.operation,
      statut: sessionsPeseeTable.statut,
      poidsTotalKg: sessionsPeseeTable.poidsTotalKg,
      nbSacsTotal: sessionsPeseeTable.nbSacsTotal,
      dateDebut: sessionsPeseeTable.dateDebut,
      dateFin: sessionsPeseeTable.dateFin,
      notes: sessionsPeseeTable.notes,
      livraisonId: sessionsPeseeTable.livraisonId,
      createdAt: sessionsPeseeTable.createdAt,
    })
    .from(sessionsPeseeTable)
    .leftJoin(membresTable, eq(membresTable.id, sessionsPeseeTable.membreId))
    .where(
      and(
        eq(sessionsPeseeTable.id, sessionId),
        eq(sessionsPeseeTable.cooperativeId, cooperativeId),
      ),
    )
    .limit(1);

  if (!session) return null;

  const lignes = await db
    .select()
    .from(lignesPeseeTable)
    .where(eq(lignesPeseeTable.sessionId, sessionId))
    .orderBy(lignesPeseeTable.numeroPassage);

  return { ...session, lignes };
}

// ─── Ajouter une ligne ────────────────────────────────────────────────────────
export async function addLigne(
  cooperativeId: number,
  sessionId: number,
  data: { nbSacs: number; poidsBrutKg: number; tareKg?: number; notes?: string },
) {
  // Vérifie que la session appartient à la coop et est en cours
  const [session] = await db
    .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut, nbSacsTotal: sessionsPeseeTable.nbSacsTotal, poidsTotalKg: sessionsPeseeTable.poidsTotalKg })
    .from(sessionsPeseeTable)
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!session) throw new Error("Session introuvable");
  if (session.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");

  // Numéro de passage
  const [{ maxPassage }] = await db
    .select({ maxPassage: sql<number>`coalesce(max(${lignesPeseeTable.numeroPassage}), 0)::int` })
    .from(lignesPeseeTable)
    .where(eq(lignesPeseeTable.sessionId, sessionId));

  const [ligne] = await db
    .insert(lignesPeseeTable)
    .values({
      sessionId,
      numeroPassage: maxPassage + 1,
      nbSacs: data.nbSacs,
      poidsBrutKg: String(data.poidsBrutKg),
      tareKg: String(data.tareKg ?? 0),
      notes: data.notes,
    })
    .returning();

  // Mise à jour des totaux
  const poidsNet = data.poidsBrutKg - (data.tareKg ?? 0);
  await db
    .update(sessionsPeseeTable)
    .set({
      nbSacsTotal: (session.nbSacsTotal ?? 0) + data.nbSacs,
      poidsTotalKg: String(parseFloat(String(session.poidsTotalKg ?? 0)) + poidsNet),
    })
    .where(eq(sessionsPeseeTable.id, sessionId));

  return ligne!;
}

// ─── Supprimer une ligne ──────────────────────────────────────────────────────
export async function deleteLigne(cooperativeId: number, sessionId: number, ligneId: number) {
  const [session] = await db
    .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut })
    .from(sessionsPeseeTable)
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!session) throw new Error("Session introuvable");
  if (session.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");

  const [ligne] = await db
    .select()
    .from(lignesPeseeTable)
    .where(and(eq(lignesPeseeTable.id, ligneId), eq(lignesPeseeTable.sessionId, sessionId)))
    .limit(1);

  if (!ligne) throw new Error("Ligne introuvable");

  await db.delete(lignesPeseeTable).where(eq(lignesPeseeTable.id, ligneId));

  // Recalcul des totaux depuis les lignes restantes
  const [totaux] = await db
    .select({
      nbSacs: sql<number>`coalesce(sum(${lignesPeseeTable.nbSacs}), 0)::int`,
      poids: sql<number>`coalesce(sum(${lignesPeseeTable.poidsBrutKg}::numeric - ${lignesPeseeTable.tareKg}::numeric), 0)::float`,
    })
    .from(lignesPeseeTable)
    .where(eq(lignesPeseeTable.sessionId, sessionId));

  await db
    .update(sessionsPeseeTable)
    .set({ nbSacsTotal: totaux?.nbSacs ?? 0, poidsTotalKg: String(totaux?.poids ?? 0) })
    .where(eq(sessionsPeseeTable.id, sessionId));
}

// ─── Terminer une session ─────────────────────────────────────────────────────
export async function terminerSession(cooperativeId: number, sessionId: number) {
  const detail = await getSessionDetail(cooperativeId, sessionId);
  if (!detail) throw new Error("Session introuvable");
  if (detail.statut !== "en_cours") throw new Error("Session déjà terminée ou annulée");
  if ((detail.lignes?.length ?? 0) === 0) throw new Error("Aucune pesée enregistrée dans cette session");

  const [updated] = await db
    .update(sessionsPeseeTable)
    .set({ statut: "terminee", dateFin: new Date() })
    .where(eq(sessionsPeseeTable.id, sessionId))
    .returning();

  return { ...detail, statut: "terminee" as const, dateFin: updated?.dateFin };
}

// ─── Annuler une session ──────────────────────────────────────────────────────
export async function annulerSession(cooperativeId: number, sessionId: number) {
  const [session] = await db
    .select({ id: sessionsPeseeTable.id, statut: sessionsPeseeTable.statut })
    .from(sessionsPeseeTable)
    .where(and(eq(sessionsPeseeTable.id, sessionId), eq(sessionsPeseeTable.cooperativeId, cooperativeId)))
    .limit(1);

  if (!session) throw new Error("Session introuvable");
  if (session.statut === "terminee") throw new Error("Session déjà terminée");

  await db
    .update(sessionsPeseeTable)
    .set({ statut: "annulee", dateFin: new Date() })
    .where(eq(sessionsPeseeTable.id, sessionId));
}
