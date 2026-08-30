import { type Request, type Response, type NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isRoleActive } from "../services/cooperativeRolesService.js";

export const COMPTE_DESACTIVE_CODE = "COMPTE_DESACTIVE";
export const COMPTE_DESACTIVE_MESSAGE =
  "Votre compte a été désactivé par l’administration. Contactez votre responsable.";

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

const ROLES_TERRAIN = ["delegue", "agent_terrain", "peseur", "chauffeur"] as const;

async function compteTerrainActif(payload: TerrainJwtPayload): Promise<boolean> {
  const [user] = await db
    .select({ actif: usersTable.actif, cooperativeId: usersTable.cooperativeId, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, payload.id))
    .limit(1);
  return user?.actif === true
    && user.cooperativeId != null
    && await isRoleActive(user.cooperativeId, user.role);
}

function refuserCompteDesactive(res: Response): void {
  res.status(403).json({
    code: COMPTE_DESACTIVE_CODE,
    erreur: COMPTE_DESACTIVE_MESSAGE,
  });
}

function refuserRoleDesactive(res: Response): void {
  res.status(403).json({
    code: "ROLE_DISABLED",
    erreur: "Votre rôle est désactivé pour cette coopérative. Contactez l’administration.",
  });
}

declare global {
  namespace Express {
    interface Request {
      agent?: TerrainJwtPayload;
    }
  }
}

export async function terrainAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    if (!ROLES_TERRAIN.includes(payload.role)) {
      res.status(403).json({ erreur: "Accès réservé aux agents terrain" });
      return;
    }

    if (!await compteTerrainActif(payload)) {
      const [current] = await db.select({ actif: usersTable.actif, cooperativeId: usersTable.cooperativeId, role: usersTable.role })
        .from(usersTable).where(eq(usersTable.id, payload.id)).limit(1);
      if (current?.actif && current.cooperativeId == null) {
        res.status(403).json({
          code: "COOPERATIVE_MISSING",
          erreur: "Ce compte terrain n’est rattaché à aucune coopérative. Contactez l’administration.",
        });
        return;
      }
      if (current?.actif && current.cooperativeId && !await isRoleActive(current.cooperativeId, current.role)) {
        refuserRoleDesactive(res);
        return;
      }
      refuserCompteDesactive(res);
      return;
    }

    req.agent = payload;
    next();
  } catch (error) {
    // Une erreur de lecture DB ne doit pas être présentée comme un token invalide.
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ erreur: "Token invalide ou expiré" });
      return;
    }
    req.log.error({ err: error }, "Erreur de vérification du compte terrain");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function flexAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    if (ROLES_TERRAIN.includes(payload.role as (typeof ROLES_TERRAIN)[number])) {
      if (!await compteTerrainActif(payload)) {
        const [current] = await db.select({ actif: usersTable.actif, cooperativeId: usersTable.cooperativeId, role: usersTable.role })
          .from(usersTable).where(eq(usersTable.id, payload.id)).limit(1);
        if (current?.actif && current.cooperativeId && !await isRoleActive(current.cooperativeId, current.role)) {
          refuserRoleDesactive(res);
          return;
        }
        refuserCompteDesactive(res);
        return;
      }
      req.agent = payload as TerrainJwtPayload;
    } else {
      // Token coopératif — importe JwtPayload à la volée pour typer req.user
      (req as Request & { user?: { id: number; role: string; cooperativeId: number | null } }).user =
        payload as { id: number; role: string; cooperativeId: number | null };
    }
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ erreur: "Token invalide ou expiré" });
      return;
    }
    req.log.error({ err: error }, "Erreur de vérification du compte terrain");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
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

/** Autorise uniquement les profils terrain qui peuvent créer un fournisseur externe. */
export function fournisseurExterneCreationAllowed(req: Request, res: Response, next: NextFunction): void {
  peseurOrDelegueOnly(req, res, next);
}

/** Réservé au peseur central pour les opérations du magasin de réception. */
export function peseurOnly(req: Request, res: Response, next: NextFunction): void {
  if (req.agent?.role !== "peseur" || req.agent.delegueId != null) {
    res.status(403).json({ erreur: "Réservé au peseur central" });
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
