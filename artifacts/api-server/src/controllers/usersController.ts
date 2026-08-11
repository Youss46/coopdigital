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
import { canCreateUser, canDeleteUser, canResetUserPassword } from "../middlewares/roleGuard";

const ROLES_ALLOWED_TO_MANAGE = ["pca", "directeur"];
const ROLES_ALLOWED_CREATE_PESEUR = ["pca", "directeur", "delegue"];

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

  const { nom, prenoms, telephone, role, motDePasse } = parse.data;
  let { email } = parse.data;
  const rawBody = req.body as Record<string, unknown>;
  const section      = (rawBody["section"]      ?? undefined) as string | undefined;
  const zoneType     = (rawBody["zoneType"]     ?? undefined) as string | undefined;
  const zoneNom      = (rawBody["zoneNom"]      ?? undefined) as string | undefined;
  const zoneVillages = (rawBody["zoneVillages"] ?? undefined) as string | undefined;

  if (!canCreateUser(requesterRole, role)) {
    res.status(403).json({ erreur: "Vous ne pouvez pas créer un compte avec ce rôle" });
    return;
  }

  // Les peseurs n'ont pas d'email réel — on génère un email interne à partir du téléphone
  if (role === "peseur") {
    if (!telephone?.trim()) {
      res.status(400).json({ erreur: "Le numéro de téléphone est obligatoire pour un peseur" });
      return;
    }
    const tel = telephone.trim().replace(/\s+/g, "");
    email = `peseur-${tel}-coop${cooperativeId}@terrain.local`;
  } else if (!email) {
    res.status(400).json({ erreur: "L'email est obligatoire pour ce rôle" });
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
        telephone: telephone ? telephone.trim().replace(/\s+/g, "") : null,
        passwordHash,
        role,
        cooperativeId,
        actif: true,
        motDePasseTemporaire: ["delegue", "directeur", "comptable", "caissier", "responsable_tracabilite", "auditeur", "magasinier", "agent_terrain"].includes(role),
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

  const requesterId = req.user?.id ?? 0;
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

    const check = canResetUserPassword(requesterRole, requesterId, id, existing.role);
    if (!check.allowed) {
      res.status(403).json({ erreur: check.message ?? "Action non autorisée" });
      return;
    }

    const passwordHash = await bcrypt.hash(parse.data.nouveauMotDePasse, 10);
    const [updated] = await db
      .update(usersTable)
      .set({ passwordHash, motDePasseTemporaire: true })
      .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)))
      .returning({ id: usersTable.id });

    if (!updated) {
      res.status(404).json({ erreur: "Compte introuvable ou accès non autorisé" });
      return;
    }

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

// ─── Peseurs rattachés au délégué ─────────────────────────────────────────────

// PUT /users/peseurs/:id/password  (délégué uniquement — ses peseurs seulement)
export async function resetPeseurPasswordParDelegue(req: Request, res: Response): Promise<void> {
  if (req.user?.role !== "delegue") {
    res.status(403).json({ erreur: "Réservé aux délégués" });
    return;
  }
  const delegueId = req.user.id;
  const peseurId  = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!peseurId) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const body = req.body as { nouveauMotDePasse?: string };
  const { nouveauMotDePasse } = body;
  if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) {
    res.status(400).json({ erreur: "Le mot de passe doit comporter au moins 6 caractères" });
    return;
  }

  try {
    const [row] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, peseurId), eq(usersTable.delegueId, delegueId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ erreur: "Peseur introuvable ou non rattaché à votre compte" });
      return;
    }

    const passwordHash = await bcrypt.hash(nouveauMotDePasse, 10);
    await db
      .update(usersTable)
      .set({ passwordHash, motDePasseTemporaire: true })
      .where(eq(usersTable.id, peseurId));

    res.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (err) {
    req.log.error({ err }, "resetPeseurPasswordParDelegue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// GET /users/mes-peseurs  (délégué uniquement)
export async function getMesPeseurs(req: Request, res: Response): Promise<void> {
  if (req.user?.role !== "delegue") {
    res.status(403).json({ erreur: "Réservé aux délégués" });
    return;
  }
  const delegueId = req.user.id;
  try {
    const peseurs = await db
      .select({
        id:          usersTable.id,
        nom:         usersTable.nom,
        prenoms:     usersTable.prenoms,
        telephone:   usersTable.telephone,
        section:     usersTable.section,
        actif:       usersTable.actif,
        createdAt:   usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.delegueId, delegueId))
      .orderBy(asc(usersTable.createdAt));
    res.json(peseurs);
  } catch (err) {
    req.log.error({ err }, "getMesPeseurs");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// POST /users/peseurs  (délégué uniquement)
export async function createPeseurParDelegue(req: Request, res: Response): Promise<void> {
  if (req.user?.role !== "delegue") {
    res.status(403).json({ erreur: "Réservé aux délégués" });
    return;
  }
  const delegueId    = req.user.id;
  const cooperativeId = req.user.cooperativeId;

  // Récupérer la section du délégué depuis la DB (pas dans le JWT)
  const [delegueRow] = await db
    .select({ section: usersTable.section })
    .from(usersTable)
    .where(eq(usersTable.id, delegueId))
    .limit(1);
  const section = delegueRow?.section ?? null;

  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée" });
    return;
  }

  const body = req.body as { nom?: string; prenoms?: string; telephone?: string; motDePasse?: string };
  const { nom, prenoms, telephone, motDePasse } = body;

  if (!nom?.trim() || !prenoms?.trim() || !telephone?.trim() || !motDePasse) {
    res.status(400).json({ erreur: "Champs obligatoires : nom, prenoms, telephone, motDePasse" });
    return;
  }
  if (motDePasse.length < 6) {
    res.status(400).json({ erreur: "Le mot de passe doit comporter au moins 6 caractères" });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(motDePasse, 10);
    // Email auto-généré — non utilisé pour l'auth terrain
    const tel = telephone.trim().replace(/\s+/g, "");
    const fakeEmail = `peseur-${tel}-${delegueId}@terrain.local`;

    const [created] = await db
      .insert(usersTable)
      .values({
        nom:                 nom.trim(),
        prenoms:             prenoms.trim(),
        email:               fakeEmail,
        telephone:           tel,
        passwordHash,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        role:                "peseur" as any,
        cooperativeId,
        actif:               true,
        motDePasseTemporaire: false,
        section,
        delegueId,
      })
      .returning({
        id:        usersTable.id,
        nom:       usersTable.nom,
        prenoms:   usersTable.prenoms,
        telephone: usersTable.telephone,
        section:   usersTable.section,
        actif:     usersTable.actif,
        createdAt: usersTable.createdAt,
      });

    res.status(201).json(created);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ erreur: "Un peseur avec ce numéro de téléphone existe déjà" });
      return;
    }
    req.log.error({ err }, "createPeseurParDelegue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// PUT /users/peseurs/:id/activer  (délégué uniquement — ses peseurs seulement)
export async function togglePeseurActifParDelegue(req: Request, res: Response): Promise<void> {
  if (req.user?.role !== "delegue") {
    res.status(403).json({ erreur: "Réservé aux délégués" });
    return;
  }
  const delegueId = req.user.id;
  const peseurId  = parseInt(String(req.params["id"] ?? "0"));
  const { actif } = req.body as { actif?: boolean };
  if (typeof actif !== "boolean") {
    res.status(400).json({ erreur: "Champ 'actif' (boolean) requis" });
    return;
  }
  try {
    const [row] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.id, peseurId), eq(usersTable.delegueId, delegueId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ erreur: "Peseur introuvable ou non rattaché à votre compte" });
      return;
    }
    await db.update(usersTable).set({ actif }).where(eq(usersTable.id, peseurId));
    res.json({ ok: true, actif });
  } catch (err) {
    req.log.error({ err }, "togglePeseurActifParDelegue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
