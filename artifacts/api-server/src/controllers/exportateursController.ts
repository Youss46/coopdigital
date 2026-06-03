import { type Request, type Response } from "express";
import { db, exportateursTable, ventesExportateursTable } from "@workspace/db";
import { eq, sql, desc, and, lte } from "drizzle-orm";
import { CreateExportateurBody, CreateVenteBody, EncaisserVenteBody } from "@workspace/api-zod";

const venteSelect = {
  id: ventesExportateursTable.id,
  exportateurId: ventesExportateursTable.exportateurId,
  exportateurNom: exportateursTable.nom,
  lotId: ventesExportateursTable.lotId,
  poidsKg: ventesExportateursTable.poidsKg,
  prixUnitaireFcfa: ventesExportateursTable.prixUnitaireFcfa,
  montantTotalFcfa: ventesExportateursTable.montantTotalFcfa,
  dateVente: ventesExportateursTable.dateVente,
  dateEcheanceReglement: ventesExportateursTable.dateEcheanceReglement,
  montantRecuFcfa: ventesExportateursTable.montantRecuFcfa,
  soldeDuFcfa: ventesExportateursTable.soldeDuFcfa,
  statut: ventesExportateursTable.statut,
  createdAt: ventesExportateursTable.createdAt,
};

export async function listExportateurs(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db
      .select({
        id: exportateursTable.id,
        cooperativeId: exportateursTable.cooperativeId,
        nom: exportateursTable.nom,
        contact: exportateursTable.contact,
        ville: exportateursTable.ville,
        agrementNumero: exportateursTable.agrementNumero,
        createdAt: exportateursTable.createdAt,
        soldeTotalDuFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.soldeDuFcfa}), 0)::int`,
      })
      .from(exportateursTable)
      .leftJoin(
        ventesExportateursTable,
        and(
          eq(ventesExportateursTable.exportateurId, exportateursTable.id),
          sql`${ventesExportateursTable.statut} != 'regle'`
        )
      )
      .groupBy(exportateursTable.id)
      .orderBy(exportateursTable.nom);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur listExportateurs");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createExportateur(req: Request, res: Response): Promise<void> {
  const parse = CreateExportateurBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [exp] = await db
      .insert(exportateursTable)
      .values(parse.data)
      .returning();

    res.status(201).json({ ...exp, soldeTotalDuFcfa: 0 });
  } catch (err) {
    req.log.error({ err }, "Erreur createExportateur");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getExportateurById(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  try {
    const [exp] = await db
      .select({
        id: exportateursTable.id,
        cooperativeId: exportateursTable.cooperativeId,
        nom: exportateursTable.nom,
        contact: exportateursTable.contact,
        ville: exportateursTable.ville,
        agrementNumero: exportateursTable.agrementNumero,
        createdAt: exportateursTable.createdAt,
        soldeTotalDuFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.soldeDuFcfa}), 0)::int`,
      })
      .from(exportateursTable)
      .leftJoin(
        ventesExportateursTable,
        and(
          eq(ventesExportateursTable.exportateurId, exportateursTable.id),
          sql`${ventesExportateursTable.statut} != 'regle'`
        )
      )
      .where(eq(exportateursTable.id, id))
      .groupBy(exportateursTable.id);

    if (!exp) {
      res.status(404).json({ erreur: "Exportateur non trouvé" });
      return;
    }

    const ventes = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.exportateurId, id))
      .orderBy(desc(ventesExportateursTable.dateVente));

    res.json({ exportateur: exp, ventes, soldeTotalDuFcfa: exp.soldeTotalDuFcfa });
  } catch (err) {
    req.log.error({ err }, "Erreur getExportateurById");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function listVentes(req: Request, res: Response): Promise<void> {
  try {
    const exportateurId = req.query["exportateur_id"] ? parseInt(String(req.query["exportateur_id"])) : undefined;
    const statut = req.query["statut"] as string | undefined;

    const conditions = [];
    if (exportateurId) conditions.push(eq(ventesExportateursTable.exportateurId, exportateurId));
    if (statut)
      conditions.push(
        eq(ventesExportateursTable.statut, statut as "en_attente" | "partiel" | "regle" | "en_retard")
      );

    const rows = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ventesExportateursTable.dateVente));

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur listVentes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createVente(req: Request, res: Response): Promise<void> {
  const parse = CreateVenteBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const { exportateurId, lotId, poidsKg, prixUnitaireFcfa, dateVente, dateEcheanceReglement } = parse.data;
    const montantTotalFcfa = Math.round(poidsKg * prixUnitaireFcfa);

    const [vente] = await db
      .insert(ventesExportateursTable)
      .values({
        exportateurId,
        lotId: lotId ?? null,
        poidsKg: String(poidsKg),
        prixUnitaireFcfa,
        montantTotalFcfa,
        dateVente,
        dateEcheanceReglement: dateEcheanceReglement ?? null,
        montantRecuFcfa: 0,
        soldeDuFcfa: montantTotalFcfa,
        statut: "en_attente",
      })
      .returning();

    const [detail] = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.id, vente!.id));

    res.status(201).json(detail);
  } catch (err) {
    req.log.error({ err }, "Erreur createVente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function encaisserVente(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const parse = EncaisserVenteBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [current] = await db
      .select()
      .from(ventesExportateursTable)
      .where(eq(ventesExportateursTable.id, id));

    if (!current) {
      res.status(404).json({ erreur: "Vente non trouvée" });
      return;
    }

    const montantEncaisse = current.montantRecuFcfa + parse.data.montantFcfa;
    const solde = current.montantTotalFcfa - montantEncaisse;

    let statut: "en_attente" | "partiel" | "regle" | "en_retard" = "partiel";
    if (solde <= 0) {
      statut = "regle";
    } else if (
      current.dateEcheanceReglement &&
      new Date(current.dateEcheanceReglement) < new Date()
    ) {
      statut = "en_retard";
    }

    const [updated] = await db
      .update(ventesExportateursTable)
      .set({
        montantRecuFcfa: montantEncaisse,
        soldeDuFcfa: Math.max(0, solde),
        statut,
      })
      .where(eq(ventesExportateursTable.id, id))
      .returning();

    const [detail] = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.id, updated!.id));

    res.json(detail);
  } catch (err) {
    req.log.error({ err }, "Erreur encaisserVente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getCreances(req: Request, res: Response): Promise<void> {
  try {
    const aujourd_hui = new Date().toISOString().split("T")[0]!;
    const dansUneSemaine = new Date();
    dansUneSemaine.setDate(dansUneSemaine.getDate() + 7);
    const semaineFin = dansUneSemaine.toISOString().split("T")[0]!;

    const ventes = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(sql`${ventesExportateursTable.statut} != 'regle'`)
      .orderBy(ventesExportateursTable.dateEcheanceReglement);

    const totalDuFcfa = ventes.reduce((s, v) => s + v.soldeDuFcfa, 0);
    const enRetardFcfa = ventes
      .filter(
        (v) => v.dateEcheanceReglement && v.dateEcheanceReglement < aujourd_hui
      )
      .reduce((s, v) => s + v.soldeDuFcfa, 0);
    const aEchoirSemaineFcfa = ventes
      .filter(
        (v) =>
          v.dateEcheanceReglement &&
          v.dateEcheanceReglement >= aujourd_hui &&
          v.dateEcheanceReglement <= semaineFin
      )
      .reduce((s, v) => s + v.soldeDuFcfa, 0);

    res.json({ totalDuFcfa, enRetardFcfa, aEchoirSemaineFcfa, ventes });
  } catch (err) {
    req.log.error({ err }, "Erreur getCreances");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
