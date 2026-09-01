import { type Request, type Response } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  campagnesTable,
  membresTable,
  sacherieMouvementsTable,
  sacherieTypesSacsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  calculateSacherieCentralStock,
  calculateSacherieMemberBalance,
  type SacherieMovementType,
  type SacherieAdjustmentDirection,
} from "../services/sacherieRules.js";
import { getCooperativeSacherieConfig } from "../services/cooperativeSacherieService.js";

const MEMBER_DELEGATE_CATEGORY = "délégué de localités";
const MOVEMENT_TYPES: SacherieMovementType[] = ["entree", "attribution", "retour", "perte", "ajustement"];
const ADJUSTMENT_DIRECTIONS: SacherieAdjustmentDirection[] = ["plus", "moins"];

function cooperativeIdOf(req: Request): number | null {
  return req.user?.cooperativeId ?? null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function textValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= maxLength ? result : null;
}

async function getMovementRows(cooperativeId: number, typeSacId?: number) {
  return db
    .select()
    .from(sacherieMouvementsTable)
    .where(and(
      eq(sacherieMouvementsTable.cooperativeId, cooperativeId),
      ...(typeSacId ? [eq(sacherieMouvementsTable.typeSacId, typeSacId)] : []),
    ))
    .orderBy(desc(sacherieMouvementsTable.createdAt));
}

function stockView(
  article: typeof sacherieTypesSacsTable.$inferSelect,
  movements: Array<typeof sacherieMouvementsTable.$inferSelect>,
) {
  const stockDisponible = calculateSacherieCentralStock(movements);
  return {
    ...article,
    stockDisponible,
    enAlerte: stockDisponible <= article.stockMinimum,
  };
}

export async function listTypesSacs(req: Request, res: Response): Promise<void> {
  const cooperativeId = cooperativeIdOf(req);
  if (cooperativeId === null) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  try {
    const [articles, movements] = await Promise.all([
      db.select().from(sacherieTypesSacsTable)
        .where(eq(sacherieTypesSacsTable.cooperativeId, cooperativeId))
        .orderBy(asc(sacherieTypesSacsTable.nom)),
      getMovementRows(cooperativeId),
    ]);
    const byType = new Map<number, Array<typeof sacherieMouvementsTable.$inferSelect>>();
    for (const movement of movements) {
      const rows = byType.get(movement.typeSacId) ?? [];
      rows.push(movement);
      byType.set(movement.typeSacId, rows);
    }
    res.json(articles.map((article) => stockView(article, byType.get(article.id) ?? [])));
  } catch (error) {
    req.log.error({ err: error }, "Erreur listTypesSacs");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getSacherieConfig(req: Request, res: Response): Promise<void> {
  const cooperativeId = cooperativeIdOf(req);
  if (cooperativeId === null) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  try {
    const config = await getCooperativeSacherieConfig(cooperativeId);
    if (!config) {
      res.status(404).json({ erreur: "Coopérative introuvable" });
      return;
    }
    res.json(config);
  } catch (error) {
    req.log.error({ err: error }, "Erreur getSacherieConfig");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createTypeSac(req: Request, res: Response): Promise<void> {
  const cooperativeId = cooperativeIdOf(req);
  const userId = req.user?.id;
  if (cooperativeId === null || userId === undefined) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const nom = textValue(req.body?.nom, 120);
  const description = req.body?.description === undefined ? null : textValue(req.body.description, 1000);
  const stockMinimum = req.body?.stockMinimum === undefined ? 0 : Number(req.body.stockMinimum);
  if (!nom || !Number.isSafeInteger(stockMinimum) || stockMinimum < 0) {
    res.status(400).json({ erreur: "Le nom et un seuil minimum entier positif sont requis" });
    return;
  }
  try {
    const [existing] = await db.select({ id: sacherieTypesSacsTable.id })
      .from(sacherieTypesSacsTable)
      .where(and(eq(sacherieTypesSacsTable.cooperativeId, cooperativeId), eq(sacherieTypesSacsTable.nom, nom)))
      .limit(1);
    if (existing) {
      res.status(409).json({ erreur: "Ce type de sac existe déjà dans cette coopérative" });
      return;
    }
    const [created] = await db.insert(sacherieTypesSacsTable).values({
      cooperativeId,
      nom,
      description,
      stockMinimum,
      creePar: userId,
    }).returning();
    res.status(201).json({ ...created, stockDisponible: 0, enAlerte: stockMinimum >= 0 });
  } catch (error) {
    req.log.error({ err: error }, "Erreur createTypeSac");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function updateTypeSac(req: Request, res: Response): Promise<void> {
  const cooperativeId = cooperativeIdOf(req);
  const id = optionalInteger(req.params["id"]);
  if (cooperativeId === null || id === null) {
    res.status(400).json({ erreur: "Identifiant invalide" });
    return;
  }
  const values: Partial<typeof sacherieTypesSacsTable.$inferInsert> = { updatedAt: new Date() };
  if (req.body?.nom !== undefined) {
    const nom = textValue(req.body.nom, 120);
    if (!nom) { res.status(400).json({ erreur: "Nom invalide" }); return; }
    values.nom = nom;
  }
  if (req.body?.description !== undefined) values.description = req.body.description === null ? null : textValue(req.body.description, 1000);
  if (req.body?.stockMinimum !== undefined) {
    const stockMinimum = Number(req.body.stockMinimum);
    if (!Number.isSafeInteger(stockMinimum) || stockMinimum < 0) { res.status(400).json({ erreur: "Seuil minimum invalide" }); return; }
    values.stockMinimum = stockMinimum;
  }
  if (req.body?.actif !== undefined) {
    if (typeof req.body.actif !== "boolean") { res.status(400).json({ erreur: "Statut invalide" }); return; }
    values.actif = req.body.actif;
  }
  try {
    const [updated] = await db.update(sacherieTypesSacsTable).set(values)
      .where(and(eq(sacherieTypesSacsTable.id, id), eq(sacherieTypesSacsTable.cooperativeId, cooperativeId)))
      .returning();
    if (!updated) { res.status(404).json({ erreur: "Type de sac introuvable" }); return; }
    const movements = await getMovementRows(cooperativeId, id);
    res.json(stockView(updated, movements));
  } catch (error) {
    req.log.error({ err: error }, "Erreur updateTypeSac");
    res.status(500).json({ erreur: "Impossible de modifier ce type de sac" });
  }
}

export async function listMembresSacherie(req: Request, res: Response): Promise<void> {
  const cooperativeId = cooperativeIdOf(req);
  if (cooperativeId === null) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  try {
    const [members, movements] = await Promise.all([
      db.select({
        id: membresTable.id,
        numeroMembre: membresTable.numeroMembre,
        nom: membresTable.nom,
        prenoms: membresTable.prenoms,
        village: membresTable.village,
        statut: membresTable.statutMembre,
        categorieMembre: membresTable.categorieMembre,
      }).from(membresTable).where(and(
        eq(membresTable.cooperativeId, cooperativeId),
        eq(membresTable.categorieMembre, MEMBER_DELEGATE_CATEGORY),
      )).orderBy(asc(membresTable.nom), asc(membresTable.prenoms)),
      db.select().from(sacherieMouvementsTable).where(eq(sacherieMouvementsTable.cooperativeId, cooperativeId)),
    ]);
    const balances = new Map<number, number>();
    for (const movement of movements) {
      if (movement.membreId === null) continue;
      balances.set(movement.membreId, calculateSacherieMemberBalance(movements, movement.membreId));
    }
    res.json(members.map((member) => ({ ...member, sacsDetenus: balances.get(member.id) ?? 0 })));
  } catch (error) {
    req.log.error({ err: error }, "Erreur listMembresSacherie");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function listMouvementsSacherie(req: Request, res: Response): Promise<void> {
  const cooperativeId = cooperativeIdOf(req);
  if (cooperativeId === null) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  try {
    const typeSacId = optionalInteger(req.query["typeSacId"] ?? req.query["type_sac_id"]);
    const rows = await db.select({
      id: sacherieMouvementsTable.id,
      cooperativeId: sacherieMouvementsTable.cooperativeId,
      typeSacId: sacherieMouvementsTable.typeSacId,
      type: sacherieMouvementsTable.type,
      sens: sacherieMouvementsTable.sens,
      quantite: sacherieMouvementsTable.quantite,
      membreId: sacherieMouvementsTable.membreId,
      campagneId: sacherieMouvementsTable.campagneId,
      motif: sacherieMouvementsTable.motif,
      reference: sacherieMouvementsTable.reference,
      creePar: sacherieMouvementsTable.creePar,
      createdAt: sacherieMouvementsTable.createdAt,
      typeSacNom: sacherieTypesSacsTable.nom,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      campagneLibelle: campagnesTable.libelle,
    }).from(sacherieMouvementsTable)
      .innerJoin(sacherieTypesSacsTable, eq(sacherieTypesSacsTable.id, sacherieMouvementsTable.typeSacId))
      .leftJoin(membresTable, eq(membresTable.id, sacherieMouvementsTable.membreId))
      .leftJoin(campagnesTable, eq(campagnesTable.id, sacherieMouvementsTable.campagneId))
      .where(and(
        eq(sacherieMouvementsTable.cooperativeId, cooperativeId),
        ...(typeSacId ? [eq(sacherieMouvementsTable.typeSacId, typeSacId)] : []),
      ))
      .orderBy(desc(sacherieMouvementsTable.createdAt))
      .limit(300);
    res.json(rows);
  } catch (error) {
    req.log.error({ err: error }, "Erreur listMouvementsSacherie");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getResumeSacherie(req: Request, res: Response): Promise<void> {
  const cooperativeId = cooperativeIdOf(req);
  if (cooperativeId === null) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  try {
    const [articles, movements, memberCount] = await Promise.all([
      db.select().from(sacherieTypesSacsTable).where(eq(sacherieTypesSacsTable.cooperativeId, cooperativeId)),
      db.select().from(sacherieMouvementsTable).where(eq(sacherieMouvementsTable.cooperativeId, cooperativeId)),
      db.select({ count: sql<number>`count(*)::int` }).from(membresTable).where(and(
        eq(membresTable.cooperativeId, cooperativeId),
        eq(membresTable.categorieMembre, MEMBER_DELEGATE_CATEGORY),
      )),
    ]);
    const stockDisponible = calculateSacherieCentralStock(movements);
    const sacsDetenus = Array.from(new Set(movements.flatMap((movement) => movement.membreId === null ? [] : [movement.membreId])))
      .reduce((total, membreId) => total + calculateSacherieMemberBalance(movements, membreId), 0);
    const alertes = articles.filter((article) => {
      const articleMovements = movements.filter((movement) => movement.typeSacId === article.id);
      return stockView(article, articleMovements).enAlerte;
    }).length;
    res.json({
      stockDisponible,
      sacsDetenus,
      typesActifs: articles.filter((article) => article.actif).length,
      membresDelegues: memberCount[0]?.count ?? 0,
      alertes,
    });
  } catch (error) {
    req.log.error({ err: error }, "Erreur getResumeSacherie");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createMouvementSacherie(req: Request, res: Response): Promise<void> {
  const cooperativeId = cooperativeIdOf(req);
  const userId = req.user?.id;
  if (cooperativeId === null || userId === undefined) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const type = req.body?.type as SacherieMovementType;
  const typeSacId = positiveInteger(req.body?.typeSacId ?? req.body?.type_sac_id);
  const quantite = positiveInteger(req.body?.quantite);
  const reference = textValue(req.body?.reference ?? req.get("Idempotency-Key"), 120);
  const membreId = optionalInteger(req.body?.membreId ?? req.body?.membre_id);
  const campagneId = optionalInteger(req.body?.campagneId ?? req.body?.campagne_id);
  const sens = req.body?.sens as SacherieAdjustmentDirection | undefined;
  const motif = req.body?.motif === undefined ? null : textValue(req.body.motif, 1000);

  if (!MOVEMENT_TYPES.includes(type) || typeSacId === null || quantite === null || !reference) {
    res.status(400).json({ erreur: "Type, sac, quantité et référence d'idempotence sont requis" });
    return;
  }
  if (type === "ajustement" && !ADJUSTMENT_DIRECTIONS.includes(sens as SacherieAdjustmentDirection)) {
    res.status(400).json({ erreur: "Le sens plus ou moins est requis pour un ajustement" });
    return;
  }
  if (type !== "ajustement" && sens !== undefined && sens !== null) {
    res.status(400).json({ erreur: "Le sens ne s'applique qu'aux ajustements" });
    return;
  }
  if ((type === "attribution" || type === "retour") && membreId === null) {
    res.status(400).json({ erreur: "Un membre délégué est requis pour cette opération" });
    return;
  }
  if (type === "attribution" && campagneId === null) {
    res.status(400).json({ erreur: "Une campagne est requise pour une attribution" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(sacherieMouvementsTable).where(and(
        eq(sacherieMouvementsTable.cooperativeId, cooperativeId),
        eq(sacherieMouvementsTable.reference, reference),
      )).limit(1);
      if (existing) {
        const sameRequest = existing.type === type && existing.typeSacId === typeSacId
          && existing.quantite === quantite && existing.membreId === membreId && existing.campagneId === campagneId
          && existing.sens === (sens ?? null);
        if (!sameRequest) {
          const error = new Error("Cette référence est déjà utilisée pour une autre opération");
          (error as Error & { code?: string }).code = "IDEMPOTENCY_CONFLICT";
          throw error;
        }
        return { movement: existing, idempotent: true };
      }

      await tx.execute(sql`SELECT id FROM sacherie_types_sacs WHERE id = ${typeSacId} AND cooperative_id = ${cooperativeId} FOR UPDATE`);
      const [existingAfterLock] = await tx.select().from(sacherieMouvementsTable).where(and(
        eq(sacherieMouvementsTable.cooperativeId, cooperativeId),
        eq(sacherieMouvementsTable.reference, reference),
      )).limit(1);
      if (existingAfterLock) {
        const sameRequest = existingAfterLock.type === type && existingAfterLock.typeSacId === typeSacId
          && existingAfterLock.quantite === quantite && existingAfterLock.membreId === membreId
          && existingAfterLock.campagneId === campagneId && existingAfterLock.sens === (sens ?? null);
        if (!sameRequest) {
          const error = new Error("Cette référence est déjà utilisée pour une autre opération");
          (error as Error & { code?: string }).code = "IDEMPOTENCY_CONFLICT";
          throw error;
        }
        return { movement: existingAfterLock, idempotent: true };
      }
      const [article] = await tx.select().from(sacherieTypesSacsTable).where(and(
        eq(sacherieTypesSacsTable.id, typeSacId),
        eq(sacherieTypesSacsTable.cooperativeId, cooperativeId),
      )).limit(1);
      if (!article) {
        const error = new Error("Type de sac introuvable");
        (error as Error & { code?: string }).code = "ARTICLE_NOT_FOUND";
        throw error;
      }
      if (!article.actif && type !== "ajustement") {
        const error = new Error("Ce type de sac est désactivé");
        (error as Error & { code?: string }).code = "ARTICLE_DISABLED";
        throw error;
      }

      if (membreId !== null) {
        const [member] = await tx.select({ id: membresTable.id }).from(membresTable).where(and(
          eq(membresTable.id, membreId),
          eq(membresTable.cooperativeId, cooperativeId),
          eq(membresTable.categorieMembre, MEMBER_DELEGATE_CATEGORY),
        )).limit(1);
        if (!member) {
          const error = new Error("Membre délégué introuvable dans cette coopérative");
          (error as Error & { code?: string }).code = "MEMBER_NOT_FOUND";
          throw error;
        }
      }
      if (campagneId !== null) {
        const [campaign] = await tx.select({ id: campagnesTable.id }).from(campagnesTable).where(and(
          eq(campagnesTable.id, campagneId),
          eq(campagnesTable.cooperativeId, cooperativeId),
        )).limit(1);
        if (!campaign) {
          const error = new Error("Campagne introuvable dans cette coopérative");
          (error as Error & { code?: string }).code = "CAMPAIGN_NOT_FOUND";
          throw error;
        }
      }

      const currentMovements = await tx.select().from(sacherieMouvementsTable).where(and(
        eq(sacherieMouvementsTable.cooperativeId, cooperativeId),
        eq(sacherieMouvementsTable.typeSacId, typeSacId),
      ));
      const stockDisponible = calculateSacherieCentralStock(currentMovements);
      if ((type === "attribution" || (type === "perte" && membreId === null) || (type === "ajustement" && sens === "moins"))
        && stockDisponible < quantite) {
        const error = new Error(`Stock disponible insuffisant (${stockDisponible} sac(s))`);
        (error as Error & { code?: string }).code = "INSUFFICIENT_STOCK";
        throw error;
      }
      if (type === "retour" || (type === "perte" && membreId !== null)) {
        if (membreId === null) {
          const error = new Error("Un membre délégué est requis pour cette opération");
          (error as Error & { code?: string }).code = "MEMBER_NOT_FOUND";
          throw error;
        }
        const memberBalance = calculateSacherieMemberBalance(currentMovements, membreId);
        if (memberBalance < quantite) {
          const error = new Error(`Le membre ne détient que ${memberBalance} sac(s) de ce type`);
          (error as Error & { code?: string }).code = "INSUFFICIENT_MEMBER_BALANCE";
          throw error;
        }
      }
      const [movement] = await tx.insert(sacherieMouvementsTable).values({
        cooperativeId,
        typeSacId,
        type,
        sens: type === "ajustement" ? sens : null,
        quantite,
        membreId,
        campagneId,
        motif,
        reference,
        creePar: userId,
      }).returning();
      return { movement, idempotent: false };
    });
    res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "IDEMPOTENCY_CONFLICT") { res.status(409).json({ erreur: (error as Error).message, code }); return; }
    if (code === "ARTICLE_NOT_FOUND" || code === "MEMBER_NOT_FOUND" || code === "CAMPAIGN_NOT_FOUND") { res.status(404).json({ erreur: (error as Error).message, code }); return; }
    if (code === "ARTICLE_DISABLED" || code === "INSUFFICIENT_STOCK" || code === "INSUFFICIENT_MEMBER_BALANCE") { res.status(409).json({ erreur: (error as Error).message, code }); return; }
    if (code === "23505") { res.status(409).json({ erreur: "Cette référence d'opération existe déjà", code: "IDEMPOTENCY_CONFLICT" }); return; }
    req.log.error({ err: error }, "Erreur createMouvementSacherie");
    res.status(500).json({ erreur: "Impossible d'enregistrer le mouvement" });
  }
}