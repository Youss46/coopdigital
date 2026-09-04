import { type Request, type Response, type NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const ACCESS_ERROR = {
  erreur: "Accès refusé",
  message: "Seul le Peseur central peut effectuer cette opération.",
};

/**
 * Les contrôles d'expédition sont des pesées de magasin central.
 * Le rôle `peseur` peut aussi être rattaché à un délégué : ce compte ne
 * doit pas pouvoir saisir une pesée de contrôle d'expédition.
 */
export async function peseurCentralOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  const cooperativeId = req.user?.cooperativeId;

  if (req.user?.role !== "peseur" || userId == null || cooperativeId == null) {
    res.status(403).json(ACCESS_ERROR);
    return;
  }

  try {
    const [user] = await db
      .select({ delegueId: usersTable.delegueId })
      .from(usersTable)
      .where(and(
        eq(usersTable.id, userId),
        eq(usersTable.cooperativeId, cooperativeId),
      ))
      .limit(1);

    if (!user || user.delegueId != null) {
      res.status(403).json(ACCESS_ERROR);
      return;
    }

    next();
  } catch (err) {
    req.log.error({ err }, "peseurCentralOnly");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}