import { type Request, type Response } from "express";
import { db, membresTable, livraisonsTable, campagnesTable } from "@workspace/db";
import { eq, and, or, ilike, sql, desc, notInArray } from "drizzle-orm";
import { CreateMembreBody, UpdateMembreBody } from "@workspace/api-zod";
import { computeCodeMembre } from "../services/portailService";

function enrichMembre<T extends { id: number; dateAdhesion: string }>(m: T) {
  return { ...m, codeMembre: computeCodeMembre(m.id, m.dateAdhesion) };
}

export async function listMembres(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "20"))));
    const search = String(req.query["search"] ?? "").trim();
    const statut = req.query["statut"] as string | undefined;
    const offset = (page - 1) * limit;

    const cooperativeId = req.user?.cooperativeId;

    const conditions = [];
    if (cooperativeId) conditions.push(eq(membresTable.cooperativeId, cooperativeId));
    if (statut === "actif" || statut === "inactif") conditions.push(eq(membresTable.statut, statut));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(membresTable.nom, pattern),
          ilike(membresTable.prenoms, pattern),
          ilike(membresTable.telephone, pattern),
          sql`coalesce(${membresTable.village}, '') ilike ${pattern}`,
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [membres, [{ count }]] = await Promise.all([
      db.select().from(membresTable).where(where).orderBy(desc(membresTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(membresTable).where(where),
    ]);

    res.json({ membres: membres.map(enrichMembre), total: count, page, limit });
  } catch (err) {
    req.log.error({ err }, "Erreur listMembres");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMembreById(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const [membre] = await db.select().from(membresTable).where(eq(membresTable.id, id)).limit(1);
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreById");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createMembre(req: Request, res: Response): Promise<void> {
  const parse = CreateMembreBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const data = parse.data;

  if (!data.superficieHa || parseFloat(String(data.superficieHa)) <= 0) {
    res.status(400).json({ erreur: "La superficie doit être supérieure à 0" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(membresTable)
      .where(and(eq(membresTable.cooperativeId, data.cooperativeId), eq(membresTable.telephone, data.telephone)))
      .limit(1);

    if (existing) {
      res.status(400).json({ erreur: "Ce numéro de téléphone est déjà utilisé dans cette coopérative" });
      return;
    }

    const [membre] = await db
      .insert(membresTable)
      .values({
        ...data,
        dateAdhesion: data.dateAdhesion ?? new Date().toISOString().split("T")[0]!,
      })
      .returning();

    res.status(201).json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur createMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function updateMembre(req: Request, res: Response): Promise<void> {
  const parse = UpdateMembreBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides" });
    return;
  }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const [membre] = await db
      .update(membresTable)
      .set({ ...parse.data, updatedAt: new Date() })
      .where(eq(membresTable.id, id))
      .returning();

    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur updateMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMembreByQr(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params["token"] ?? "");
    const [membre] = await db.select().from(membresTable).where(eq(membresTable.qrCodeToken, token)).limit(1);
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreByQr");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMembreHistorique(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { avancesTable, livraisonsTable, paiementsTable } = await import("@workspace/db");

    const [livraisons, avances, paiements] = await Promise.all([
      db.select().from(livraisonsTable).where(eq(livraisonsTable.membreId, id)).orderBy(desc(livraisonsTable.dateLivraison)),
      db.select().from(avancesTable).where(eq(avancesTable.membreId, id)).orderBy(desc(avancesTable.dateOctroi)),
      db.select().from(paiementsTable).where(eq(paiementsTable.membreId, id)).orderBy(desc(paiementsTable.createdAt)),
    ]);

    res.json({ livraisons, avances, paiements });
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreHistorique");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function modifierStatutMembre(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { statut } = req.body as { statut: string };
    if (statut !== "actif" && statut !== "inactif") {
      res.status(400).json({ erreur: "Statut invalide (actif ou inactif attendu)" });
      return;
    }
    const [membre] = await db
      .update(membresTable)
      .set({ statut })
      .where(eq(membresTable.id, id))
      .returning();
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur modifierStatutMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function desactiverMembresSansCampagne(req: Request, res: Response): Promise<void> {
  try {
    const campagneId = parseInt(String(req.params["id"] ?? "0"));
    const cooperativeId = req.user?.cooperativeId ?? 1;

    const campagne = await db.query.campagnesTable.findFirst({
      where: and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)),
    });
    if (!campagne) {
      res.status(404).json({ erreur: "Campagne introuvable" });
      return;
    }

    const livraisons = await db
      .selectDistinct({ membreId: livraisonsTable.membreId })
      .from(livraisonsTable)
      .where(eq(livraisonsTable.campagneId, campagneId));

    const membresAvecLivraison = livraisons.map((l) => l.membreId).filter((id): id is number => id !== null);

    let desactivesCount = 0;
    const baseWhere = and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"));

    if (membresAvecLivraison.length > 0) {
      const updated = await db
        .update(membresTable)
        .set({ statut: "inactif" })
        .where(and(baseWhere, notInArray(membresTable.id, membresAvecLivraison)))
        .returning({ id: membresTable.id });
      desactivesCount = updated.length;
    } else {
      const updated = await db
        .update(membresTable)
        .set({ statut: "inactif" })
        .where(baseWhere)
        .returning({ id: membresTable.id });
      desactivesCount = updated.length;
    }

    res.json({ desactivesCount, campagneId });
  } catch (err) {
    req.log.error({ err }, "Erreur desactiverMembresSansCampagne");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
