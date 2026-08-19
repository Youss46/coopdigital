import { Request, Response } from "express";
import { db, anomaliesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

// ─── Liste des anomalies IA comptables ────────────────────────────────────────

export async function getAnomaliesIA(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

    const rows = await db.execute<{
      id: number; type_anomalie: string; niveau_gravite: string; description: string;
      entite_id: number | null; statut: string; created_at: string;
      ecriture_libelle: string | null; ecriture_date: string | null;
      compte_debit: string | null; compte_credit: string | null; ecriture_montant: string | null;
    }>(sql`
      SELECT
        a.id, a.type_anomalie, a.niveau_gravite, a.description,
        a.entite_id, a.statut, a.created_at::text,
        e.libelle        AS ecriture_libelle,
        e.date_ecriture::text AS ecriture_date,
        e.compte_debit,
        e.compte_credit,
        e.montant_fcfa::text AS ecriture_montant
      FROM anomalies a
      LEFT JOIN ecritures_comptables e
             ON e.id = a.entite_id AND a.entite_type = 'ecriture_comptable'
      WHERE a.cooperative_id = ${cooperativeId}
        AND a.module_source  = 'comptabilite_ia'
      ORDER BY a.created_at DESC
      LIMIT 100
    `);

    const nbNouvelles = rows.rows.filter(r => r.statut === "nouvelle").length;
    res.json({ anomalies: rows.rows, nbNouvelles });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Marquer une anomalie comme lue ──────────────────────────────────────────

export async function marquerLue(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    await db.update(anomaliesTable)
      .set({ statut: "en_cours" })
      .where(and(
        eq(anomaliesTable.id, id),
        eq(anomaliesTable.cooperativeId, cooperativeId),
        eq(anomaliesTable.moduleSource, "comptabilite_ia"),
      ));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Marquer toutes comme lues ────────────────────────────────────────────────

export async function marquerToutesLues(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
    await db.update(anomaliesTable)
      .set({ statut: "en_cours" })
      .where(and(
        eq(anomaliesTable.cooperativeId, cooperativeId),
        eq(anomaliesTable.moduleSource, "comptabilite_ia"),
        eq(anomaliesTable.statut, "nouvelle"),
      ));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
}
