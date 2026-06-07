import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { tauxChangeTable, devisesTable, ventesExportateursTable, exportateursTable } from "@workspace/db";
import { eq, and, desc, asc, gte, sql } from "drizzle-orm";
import { getTauxActuel, convertir } from "../services/deviseService";

const coopId = (req: import("express").Request) => req.user?.cooperativeId ?? 1;

// ─── DEVISES ─────────────────────────────────────────────────────────────────

export async function listDevises(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(devisesTable)
      .where(eq(devisesTable.actif, true))
      .orderBy(asc(devisesTable.code));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur listDevises");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── TAUX DE CHANGE ───────────────────────────────────────────────────────────

export async function getTauxActuels(req: Request, res: Response): Promise<void> {
  try {
    // Un taux par devise (le plus récent)
    const rows = await db.execute(sql`
      SELECT DISTINCT ON (devise_source)
        t.id, t.cooperative_id, t.devise_source, t.devise_cible,
        t.taux, t.date_application, t.source_taux, t.created_at,
        u.email AS saisi_par_email
      FROM taux_change t
      LEFT JOIN users u ON u.id = t.saisi_par
      WHERE t.cooperative_id = ${coopId(req)}
      ORDER BY devise_source, date_application DESC, id DESC
    `);
    res.json(rows.rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getTauxActuels");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createTaux(req: Request, res: Response): Promise<void> {
  try {
    const { deviseSource, taux, dateApplication, sourceTaux } = req.body as Record<string, unknown>;
    const userId = req.user?.id;

    const [row] = await db.insert(tauxChangeTable).values({
      cooperativeId:   coopId(req),
      deviseSource:    String(deviseSource ?? ""),
      deviseCible:     "XOF",
      taux:            String(Number(taux ?? 0)),
      dateApplication: String(dateApplication ?? new Date().toISOString().slice(0, 10)),
      sourceTaux:      String(sourceTaux ?? "manuel"),
      saisiPar:        userId ?? null,
    }).returning();

    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Erreur createTaux");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getHistoriqueTaux(req: Request, res: Response): Promise<void> {
  try {
    const devise = String(req.params["devise"] ?? "EUR");
    const dateLimit = new Date();
    dateLimit.setMonth(dateLimit.getMonth() - 12);
    const dateLimitStr = dateLimit.toISOString().slice(0, 10);

    const rows = await db
      .select({
        id:              tauxChangeTable.id,
        taux:            tauxChangeTable.taux,
        dateApplication: tauxChangeTable.dateApplication,
        sourceTaux:      tauxChangeTable.sourceTaux,
      })
      .from(tauxChangeTable)
      .where(
        and(
          eq(tauxChangeTable.cooperativeId, coopId(req)),
          eq(tauxChangeTable.deviseSource, devise),
          gte(tauxChangeTable.dateApplication, dateLimitStr),
        )
      )
      .orderBy(asc(tauxChangeTable.dateApplication));

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getHistoriqueTaux");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getTauxActuelDevise(req: Request, res: Response): Promise<void> {
  try {
    const devise = String(req.params["devise"] ?? "EUR");
    const result = await getTauxActuel(devise);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur getTauxActuelDevise");
    res.status(404).json({ erreur: String(err) });
  }
}

export async function convertirMontant(req: Request, res: Response): Promise<void> {
  try {
    const { montant, deviseSource, date } = req.body as Record<string, unknown>;
    const dateStr = String(date ?? new Date().toISOString().slice(0, 10));
    const result = await convertir(Number(montant ?? 0), String(deviseSource ?? "EUR"), dateStr);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur convertirMontant");
    res.status(400).json({ erreur: String(err) });
  }
}

// ─── RAPPORT GAINS/PERTES DE CHANGE ─────────────────────────────────────────

export async function getRapportGainPerte(req: Request, res: Response): Promise<void> {
  try {
    // Ventes avec devise étrangère, groupées par exportateur
    const rows = await db
      .select({
        exportateurId:       ventesExportateursTable.exportateurId,
        exportateurNom:      exportateursTable.nom,
        devise:              ventesExportateursTable.deviseFacturation,
        totalMontantFcfa:    sql<string>`COALESCE(SUM(montant_total_fcfa), 0)`,
        totalConverti:       sql<string>`COALESCE(SUM(montant_fcfa_converti), 0)`,
        totalGainPerte:      sql<string>`COALESCE(SUM(gain_perte_change_fcfa), 0)`,
        nbVentes:            sql<number>`COUNT(*)`,
      })
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
      .where(
        and(
          eq(exportateursTable.cooperativeId, coopId(req)),
          sql`${ventesExportateursTable.deviseFacturation} != 'XOF'`,
        )
      )
      .groupBy(
        ventesExportateursTable.exportateurId,
        exportateursTable.nom,
        ventesExportateursTable.deviseFacturation,
      );

    const totalGain = rows.reduce((s, r) => {
      const gp = Number(r.totalGainPerte);
      return gp > 0 ? s + gp : s;
    }, 0);
    const totalPerte = rows.reduce((s, r) => {
      const gp = Number(r.totalGainPerte);
      return gp < 0 ? s + gp : s;
    }, 0);
    const soldeNet = totalGain + totalPerte;

    res.json({
      details: rows,
      totalGain,
      totalPerte: Math.abs(totalPerte),
      soldeNet,
      ecrituresComptables: soldeNet > 0
        ? [
            { debit: "521 Banque", credit: "776 Gains de change", montant: soldeNet, libelle: "Gain de change campagne" },
          ]
        : soldeNet < 0
        ? [
            { debit: "676 Pertes de change", credit: "521 Banque", montant: Math.abs(soldeNet), libelle: "Perte de change campagne" },
          ]
        : [],
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getRapportGainPerte");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
