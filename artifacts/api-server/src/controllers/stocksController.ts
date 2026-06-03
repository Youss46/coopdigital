import { type Request, type Response } from "express";
import { db, entrepotsTable, mouvementsStockTable, usersTable } from "@workspace/db";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { EntreeStockBody, SortieStockBody } from "@workspace/api-zod";

async function calcStockActuel(entrepotId: number): Promise<number> {
  const [row] = await db
    .select({
      stock: sql<number>`
        coalesce(
          sum(case when type = 'entree' then poids_kg else -poids_kg end),
          0
        )::float
      `,
    })
    .from(mouvementsStockTable)
    .where(eq(mouvementsStockTable.entrepotId, entrepotId));
  return row?.stock ?? 0;
}

export async function getEntrepots(req: Request, res: Response): Promise<void> {
  try {
    const entrepots = await db
      .select({
        id: entrepotsTable.id,
        cooperativeId: entrepotsTable.cooperativeId,
        nom: entrepotsTable.nom,
        ville: entrepotsTable.ville,
        capaciteKg: entrepotsTable.capaciteKg,
        seuilAlerteKg: entrepotsTable.seuilAlerteKg,
        createdAt: entrepotsTable.createdAt,
        stockActuelKg: sql<number>`
          coalesce(
            sum(case when ${mouvementsStockTable.type} = 'entree'
                then ${mouvementsStockTable.poidsKg}::numeric
                else -${mouvementsStockTable.poidsKg}::numeric end),
            0
          )::float
        `,
      })
      .from(entrepotsTable)
      .leftJoin(mouvementsStockTable, eq(mouvementsStockTable.entrepotId, entrepotsTable.id))
      .groupBy(entrepotsTable.id)
      .orderBy(entrepotsTable.nom);

    const result = entrepots.map((e) => ({
      ...e,
      pourcentageRemplissage: Math.round((e.stockActuelKg / parseFloat(e.capaciteKg)) * 100),
      enAlerte: e.seuilAlerteKg !== null && e.stockActuelKg <= parseFloat(e.seuilAlerteKg),
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur getEntrepots");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMouvements(req: Request, res: Response): Promise<void> {
  try {
    const entrepotId = req.query["entrepot_id"] ? parseInt(String(req.query["entrepot_id"])) : undefined;
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;

    const conditions = [];
    if (entrepotId) conditions.push(eq(mouvementsStockTable.entrepotId, entrepotId));
    if (dateDebut) conditions.push(gte(mouvementsStockTable.createdAt, new Date(dateDebut)));
    if (dateFin) conditions.push(lte(mouvementsStockTable.createdAt, new Date(dateFin + "T23:59:59Z")));

    const rows = await db
      .select({
        id: mouvementsStockTable.id,
        entrepotId: mouvementsStockTable.entrepotId,
        entrepotNom: entrepotsTable.nom,
        lotId: mouvementsStockTable.lotId,
        type: mouvementsStockTable.type,
        poidsKg: mouvementsStockTable.poidsKg,
        motif: mouvementsStockTable.motif,
        agentId: mouvementsStockTable.agentId,
        createdAt: mouvementsStockTable.createdAt,
      })
      .from(mouvementsStockTable)
      .leftJoin(entrepotsTable, eq(entrepotsTable.id, mouvementsStockTable.entrepotId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(mouvementsStockTable.createdAt))
      .limit(200);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getMouvements");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function entreeStock(req: Request, res: Response): Promise<void> {
  const parse = EntreeStockBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const agentId = (req as Request & { user?: { id: number } }).user?.id ?? null;
    const [mouvement] = await db
      .insert(mouvementsStockTable)
      .values({
        entrepotId: parse.data.entrepotId,
        lotId: parse.data.lotId ?? null,
        type: "entree",
        poidsKg: String(parse.data.poidsKg),
        motif: parse.data.motif ?? null,
        agentId,
      })
      .returning();

    const [withNom] = await db
      .select({
        id: mouvementsStockTable.id,
        entrepotId: mouvementsStockTable.entrepotId,
        entrepotNom: entrepotsTable.nom,
        lotId: mouvementsStockTable.lotId,
        type: mouvementsStockTable.type,
        poidsKg: mouvementsStockTable.poidsKg,
        motif: mouvementsStockTable.motif,
        agentId: mouvementsStockTable.agentId,
        createdAt: mouvementsStockTable.createdAt,
      })
      .from(mouvementsStockTable)
      .leftJoin(entrepotsTable, eq(entrepotsTable.id, mouvementsStockTable.entrepotId))
      .where(eq(mouvementsStockTable.id, mouvement!.id));

    res.status(201).json(withNom);
  } catch (err) {
    req.log.error({ err }, "Erreur entreeStock");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function sortieStock(req: Request, res: Response): Promise<void> {
  const parse = SortieStockBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    // Vérifier stock suffisant
    const stockActuel = await calcStockActuel(parse.data.entrepotId);
    if (stockActuel < parse.data.poidsKg) {
      res.status(400).json({
        erreur: `Stock insuffisant. Disponible : ${stockActuel.toFixed(2)} kg, demandé : ${parse.data.poidsKg} kg`,
      });
      return;
    }

    const agentId = (req as Request & { user?: { id: number } }).user?.id ?? null;
    const [mouvement] = await db
      .insert(mouvementsStockTable)
      .values({
        entrepotId: parse.data.entrepotId,
        lotId: parse.data.lotId ?? null,
        type: "sortie",
        poidsKg: String(parse.data.poidsKg),
        motif: parse.data.motif ?? null,
        agentId,
      })
      .returning();

    const [withNom] = await db
      .select({
        id: mouvementsStockTable.id,
        entrepotId: mouvementsStockTable.entrepotId,
        entrepotNom: entrepotsTable.nom,
        lotId: mouvementsStockTable.lotId,
        type: mouvementsStockTable.type,
        poidsKg: mouvementsStockTable.poidsKg,
        motif: mouvementsStockTable.motif,
        agentId: mouvementsStockTable.agentId,
        createdAt: mouvementsStockTable.createdAt,
      })
      .from(mouvementsStockTable)
      .leftJoin(entrepotsTable, eq(entrepotsTable.id, mouvementsStockTable.entrepotId))
      .where(eq(mouvementsStockTable.id, mouvement!.id));

    res.status(201).json(withNom);
  } catch (err) {
    req.log.error({ err }, "Erreur sortieStock");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getAlertes(req: Request, res: Response): Promise<void> {
  try {
    const entrepots = await db
      .select({
        id: entrepotsTable.id,
        cooperativeId: entrepotsTable.cooperativeId,
        nom: entrepotsTable.nom,
        ville: entrepotsTable.ville,
        capaciteKg: entrepotsTable.capaciteKg,
        seuilAlerteKg: entrepotsTable.seuilAlerteKg,
        createdAt: entrepotsTable.createdAt,
        stockActuelKg: sql<number>`
          coalesce(
            sum(case when ${mouvementsStockTable.type} = 'entree'
                then ${mouvementsStockTable.poidsKg}::numeric
                else -${mouvementsStockTable.poidsKg}::numeric end),
            0
          )::float
        `,
      })
      .from(entrepotsTable)
      .leftJoin(mouvementsStockTable, eq(mouvementsStockTable.entrepotId, entrepotsTable.id))
      .groupBy(entrepotsTable.id);

    const alertes = entrepots
      .filter((e) => e.seuilAlerteKg !== null && e.stockActuelKg <= parseFloat(e.seuilAlerteKg))
      .map((e) => ({
        ...e,
        pourcentageRemplissage: Math.round((e.stockActuelKg / parseFloat(e.capaciteKg)) * 100),
        enAlerte: true,
      }));

    res.json(alertes);
  } catch (err) {
    req.log.error({ err }, "Erreur getAlertes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
