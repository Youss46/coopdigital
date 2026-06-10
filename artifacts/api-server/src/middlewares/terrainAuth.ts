import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface TerrainJwtPayload {
  id: number;
  role: "delegue" | "agent_terrain";
  cooperativeId: number | null;
  section: string | null;
  zoneType: string | null;
  zoneNom: string | null;
}

declare global {
  namespace Express {
    interface Request {
      agent?: TerrainJwtPayload;
    }
  }
}

export function terrainAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
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
    const payload = jwt.verify(token, secret) as TerrainJwtPayload;
    if (payload.role !== "delegue" && payload.role !== "agent_terrain") {
      res.status(403).json({ erreur: "Accès réservé aux délégués de localité" });
      return;
    }
    req.agent = payload;
    next();
  } catch {
    res.status(401).json({ erreur: "Token invalide ou expiré" });
  }
}

export function delegueOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.agent?.role !== "delegue") {
    res.status(403).json({ erreur: "Réservé aux délégués de localité" });
    return;
  }
  next();
}
