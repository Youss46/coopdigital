import { type Request, type Response } from "express";
import { checkStock, creerAnomalies } from "../services/anomalieService";
import { db, entrepotsTable, mouvementsStockTable, usersTable } from "@workspace/db";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { EntreeStockBody, SortieStockBody } from "@workspace/api-zod";

async function calcStockActuel(entrepotId: number): Promise<number> {
  const [row] = await db
    .select({
      stock: sql<number>`
        coalesce(
          sum(case when type in ('entree', 'retour_refus') then poids_kg else -poids_kg end),
          0
        )::float
      `,
    })
    .from(mouvementsStockTable)
    .where(eq(mouvementsStockTable.entrepotId, entrepotId));
  return row?.stock ?? 0;
}

export async function getEntrepots(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

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
            sum(case when ${mouvementsStockTable.type} in ('entree', 'retour_refus')
                then ${mouvementsStockTable.poidsKg}::numeric
                else -${mouvementsStockTable.poidsKg}::numeric end),
            0
          )::float
        `,
      })
      .from(entrepotsTable)
      .leftJoin(mouvementsStockTable, eq(mouvementsStockTable.entrepotId, entrepotsTable.id))
      .where(eq(entrepotsTable.cooperativeId, cooperativeId))
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
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const entrepotId = req.query["entrepot_id"] ? parseInt(String(req.query["entrepot_id"])) : undefined;
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [eq(entrepotsTable.cooperativeId, cooperativeId)];
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
      .where(and(...conditions))
      .orderBy(desc(mouvementsStockTable.createdAt))
      .limit(200);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getMouvements");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function entreeStock(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = EntreeStockBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [entrepot] = await db.select({ id: entrepotsTable.id }).from(entrepotsTable)
      .where(and(eq(entrepotsTable.id, parse.data.entrepotId), eq(entrepotsTable.cooperativeId, cooperativeId))).limit(1);
    if (!entrepot) { res.status(403).json({ erreur: "Entrepôt introuvable ou non autorisé" }); return; }

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
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = SortieStockBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [entrepot] = await db.select({ id: entrepotsTable.id }).from(entrepotsTable)
      .where(and(eq(entrepotsTable.id, parse.data.entrepotId), eq(entrepotsTable.cooperativeId, cooperativeId))).limit(1);
    if (!entrepot) { res.status(403).json({ erreur: "Entrepôt introuvable ou non autorisé" }); return; }

    // Vérifier stock suffisant
    const stockActuel = await calcStockActuel(parse.data.entrepotId);
    if (stockActuel < parse.data.poidsKg) {
      res.status(400).json({
        erreur: `Stock insuffisant. Disponible : ${stockActuel.toFixed(2)} kg, demandé : ${parse.data.poidsKg} kg`,
      });
      return;
    }

    const agentId = (req as Request & { user?: { id: number } }).user?.id ?? null;

    // ── Détection anomalies ──────────────────────────────────────────────
    const anomaliesDetectees = await checkStock(cooperativeId, {
      entrepotId: parse.data.entrepotId,
      poidsKg: parse.data.poidsKg,
      stockActuel,
      agentId,
    });
    const anomaliesCritiques = anomaliesDetectees.filter((a) => a.niveauGravite === "critique");
    if (anomaliesCritiques.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesCritiques, "stocks");
      res.status(422).json({
        erreur: anomaliesCritiques[0]!.description,
        anomalie: "bloquee",
        anomalies: anomaliesCritiques,
      });
      return;
    }
    const anomaliesAttention = anomaliesDetectees.filter((a) => a.niveauGravite !== "critique");

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

    if (anomaliesAttention.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesAttention, "stocks", { entiteId: mouvement!.id, entiteType: "mouvement_stock" });
    }
    res.status(201).json(withNom);
  } catch (err) {
    req.log.error({ err }, "Erreur sortieStock");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createEntrepot(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const { nom, ville, capaciteKg, seuilAlerteKg } = req.body as {
    nom: string;
    ville: string;
    capaciteKg: number;
    seuilAlerteKg?: number;
  };

  if (!nom || !ville || !capaciteKg) {
    res.status(400).json({ erreur: "nom, ville et capaciteKg sont requis" });
    return;
  }

  try {
    const [entrepot] = await db
      .insert(entrepotsTable)
      .values({
        cooperativeId,
        nom: nom.trim(),
        ville: ville.trim(),
        capaciteKg: String(capaciteKg),
        seuilAlerteKg: seuilAlerteKg != null ? String(seuilAlerteKg) : null,
      })
      .returning();

    res.status(201).json(entrepot);
  } catch (err) {
    req.log.error({ err }, "Erreur createEntrepot");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getAlertes(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

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
            sum(case when ${mouvementsStockTable.type} in ('entree', 'retour_refus')
                then ${mouvementsStockTable.poidsKg}::numeric
                else -${mouvementsStockTable.poidsKg}::numeric end),
            0
          )::float
        `,
      })
      .from(entrepotsTable)
      .leftJoin(mouvementsStockTable, eq(mouvementsStockTable.entrepotId, entrepotsTable.id))
      .where(eq(entrepotsTable.cooperativeId, cooperativeId))
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
