import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  USER_ROLES,
  usersTable,
  cooperativesTable,
  cooperativeRolesTable,
  cooperativeRoleHistoryTable,
  type CooperativeRoleMode,
} from "@workspace/db";

export const ROLE_CATALOG = [
  { key: "pca", label: "PCA", description: "Président du conseil d'administration" },
  { key: "directeur", label: "Directeur", description: "Direction de la coopérative" },
  { key: "comptable", label: "Comptable", description: "Comptabilité et suivi financier" },
  { key: "caissier", label: "Caissier.e", description: "Opérations de caisse" },
  { key: "magasinier", label: "Magasinier", description: "Stocks et magasin" },
  { key: "responsable_tracabilite", label: "Resp. Traçabilité", description: "Traçabilité et conformité" },
  { key: "delegue", label: "Délégué de localité", description: "Collecte terrain par localité" },
  { key: "auditeur", label: "Auditeur", description: "Consultation et audit" },
  { key: "agent_terrain", label: "Agent terrain", description: "Enquêtes et opérations terrain" },
  { key: "peseur", label: "Peseur", description: "Pesées et réception" },
  { key: "chauffeur", label: "Chauffeur", description: "Transport et livraisons" },
  { key: "responsable_rh", label: "Responsable RH", description: "Dossiers du personnel, congés et suivi administratif" },
  { key: "sacherie", label: "Responsable Sacherie", description: "Gestion des sacs, attributions et inventaire" },
] as const satisfies ReadonlyArray<{ key: (typeof USER_ROLES)[number]; label: string; description: string }>;

const ROLE_KEYS = ROLE_CATALOG.map((role) => role.key);

export class CooperativeRoleDisabledError extends Error {
  readonly code = "ROLE_DISABLED";
  constructor(public readonly roleKey: string) {
    super("Ce rôle est désactivé pour cette coopérative");
  }
}

export class LastGovernanceRoleError extends Error {
  readonly code = "LAST_GOVERNANCE_ROLE";
  constructor() {
    super("Impossible de désactiver le dernier PCA ou Directeur actif de la coopérative");
  }
}

export function isKnownRole(role: string): role is (typeof USER_ROLES)[number] {
  return ROLE_KEYS.includes(role as (typeof ROLE_KEYS)[number]);
}

export async function isRoleActive(cooperativeId: number, roleKey: string): Promise<boolean> {
  const [config] = await db
    .select({ mode: cooperativeRolesTable.mode })
    .from(cooperativeRolesTable)
    .where(and(
      eq(cooperativeRolesTable.cooperativeId, cooperativeId),
      eq(cooperativeRolesTable.roleKey, roleKey),
    ))
    .limit(1);
  return config?.mode !== "disabled";
}

export async function assertRoleActive(cooperativeId: number, roleKey: string): Promise<void> {
  if (!await isRoleActive(cooperativeId, roleKey)) {
    throw new CooperativeRoleDisabledError(roleKey);
  }
}

export async function getCooperativeRoleConfig(cooperativeId: number) {
  const [coop] = await db
    .select({ id: cooperativesTable.id })
    .from(cooperativesTable)
    .where(eq(cooperativesTable.id, cooperativeId))
    .limit(1);
  if (!coop) return null;

  const rows = await db
    .select()
    .from(cooperativeRolesTable)
    .where(eq(cooperativeRolesTable.cooperativeId, cooperativeId));
  const byRole = new Map(rows.map((row) => [row.roleKey, row]));
  const userCounts = await db
    .select({ role: usersTable.role, count: sql<number>`count(*)` })
    .from(usersTable)
    .where(and(eq(usersTable.cooperativeId, cooperativeId), eq(usersTable.actif, true)))
    .groupBy(usersTable.role);
  const countByRole = new Map(userCounts.map((row) => [row.role, Number(row.count)]));

  return ROLE_CATALOG.map((role) => ({
    ...role,
    mode: (byRole.get(role.key)?.mode ?? "active") as CooperativeRoleMode,
    source: byRole.has(role.key) ? "custom" as const : "default" as const,
    updatedAt: byRole.get(role.key)?.updatedAt ?? null,
    userCount: countByRole.get(role.key) ?? 0,
  }));
}

export async function getCooperativeRoleHistory(cooperativeId: number) {
  return db
    .select()
    .from(cooperativeRoleHistoryTable)
    .where(eq(cooperativeRoleHistoryTable.cooperativeId, cooperativeId))
    .orderBy(desc(cooperativeRoleHistoryTable.createdAt));
}

export async function updateCooperativeRoles(
  cooperativeId: number,
  updates: Array<{ roleKey: string; mode: CooperativeRoleMode; reason?: string }>,
  changedBy: number,
) {
  const result = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(cooperativeRolesTable)
      .where(eq(cooperativeRolesTable.cooperativeId, cooperativeId));
    const currentModes = new Map(existing.map((row) => [row.roleKey, row.mode]));
    const finalModes = new Map(currentModes);

    for (const update of updates) {
      if (!isKnownRole(update.roleKey)) throw new Error(`Rôle inconnu : ${update.roleKey}`);
      finalModes.set(update.roleKey, update.mode);
    }

    const governanceRoles = ["pca", "directeur"] as const;
    const governanceEnabled = governanceRoles.some((role) => finalModes.get(role) !== "disabled");
    if (!governanceEnabled) throw new LastGovernanceRoleError();

    const activeGovernanceUsers = await tx
      .select({ role: usersTable.role, count: sql<number>`count(*)` })
      .from(usersTable)
      .where(and(
        eq(usersTable.cooperativeId, cooperativeId),
        eq(usersTable.actif, true),
        inArray(usersTable.role, governanceRoles),
      ))
      .groupBy(usersTable.role);
    const activeByRole = new Map(activeGovernanceUsers.map((row) => [row.role, Number(row.count)]));
    if (finalModes.get("pca") === "disabled" && finalModes.get("directeur") !== "disabled" && (activeByRole.get("directeur") ?? 0) === 0) {
      throw new LastGovernanceRoleError();
    }
    if (finalModes.get("directeur") === "disabled" && finalModes.get("pca") !== "disabled" && (activeByRole.get("pca") ?? 0) === 0) {
      throw new LastGovernanceRoleError();
    }

    for (const update of updates) {
      const previousMode = currentModes.get(update.roleKey) ?? "active";
      if (previousMode === update.mode && !update.reason) continue;

      await tx
        .insert(cooperativeRolesTable)
        .values({
          cooperativeId,
          roleKey: update.roleKey,
          mode: update.mode,
          updatedBy: changedBy,
        })
        .onConflictDoUpdate({
          target: [cooperativeRolesTable.cooperativeId, cooperativeRolesTable.roleKey],
          set: { mode: update.mode, updatedBy: changedBy, updatedAt: new Date() },
        });

      await tx.insert(cooperativeRoleHistoryTable).values({
        cooperativeId,
        roleKey: update.roleKey,
        previousMode,
        newMode: update.mode,
        reason: update.reason?.trim() || null,
        changedBy,
      });
    }
    return true;
  });

  if (!result) throw new Error("Mise à jour impossible");
  return getCooperativeRoleConfig(cooperativeId);
}