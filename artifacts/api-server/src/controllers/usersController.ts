import { type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, asc, and, sql } from "drizzle-orm";
import {
  CreateUserBody,
  UpdateUserBody,
  ResetUserPasswordBody,
  ToggleUserActifBody,
} from "@workspace/api-zod";
import { canCreateUser, canDeleteUser, canResetUserPassword } from "../middlewares/roleGuard";
import { assertRoleActive, CooperativeRoleDisabledError } from "../services/cooperativeRolesService.js";

const ROLES_ALLOWED_TO_MANAGE = ["pca", "directeur"];
const ROLES_ALLOWED_CREATE_PESEUR = ["pca", "directeur", "delegue"];
const ROLES_ADMIN_PESEUR = ["pca", "directeur", "comptable"];

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
  const modeGestion  = (rawBody["modeGestion"]  ?? undefined) as "autonome" | "central" | undefined;

  if (!canCreateUser(requesterRole, role)) {
    res.status(403).json({ erreur: "Vous ne pouvez pas créer un compte avec ce rôle" });
    return;
  }

  try {
    await assertRoleActive(cooperativeId, role);
  } catch (error) {
    if (error instanceof CooperativeRoleDisabledError) {
      res.status(403).json({ code: error.code, erreur: error.message });
      return;
    }
    throw error;
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
        motDePasseTemporaire: ["delegue", "directeur", "comptable", "caissier", "responsable_tracabilite", "auditeur", "magasinier", "agent_terrain", "peseur"].includes(role),
        section: section ?? null,
        zoneType: zoneType ?? null,
        zoneNom: zoneNom ?? null,
        zoneVillages: zoneVillages ?? null,
        modeGestion: role === "delegue" ? (modeGestion ?? "autonome") : null,
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
        modeGestion: usersTable.modeGestion,
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

  if (!ROLES_ALLOWED_TO_MANAGE.includes(req.user?.role ?? "")) {
    res.status(403).json({ erreur: "Accès réservé au PCA et au Directeur" });
    return;
  }

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
    if (parse.data.nom !== undefined) {
      if (!parse.data.nom.trim()) { res.status(400).json({ erreur: "Le nom ne peut pas être vide" }); return; }
      updateData.nom = parse.data.nom.trim();
    }
    if (parse.data.prenoms !== undefined) {
      if (!parse.data.prenoms.trim()) { res.status(400).json({ erreur: "Le prénom ne peut pas être vide" }); return; }
      updateData.prenoms = parse.data.prenoms.trim();
    }
    if (parse.data.email !== undefined) updateData.email = parse.data.email;
    if (parse.data.telephone !== undefined) {
      updateData.telephone = parse.data.telephone.trim() || null;
    }
    const rawUpdateBody = req.body as Record<string, unknown>;
    if (rawUpdateBody["modeGestion"] !== undefined && existing.role === "delegue") {
      updateData.modeGestion = (rawUpdateBody["modeGestion"] as "autonome" | "central") ?? null;
    }

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
        modeGestion: usersTable.modeGestion,
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

    await db.transaction(async (tx) => {
      type UserForeignKey = {
        schemaName: string;
        tableName: string;
        columnName: string;
        notNull: boolean;
      };

      const fkResult = await tx.execute(sql`
        SELECT
          child_ns.nspname AS "schemaName",
          child.relname AS "tableName",
          child_col.attname AS "columnName",
          child_col.attnotnull AS "notNull"
        FROM pg_constraint constraint_row
        JOIN pg_class parent ON parent.oid = constraint_row.confrelid
        JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
        JOIN pg_class child ON child.oid = constraint_row.conrelid
        JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
        JOIN pg_attribute child_col
          ON child_col.attrelid = child.oid
         AND child_col.attnum = constraint_row.conkey[1]
        WHERE constraint_row.contype = 'f'
          AND parent_ns.nspname = 'public'
          AND parent.relname = 'users'
          AND child_ns.nspname = 'public'
          AND cardinality(constraint_row.conkey) = 1
      `);
      const userForeignKeys = fkResult.rows as UserForeignKey[];
      const accountOwnedTables = new Set([
        "lectures_messages",
        "notifications",
        "preferences_notifications",
      ]);
      const quoteIdentifier = (value: string) => `"${value.replaceAll("\"", "\"\"")}"`;

      for (const foreignKey of userForeignKeys) {
        const table = `${quoteIdentifier(foreignKey.schemaName)}.${quoteIdentifier(foreignKey.tableName)}`;
        const column = quoteIdentifier(foreignKey.columnName);
        const statement = foreignKey.notNull && accountOwnedTables.has(foreignKey.tableName)
          ? `DELETE FROM ${table} WHERE ${column} = ${id}`
          : foreignKey.notNull
            ? null
            : `UPDATE ${table} SET ${column} = NULL WHERE ${column} = ${id}`;

        // Une FK obligatoire hors données personnelles doit bloquer la
        // suppression : elle protège un objet métier appartenant au compte.
        if (statement) await tx.execute(sql.raw(statement));
      }

      await tx
        .delete(usersTable)
        .where(and(eq(usersTable.id, id), eq(usersTable.cooperativeId, cooperativeId)));
    });
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la suppression du compte");
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "23503"
    ) {
      res.status(409).json({
        erreur: "Ce compte est encore lié à une donnée métier obligatoire. Désactivez-le plutôt que de le supprimer.",
      });
      return;
    }
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
  try {
    await assertRoleActive(cooperativeId, "peseur");
  } catch (error) {
    if (error instanceof CooperativeRoleDisabledError) {
      res.status(403).json({ code: error.code, erreur: error.message });
      return;
    }
    throw error;
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
        motDePasseTemporaire: true,
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

// ─── Chauffeurs terrain ───────────────────────────────────────────────────────

// POST /users/chauffeurs  — crée un compte terrain pour un chauffeur de la flotte
export async function createChauffeurUser(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoopId(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  const role = req.user?.role;
  if (!ROLES_ALLOWED_TO_MANAGE.includes(role ?? "")) {
    res.status(403).json({ erreur: "Réservé au directeur / PCA" }); return;
  }
  try {
    await assertRoleActive(cooperativeId, "chauffeur");
  } catch (error) {
    if (error instanceof CooperativeRoleDisabledError) {
      res.status(403).json({ code: error.code, erreur: error.message });
      return;
    }
    throw error;
  }

  const body = req.body as { nom?: string; prenoms?: string; telephone?: string; motDePasse?: string; chauffeur_id?: number };
  const { nom, prenoms, telephone, motDePasse } = body;
  const chauffeurId = body.chauffeur_id ?? null;

  if (!nom?.trim() || !prenoms?.trim() || !telephone?.trim() || !motDePasse) {
    res.status(400).json({ erreur: "nom, prenoms, telephone et motDePasse sont requis" }); return;
  }
  if (motDePasse.length < 6) {
    res.status(400).json({ erreur: "Le mot de passe doit comporter au moins 6 caractères" }); return;
  }

  try {
    const passwordHash = await bcrypt.hash(motDePasse, 10);
    const tel = telephone.trim().replace(/\s+/g, "");
    const fakeEmail = `chauffeur-${tel}-${cooperativeId}@terrain.local`;

    const [created] = await db
      .insert(usersTable)
      .values({
        nom:                 nom.trim(),
        prenoms:             prenoms.trim(),
        email:               fakeEmail,
        telephone:           tel,
        passwordHash,
        role:                "chauffeur" as never,
        cooperativeId,
        actif:               true,
        motDePasseTemporaire: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(chauffeurId != null ? { chauffeurId } as any : {}),
      })
      .returning({
        id:          usersTable.id,
        nom:         usersTable.nom,
        prenoms:     usersTable.prenoms,
        telephone:   usersTable.telephone,
        actif:       usersTable.actif,
        createdAt:   usersTable.createdAt,
      });

    res.status(201).json(created);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ erreur: "Un compte avec ce numéro de téléphone existe déjà" }); return;
    }
    req.log.error({ err }, "createChauffeurUser");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// GET /users/chauffeurs — liste les comptes terrain chauffeurs de la coopérative
export async function listChauffeurUsers(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoopId(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const rows = await db
    .select({
      id:          usersTable.id,
      nom:         usersTable.nom,
      prenoms:     usersTable.prenoms,
      telephone:   usersTable.telephone,
      actif:       usersTable.actif,
      createdAt:   usersTable.createdAt,
    })
    .from(usersTable)
    .where(and(
      eq(usersTable.cooperativeId, cooperativeId),
      eq(usersTable.role, "chauffeur" as never),
    ))
    .orderBy(asc(usersTable.nom));
  res.json(rows);
}

// PUT /users/peseurs/:id/activer  (délégué OU admin)
export async function togglePeseurActifParDelegue(req: Request, res: Response): Promise<void> {
  const role = req.user?.role ?? "";
  const isAdmin = ROLES_ADMIN_PESEUR.includes(role);
  const isDelegue = role === "delegue";
  if (!isAdmin && !isDelegue) {
    res.status(403).json({ erreur: "Accès non autorisé" });
    return;
  }
  const cooperativeId = req.user?.cooperativeId;
  const peseurId = parseInt(String(req.params["id"] ?? "0"));
  const { actif } = req.body as { actif?: boolean };
  if (typeof actif !== "boolean") {
    res.status(400).json({ erreur: "Champ 'actif' (boolean) requis" });
    return;
  }
  try {
    const whereConditions = isDelegue && !isAdmin
      ? and(eq(usersTable.id, peseurId), eq(usersTable.delegueId, req.user!.id))
      : and(eq(usersTable.id, peseurId), eq(usersTable.cooperativeId, cooperativeId!));
    const [row] = await db.select({ id: usersTable.id }).from(usersTable).where(whereConditions).limit(1);
    if (!row) {
      res.status(404).json({ erreur: "Peseur introuvable" });
      return;
    }
    await db.update(usersTable).set({ actif }).where(eq(usersTable.id, peseurId));
    res.json({ ok: true, actif });
  } catch (err) {
    req.log.error({ err }, "togglePeseurActif");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Admin peseur management ───────────────────────────────────────────────────

// GET /users/peseurs/admin
export async function listAllPeseurs(req: Request, res: Response): Promise<void> {
  if (!ROLES_ADMIN_PESEUR.includes(req.user?.role ?? "")) {
    res.status(403).json({ erreur: "Accès réservé aux administrateurs" });
    return;
  }
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const peseurs = await db
      .select({
        id:          usersTable.id,
        nom:         usersTable.nom,
        prenoms:     usersTable.prenoms,
        telephone:   usersTable.telephone,
        actif:       usersTable.actif,
        delegueId:   usersTable.delegueId,
        createdAt:   usersTable.createdAt,
      })
      .from(usersTable)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where(and(eq(usersTable.cooperativeId, cooperativeId), eq(usersTable.role as any, "peseur" as any)))
      .orderBy(asc(usersTable.nom));

    // Charger les noms des délégués en une seule requête
    const delegueIds = [...new Set(peseurs.map(p => p.delegueId).filter(Boolean))] as number[];
    const delegues = delegueIds.length > 0
      ? await db.select({ id: usersTable.id, nom: usersTable.nom, prenoms: usersTable.prenoms, section: usersTable.section })
          .from(usersTable)
          .where(eq(usersTable.cooperativeId, cooperativeId))
      : [];
    const delegueMap = new Map(delegues.map(d => [d.id, d]));

    const result = peseurs.map(p => ({
      ...p,
      delegue: p.delegueId ? (delegueMap.get(p.delegueId) ?? null) : null,
      rattachement: p.delegueId ? "delegue" : "cooperative",
    }));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "listAllPeseurs");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// POST /users/peseurs/admin
export async function createPeseurAdmin(req: Request, res: Response): Promise<void> {
  if (!ROLES_ADMIN_PESEUR.includes(req.user?.role ?? "")) {
    res.status(403).json({ erreur: "Accès réservé aux administrateurs" });
    return;
  }
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    await assertRoleActive(cooperativeId, "peseur");
  } catch (error) {
    if (error instanceof CooperativeRoleDisabledError) {
      res.status(403).json({ code: error.code, erreur: error.message });
      return;
    }
    throw error;
  }

  const body = req.body as {
    nom?: string; prenoms?: string; telephone?: string; motDePasse?: string;
    delegueId?: number | null; // null = base centrale, number = délégué
  };
  const { nom, prenoms, telephone, motDePasse, delegueId = null } = body;

  if (!nom?.trim() || !prenoms?.trim() || !telephone?.trim() || !motDePasse) {
    res.status(400).json({ erreur: "Champs obligatoires : nom, prenoms, telephone, motDePasse" });
    return;
  }
  if (motDePasse.length < 6) {
    res.status(400).json({ erreur: "Le mot de passe doit comporter au moins 6 caractères" });
    return;
  }

  try {
    // Récupérer la section du délégué si rattaché à un délégué
    let section: string | null = null;
    if (delegueId) {
      const [delegueRow] = await db
        .select({ section: usersTable.section })
        .from(usersTable)
        .where(and(eq(usersTable.id, delegueId), eq(usersTable.cooperativeId, cooperativeId)))
        .limit(1);
      if (!delegueRow) {
        res.status(404).json({ erreur: "Délégué introuvable" });
        return;
      }
      section = delegueRow.section ?? null;
    }

    const passwordHash = await bcrypt.hash(motDePasse, 10);
    const tel = telephone.trim().replace(/\s+/g, "");
    const suffix = delegueId ?? "centrale";
    const fakeEmail = `peseur-${tel}-${suffix}@terrain.local`;

    const [created] = await db
      .insert(usersTable)
      .values({
        nom: nom.trim(),
        prenoms: prenoms.trim(),
        email: fakeEmail,
        telephone: tel,
        passwordHash,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        role: "peseur" as any,
        cooperativeId,
        actif: true,
        motDePasseTemporaire: true,
        section,
        delegueId: delegueId ?? null,
      })
      .returning({
        id: usersTable.id, nom: usersTable.nom, prenoms: usersTable.prenoms,
        telephone: usersTable.telephone, actif: usersTable.actif, delegueId: usersTable.delegueId,
        createdAt: usersTable.createdAt,
      });

    res.status(201).json({ ...created, rattachement: delegueId ? "delegue" : "cooperative" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      res.status(409).json({ erreur: "Un peseur avec ce numéro de téléphone existe déjà" });
      return;
    }
    req.log.error({ err }, "createPeseurAdmin");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// PUT /users/peseurs/:id/password  (délégué OU admin)
export async function resetPeseurPassword(req: Request, res: Response): Promise<void> {
  const role = req.user?.role ?? "";
  const isAdmin = ROLES_ADMIN_PESEUR.includes(role);
  const isDelegue = role === "delegue";
  if (!isAdmin && !isDelegue) {
    res.status(403).json({ erreur: "Accès non autorisé" });
    return;
  }
  const cooperativeId = req.user?.cooperativeId;
  const peseurId = parseInt(String(req.params["id"] ?? "0"), 10);
  if (!peseurId) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const { nouveauMotDePasse } = req.body as { nouveauMotDePasse?: string };
  if (!nouveauMotDePasse || nouveauMotDePasse.length < 6) {
    res.status(400).json({ erreur: "Le mot de passe doit comporter au moins 6 caractères" });
    return;
  }
  try {
    const whereConditions = isDelegue && !isAdmin
      ? and(eq(usersTable.id, peseurId), eq(usersTable.delegueId, req.user!.id))
      : and(eq(usersTable.id, peseurId), eq(usersTable.cooperativeId, cooperativeId!));
    const [row] = await db.select({ id: usersTable.id }).from(usersTable).where(whereConditions).limit(1);
    if (!row) { res.status(404).json({ erreur: "Peseur introuvable" }); return; }
    const passwordHash = await bcrypt.hash(nouveauMotDePasse, 10);
    await db.update(usersTable).set({ passwordHash, motDePasseTemporaire: true }).where(eq(usersTable.id, peseurId));
    res.json({ message: "Mot de passe réinitialisé avec succès" });
  } catch (err) {
    req.log.error({ err }, "resetPeseurPassword");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
