import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

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

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ erreur: "Token d'authentification manquant" });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    req.log.error("JWT_SECRET non configuré");
    res.status(500).json({ erreur: "Erreur de configuration du serveur" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ erreur: "Token invalide ou expiré" });
  }
}
