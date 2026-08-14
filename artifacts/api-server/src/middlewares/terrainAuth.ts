import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface TerrainJwtPayload {
  id: number;
  role: "delegue" | "agent_terrain" | "peseur" | "chauffeur";
  cooperativeId: number | null;
  section: string | null;
  zoneType: string | null;
  zoneNom: string | null;
  /** Pour les peseurs : ID du délégué auquel ils sont rattachés (null = base centrale) */
  delegueId?: number | null;
  /** Pour les chauffeurs : ID dans la table chauffeurs (transport) */
  chauffeurId?: number | null;
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
  const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
  if (!secret) {
    req.log.error("JWT_SECRET non configuré");
    res.status(500).json({ erreur: "Erreur de configuration du serveur" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as TerrainJwtPayload;
    const rolesAutorisés = ["delegue", "agent_terrain", "peseur", "chauffeur"];
    if (!rolesAutorisés.includes(payload.role)) {
      res.status(403).json({ erreur: "Accès réservé aux agents terrain" });
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

export function peseurOrDelegueOnly(req: Request, res: Response, next: NextFunction): void {
  const role = req.agent?.role;
  if (role !== "delegue" && role !== "peseur") {
    res.status(403).json({ erreur: "Réservé aux délégués et peseurs" });
    return;
  }
  next();
}

/** Autorise délégué ET peseur (collecte de livraisons) */
export function collecteAllowed(req: Request, res: Response, next: NextFunction): void {
  const role = req.agent?.role;
  if (role !== "delegue" && role !== "peseur") {
    res.status(403).json({ erreur: "Réservé aux délégués et peseurs" });
    return;
  }
  next();
}

/**
 * Middleware flexible : accepte un token terrain (→ req.agent) OU un token coopératif (→ req.user).
 * Utilisé pour les routes de lecture des sessions de pesée qui doivent être accessibles
 * aussi bien depuis l'app terrain que depuis le front-office coopératif.
 */
export function flexAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ erreur: "Token d'authentification manquant" });
    return;
  }
  const token = authHeader.slice(7);
  const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
  if (!secret) {
    res.status(500).json({ erreur: "Erreur de configuration du serveur" });
    return;
  }
  try {
    const payload = jwt.verify(token, secret) as TerrainJwtPayload & { role: string };
    if (["delegue", "agent_terrain", "peseur", "chauffeur"].includes(payload.role)) {
      req.agent = payload as TerrainJwtPayload;
    } else {
      // Token coopératif — importe JwtPayload à la volée pour typer req.user
      (req as Request & { user?: { id: number; role: string; cooperativeId: number | null } }).user =
        payload as { id: number; role: string; cooperativeId: number | null };
    }
    next();
  } catch {
    res.status(401).json({ erreur: "Token invalide ou expiré" });
  }
}
