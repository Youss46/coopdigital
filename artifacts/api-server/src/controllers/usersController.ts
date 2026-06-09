import { type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, asc, and } from "drizzle-orm";
import {
  CreateUserBody,
  UpdateUserBody,
  ResetUserPasswordBody,
  ToggleUserActifBody,
} from "@workspace/api-zod";
import { canCreateUser, canDeleteUser } from "../middlewares/roleGuard";

const ROLES_ALLOWED_TO_MANAGE = ["pca", "directeur"];

function getCoopId(req: Request): number | null {
  return req.user?.cooperativeId ?? null;
}

// GET /users
export async function listUsers(req: Request, res: Response): Promise<void> {
  if (!ROLES_ALLOWED_TO_MANAGE.includes(req.user?.role ?? "")) {
    res.status(403).json({ erreur: "Accès réservé au PCA et au Directeur" });
    return;
  }

  const cooperativeId = getCoopId(req);
  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte" });
    return;
  }

  try {
    const users = await db
      .select({
        id: usersTable.id,
        nom: usersTable.nom,
        prenoms: usersTable.prenoms,
        email: usersTable.email,
        telephone: usersTable.telephone,
        role: usersTable.role,
        actif: usersTable.actif,
        cooperativeId: usersTable.cooperativeId,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.cooperativeId, cooperativeId))
      .orderBy(asc(usersTable.createdAt));

    res.json(users);
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la récupération des utilisateurs");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// POST /users
export async function createUser(req: Request, res: Response): Promise<void> {
  const requesterRole = req.user?.role ?? "";
  if (!ROLES_ALLOWED_TO_MANAGE.includes(requesterRole)) {
    res.status(403).json({ erreur: "Droits insuffisants pour créer un compte" });
    return;
  }

  const cooperativeId = getCoopId(req);
  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte" });
    return;
  }

  const parse = CreateUserBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const { nom, prenoms, email, telephone, role, motDePasse, section, zoneType, zoneNom, zoneVillages } = parse.data;

  if (!canCreateUser(requesterRole, role)) {
    res.status(403).json({ erreur: "Vous ne pouvez pas créer un compte avec ce rôle" });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(motDePasse, 10);

    const [created] = await db
      .insert(usersTable)
      .values({
        nom,
        prenoms,
        email,
        telephone: telephone ?? null,
        passwordHash,
        role,
        cooperativeId,
        actif: true,
        motDePasseTemporaire: role === "delegue",
        section: section ?? null,
        zoneType: zoneType ?? null,
        zoneNom: zoneNom ?? null,
        zoneVillages: zoneVillages ?? null,
      })
      .returning({
        id: usersTable.id,
        nom: usersTable.nom,
        prenoms: usersTable.prenoms,
        email: usersTable.email,
        telephone: usersTable.telephone,
        role: usersTable.role,
        actif: usersTable.actif,
        cooperativeId: usersTable.cooperativeId,
        createdAt: usersTable.createdAt,
      });

    res.status(201).json(created);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ erreur: "Un compte avec cet email existe déjà" });
      return;
    }
    if (msg.includes("idx_unique_pca_cooperative")) {
      res.status(409).json({ erreur: "Un PCA actif existe déjà pour cette coopérative" });
      return;
    }
    req.log.error({ err }, "Erreur lors de la création du compte");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// PUT /users/:id
export async function updateUser(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const cooperativeId = getCoopId(req);
  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte" });
    return;
  }

  const parse = UpdateUserBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!existing) { res.status(404).json({ erreur: "Compte introuvable" }); return; }

    const updateData: Partial<typeof usersTable.$inferInsert> = {};
    if (parse.data.nom !== undefined) updateData.nom = parse.data.nom;
    if (parse.data.prenoms !== undefined) updateData.prenoms = parse.data.prenoms;
    if (parse.data.email !== undefined) updateData.email = parse.data.email;
    if (parse.data.telephone !== undefined) updateData.telephone = parse.data.telephone;

    const [updated] = await db
      .update(usersTable)
      .set(updateData)
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)))
      .returning({
        id: usersTable.id,
        nom: usersTable.nom,
        prenoms: usersTable.prenoms,
        email: usersTable.email,
        telephone: usersTable.telephone,
        role: usersTable.role,
        actif: usersTable.actif,
        cooperativeId: usersTable.cooperativeId,
        createdAt: usersTable.createdAt,
      });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la mise à jour du compte");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// PUT /users/:id/password
export async function resetUserPassword(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const requesterRole = req.user?.role ?? "";
  if (!ROLES_ALLOWED_TO_MANAGE.includes(requesterRole)) {
    res.status(403).json({ erreur: "Droits insuffisants" });
    return;
  }

  const cooperativeId = getCoopId(req);
  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte" });
    return;
  }

  const parse = ResetUserPasswordBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!existing) { res.status(404).json({ erreur: "Compte introuvable" }); return; }

    const passwordHash = await bcrypt.hash(parse.data.nouveauMotDePasse, 10);
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)));

    res.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la réinitialisation du mot de passe");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// DELETE /users/:id
export async function deleteUser(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const requesterId = req.user?.id ?? 0;
  const requesterRole = req.user?.role ?? "";

  const cooperativeId = getCoopId(req);
  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte" });
    return;
  }

  try {
    const [target] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!target) { res.status(404).json({ erreur: "Compte introuvable" }); return; }

    const check = canDeleteUser(requesterRole, requesterId, id, target.role);
    if (!check.allowed) {
      res.status(403).json({ erreur: check.message ?? "Action non autorisée" });
      return;
    }

    await db
      .delete(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)));
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la suppression du compte");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// PUT /users/:id/activer
export async function toggleUserActif(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const requesterRole = req.user?.role ?? "";
  if (!ROLES_ALLOWED_TO_MANAGE.includes(requesterRole)) {
    res.status(403).json({ erreur: "Droits insuffisants" });
    return;
  }

  const cooperativeId = getCoopId(req);
  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte" });
    return;
  }

  const parse = ToggleUserActifBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!existing) { res.status(404).json({ erreur: "Compte introuvable" }); return; }

    if (existing.role === "pca" && !parse.data.actif) {
      res.status(403).json({ erreur: "Le compte PCA ne peut pas être désactivé" });
      return;
    }

    const [updated] = await db
      .update(usersTable)
      .set({ actif: parse.data.actif })
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)))
      .returning({
        id: usersTable.id,
        nom: usersTable.nom,
        prenoms: usersTable.prenoms,
        email: usersTable.email,
        telephone: usersTable.telephone,
        role: usersTable.role,
        actif: usersTable.actif,
        cooperativeId: usersTable.cooperativeId,
        createdAt: usersTable.createdAt,
      });

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur lors de l'activation/désactivation du compte");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
