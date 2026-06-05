import { db, configCooperativeTable, documentsOfficielsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getConfig(cooperativeId: number) {
  const [row] = await db
    .select()
    .from(configCooperativeTable)
    .where(eq(configCooperativeTable.cooperativeId, cooperativeId))
    .limit(1);
  return row ?? null;
}

export async function upsertConfig(
  cooperativeId: number,
  updatedBy: number,
  data: Partial<typeof configCooperativeTable.$inferInsert>,
) {
  const existing = await getConfig(cooperativeId);

  if (existing) {
    const [updated] = await db
      .update(configCooperativeTable)
      .set({ ...data, updatedBy, updatedAt: new Date() })
      .where(eq(configCooperativeTable.cooperativeId, cooperativeId))
      .returning();
    return updated;
  } else {
    const [created] = await db
      .insert(configCooperativeTable)
      .values({ cooperativeId, updatedBy, ...data })
      .returning();
    return created;
  }
}

export async function updateLogoUrl(
  cooperativeId: number,
  updatedBy: number,
  logoUrl: string,
) {
  return upsertConfig(cooperativeId, updatedBy, { logoUrl });
}

export async function getDocumentsOfficiels(cooperativeId: number) {
  return db
    .select()
    .from(documentsOfficielsTable)
    .where(eq(documentsOfficielsTable.cooperativeId, cooperativeId))
    .orderBy(documentsOfficielsTable.createdAt);
}

export async function createDocumentOfficiel(
  cooperativeId: number,
  data: {
    type: string;
    libelle: string;
    fichierUrl: string;
    dateDocument?: string | null;
    dateExpiration?: string | null;
  },
) {
  const [doc] = await db
    .insert(documentsOfficielsTable)
    .values({
      cooperativeId,
      type: data.type,
      libelle: data.libelle,
      fichierUrl: data.fichierUrl,
      dateDocument: data.dateDocument ?? null,
      dateExpiration: data.dateExpiration ?? null,
    })
    .returning();
  return doc;
}

export async function deleteDocumentOfficiel(
  cooperativeId: number,
  documentId: number,
): Promise<boolean> {
  const [deleted] = await db
    .delete(documentsOfficielsTable)
    .where(eq(documentsOfficielsTable.id, documentId))
    .returning({ cooperativeId: documentsOfficielsTable.cooperativeId });

  if (!deleted) return false;
  if (deleted.cooperativeId !== cooperativeId) {
    return false;
  }
  return true;
}
