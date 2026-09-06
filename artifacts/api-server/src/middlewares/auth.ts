import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ROLE_DISABLED_CODE, ROLE_DISABLED_MESSAGE } from "../lib/accountAccess.js";

export interface JwtPayload {
  id: number;
  role: string;
  cooperativeId: number | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ erreur: "Token d'authentification manquant" });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
  if (!secret) {
    req.log.error("JWT_SECRET et SESSION_SECRET non configurés");
    res.status(500).json({ erreur: "Erreur de configuration du serveur" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;

    const [user] = await db
      .select({ actif: usersTable.actif })
      .from(usersTable)
      .where(eq(usersTable.id, payload.id))
      .limit(1);
    if (!user?.actif) {
      res.status(403).json({ code: ROLE_DISABLED_CODE, erreur: ROLE_DISABLED_MESSAGE });
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ erreur: "Token invalide ou expiré" });
      return;
    }
    req.log.error({ err: error }, "Erreur de vérification du compte");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
