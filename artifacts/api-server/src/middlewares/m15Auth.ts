import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface M15JwtPayload {
  id: number;
  email: string;
  role: string;
  type: "m15";
}

declare global {
  namespace Express {
    interface Request {
      m15User?: M15JwtPayload;
    }
  }
}

export function m15AuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ erreur: "Token M15 Tech manquant" });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env["M15_JWT_SECRET"] ?? process.env["JWT_SECRET"];
  if (!secret) {
    res.status(500).json({ erreur: "Erreur de configuration serveur" });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as M15JwtPayload;
    if (payload.type !== "m15") {
      res.status(403).json({ erreur: "Accès réservé à M15 Tech" });
      return;
    }
    req.m15User = payload;
    next();
  } catch {
    res.status(401).json({ erreur: "Token M15 invalide ou expiré" });
  }
}

export function requireM15Role(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.m15User || !roles.includes(req.m15User.role)) {
      res.status(403).json({ erreur: `Rôle requis : ${roles.join(" ou ")}` });
      return;
    }
    next();
  };
}
