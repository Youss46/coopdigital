import { and, eq } from "drizzle-orm";
import {
  db,
  cooperativesTable,
  cooperativeSacherieConfigTable,
  cooperativeSacherieConfigHistoryTable,
  sacherieResponsibleModes,
  type SacherieResponsibleMode,
} from "@workspace/db";

export const DEFAULT_SACHERIE_RESPONSIBLE_MODE: SacherieResponsibleMode = "les_deux";

export async function getCooperativeSacherieConfig(cooperativeId: number) {
  const [cooperative] = await db
    .select({ id: cooperativesTable.id })
    .from(cooperativesTable)
    .where(eq(cooperativesTable.id, cooperativeId))
    .limit(1);
  if (!cooperative) return null;

  const [config] = await db
    .select()
    .from(cooperativeSacherieConfigTable)
    .where(eq(cooperativeSacherieConfigTable.cooperativeId, cooperativeId))
    .limit(1);

  return {
    cooperativeId,
    responsibleMode: (config?.responsibleMode ?? DEFAULT_SACHERIE_RESPONSIBLE_MODE) as SacherieResponsibleMode,
    source: config ? "custom" as const : "default" as const,
    updatedAt: config?.updatedAt ?? null,
  };
}

export async function updateCooperativeSacherieConfig(
  cooperativeId: number,
  responsibleMode: SacherieResponsibleMode,
  changedBy: number,
  reason?: string,
) {
  if (!sacherieResponsibleModes.includes(responsibleMode)) {
    throw new Error("Mode de responsabilité Sacherie invalide");
  }

  const current = await getCooperativeSacherieConfig(cooperativeId);
  if (!current) throw new Error("Coopérative introuvable");

  if (current.responsibleMode !== responsibleMode || reason?.trim()) {
    await db.transaction(async (tx) => {
      await tx
        .insert(cooperativeSacherieConfigTable)
        .values({
          cooperativeId,
          responsibleMode,
          updatedBy: changedBy,
        })
        .onConflictDoUpdate({
          target: cooperativeSacherieConfigTable.cooperativeId,
          set: {
            responsibleMode,
            updatedBy: changedBy,
            updatedAt: new Date(),
          },
        });
      await tx.insert(cooperativeSacherieConfigHistoryTable).values({
        cooperativeId,
        previousMode: current.source === "default" ? null : current.responsibleMode,
        newMode: responsibleMode,
        reason: reason?.trim() || null,
        changedBy,
      });
    });
  }

  return getCooperativeSacherieConfig(cooperativeId);
}

export function roleCanOperateSacherie(
  responsibleMode: SacherieResponsibleMode,
  role: string,
): boolean {
  if (role === "pca" || role === "directeur") return true;
  if (responsibleMode === "magasinier") return role === "magasinier";
  if (responsibleMode === "sacherie") return role === "sacherie";
  return role === "magasinier" || role === "sacherie";
}

export async function canOperateSacherie(cooperativeId: number, role: string): Promise<boolean> {
  const config = await getCooperativeSacherieConfig(cooperativeId);
  return config ? roleCanOperateSacherie(config.responsibleMode, role) : false;
}