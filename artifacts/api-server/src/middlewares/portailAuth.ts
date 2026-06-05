import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface PortailJwtPayload {
  membreId: number;
  cooperativeId: number;
  role: "portail_membre";
}

declare global {
  namespace Express {
    interface Request {
      membre?: PortailJwtPayload;
    }
  }
}

export function portailAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
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
    const payload = jwt.verify(token, secret) as PortailJwtPayload;
    if (payload.role !== "portail_membre") {
      res.status(403).json({ erreur: "Accès réservé aux membres" });
      return;
    }
    req.membre = payload;
    next();
  } catch {
    res.status(401).json({ erreur: "Token invalide ou expiré" });
  }
}
