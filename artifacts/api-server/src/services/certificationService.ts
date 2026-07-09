import { db, certificationsTable, auditsCertificationsTable, membresTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";
import { logger } from "../lib/logger";
import { notifierParRole } from "./notificationService.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CertifType =
  | "rainforest_alliance"
  | "fairtrade"
  | "bio"
  | "eudr"
  | "utz"
  | "autre";

export type CertifStatut =
  | "actif"
  | "suspendu"
  | "expire"
  | "renouvellement_en_cours";

export interface CreateCertificationInput {
  type: string;
  nomCertificateur?: string | null;
  numeroCertificat?: string | null;
  dateObtention?: string | null;
  dateExpiration?: string | null;
  statut?: string;
  superficieCertifieeHa?: string | null;
  nbMembresCouVerts?: number | null;
  lienDocument?: string | null;
  notes?: string | null;
}

export interface UpdateCertificationInput extends Partial<CreateCertificationInput> {}

// ─── Lecture ──────────────────────────────────────────────────────────────────

export async function listCertifications(cooperativeId: number) {
  const rows = await db
    .select()
    .from(certificationsTable)
    .where(eq(certificationsTable.cooperativeId, cooperativeId))
    .orderBy(desc(certificationsTable.createdAt));

  return rows;
}

export async function getCertification(cooperativeId: number, id: number) {
  const [row] = await db
    .select()
    .from(certificationsTable)
    .where(
      and(
        eq(certificationsTable.cooperativeId, cooperativeId),
        eq(certificationsTable.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getAuditsCertification(cooperativeId: number, certificationId: number) {
  const rows = await db
    .select()
    .from(auditsCertificationsTable)
    .where(
      and(
        eq(auditsCertificationsTable.cooperativeId, cooperativeId),
        eq(auditsCertificationsTable.certificationId, certificationId),
      ),
    )
    .orderBy(desc(auditsCertificationsTable.createdAt));
  return rows;
}

// ─── Stats & Dashboard ────────────────────────────────────────────────────────

export async function getStatsCertifications(cooperativeId: number) {
  const all = await listCertifications(cooperativeId);

  const today = new Date().toISOString().slice(0, 10);
  const in60Days = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);

  const total      = all.length;
  const actives    = all.filter(c => c.statut === "actif").length;
  const expirees   = all.filter(c => c.statut === "expire").length;
  const suspendues = all.filter(c => c.statut === "suspendu").length;
  const aRenouveler = all.filter(c =>
    c.statut === "actif" &&
    c.dateExpiration &&
    c.dateExpiration >= today &&
    c.dateExpiration <= in60Days,
  ).length;

  // Membres certifiés (champ membre.certification non nul)
  const [res] = await db
    .select({ nb: count() })
    .from(membresTable)
    .where(
      and(
        eq(membresTable.cooperativeId, cooperativeId),
        sql`${membresTable.certification} IS NOT NULL AND ${membresTable.certification} <> ''`,
      ),
    );
  const nbMembresCertifies = Number(res?.nb ?? 0);

  const parType: Record<string, number> = {};
  for (const c of all) {
    parType[c.type] = (parType[c.type] ?? 0) + 1;
  }

  return {
    total,
    actives,
    expirees,
    suspendues,
    aRenouveler,
    nbMembresCertifies,
    parType,
    prochesExpiration: all
      .filter(c => c.statut === "actif" && c.dateExpiration && c.dateExpiration >= today && c.dateExpiration <= in60Days)
      .sort((a, b) => (a.dateExpiration ?? "").localeCompare(b.dateExpiration ?? "")),
  };
}

// ─── Création ─────────────────────────────────────────────────────────────────

export async function createCertification(
  cooperativeId: number,
  data: CreateCertificationInput,
  userId: number,
) {
  const [row] = await db
    .insert(certificationsTable)
    .values({
      cooperativeId,
      type:                  data.type,
      nomCertificateur:      data.nomCertificateur   ?? null,
      numeroCertificat:      data.numeroCertificat   ?? null,
      dateObtention:         data.dateObtention      ?? null,
      dateExpiration:        data.dateExpiration     ?? null,
      statut:                data.statut             ?? "actif",
      superficieCertifieeHa: data.superficieCertifieeHa ?? null,
      nbMembresCouVerts:     data.nbMembresCouVerts  ?? 0,
      lienDocument:          data.lienDocument       ?? null,
      notes:                 data.notes              ?? null,
      creePar:               userId,
    })
    .returning();

  await db.insert(auditsCertificationsTable).values({
    certificationId: row!.id,
    cooperativeId,
    action:         "creation",
    nouveauStatut:  row!.statut,
    notes:          `Certification ${data.type} créée`,
    faitPar:        userId,
  });

  return row!;
}

// ─── Mise à jour ──────────────────────────────────────────────────────────────

export async function updateCertification(
  cooperativeId: number,
  id: number,
  data: UpdateCertificationInput,
  userId: number,
) {
  const existing = await getCertification(cooperativeId, id);
  if (!existing) throw new Error("Certification introuvable");

  const [updated] = await db
    .update(certificationsTable)
    .set({
      ...(data.type              !== undefined && { type:                  data.type }),
      ...(data.nomCertificateur  !== undefined && { nomCertificateur:      data.nomCertificateur }),
      ...(data.numeroCertificat  !== undefined && { numeroCertificat:      data.numeroCertificat }),
      ...(data.dateObtention     !== undefined && { dateObtention:         data.dateObtention }),
      ...(data.dateExpiration    !== undefined && { dateExpiration:        data.dateExpiration }),
      ...(data.statut            !== undefined && { statut:                data.statut }),
      ...(data.superficieCertifieeHa !== undefined && { superficieCertifieeHa: data.superficieCertifieeHa }),
      ...(data.nbMembresCouVerts !== undefined && { nbMembresCouVerts:     data.nbMembresCouVerts }),
      ...(data.lienDocument      !== undefined && { lienDocument:          data.lienDocument }),
      ...(data.notes             !== undefined && { notes:                 data.notes }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(certificationsTable.cooperativeId, cooperativeId),
        eq(certificationsTable.id, id),
      ),
    )
    .returning();

  const statutChange = data.statut && data.statut !== existing.statut;
  await db.insert(auditsCertificationsTable).values({
    certificationId: id,
    cooperativeId,
    action:         statutChange ? (data.statut === "renouvellement_en_cours" ? "renouvellement" : data.statut === "suspendu" ? "suspension" : "modification") : "modification",
    ancienStatut:   existing.statut,
    nouveauStatut:  updated!.statut,
    notes:          data.notes ?? null,
    faitPar:        userId,
  });

  // Notification si expiration proche
  if (data.statut === "actif" && updated!.dateExpiration) {
    const daysLeft = Math.round(
      (new Date(updated!.dateExpiration).getTime() - Date.now()) / 86_400_000,
    );
    if (daysLeft <= 60 && daysLeft > 0) {
      await notifierParRole(cooperativeId, ["pca", "directeur", "responsable_tracabilite"], {
        type:         "certification_expiration",
        gravite:      daysLeft <= 30 ? "critique" : "attention",
        titre:        `Certification ${updated!.type} expire dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`,
        message:      `La certification ${updated!.type} (${updated!.numeroCertificat ?? "sans numéro"}) expire le ${updated!.dateExpiration}.`,
        lien:         `/certifications/${id}`,
        lienLibelle:  "Voir la certification",
        sourceModule: "certifications",
        sourceId:     id,
      });
    }
  }

  return updated!;
}

// ─── Suppression ──────────────────────────────────────────────────────────────

export async function deleteCertification(
  cooperativeId: number,
  id: number,
  userId: number,
): Promise<void> {
  const existing = await getCertification(cooperativeId, id);
  if (!existing) throw new Error("Certification introuvable");

  await db.insert(auditsCertificationsTable).values({
    certificationId: id,
    cooperativeId,
    action:        "suppression",
    ancienStatut:  existing.statut,
    notes:         "Certification supprimée",
    faitPar:       userId,
  });

  await db
    .delete(certificationsTable)
    .where(
      and(
        eq(certificationsTable.cooperativeId, cooperativeId),
        eq(certificationsTable.id, id),
      ),
    );

  logger.info({ id, cooperativeId, userId }, "Certification supprimée");
}

// ─── Vérification automatique des expirations ────────────────────────────────

export async function verifierExpirationsCertifications(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Marquer les certifications expirées
  const expired = await db
    .update(certificationsTable)
    .set({ statut: "expire", updatedAt: new Date() })
    .where(
      and(
        eq(certificationsTable.statut, "actif"),
        sql`${certificationsTable.dateExpiration} IS NOT NULL`,
        lte(certificationsTable.dateExpiration, today),
      ),
    )
    .returning();

  for (const cert of expired) {
    logger.info({ id: cert.id, cooperativeId: cert.cooperativeId }, "Certification expirée automatiquement");
    await db.insert(auditsCertificationsTable).values({
      certificationId: cert.id,
      cooperativeId:   cert.cooperativeId,
      action:         "expiration",
      ancienStatut:   "actif",
      nouveauStatut:  "expire",
      notes:          "Expiration automatique détectée",
      faitPar:        null,
    });
    await notifierParRole(cert.cooperativeId, ["pca", "directeur", "responsable_tracabilite"], {
      type:         "certification_expiration",
      gravite:      "critique",
      titre:        `Certification ${cert.type} expirée`,
      message:      `La certification ${cert.type} (${cert.numeroCertificat ?? "sans numéro"}) a expiré le ${cert.dateExpiration}.`,
      lien:         `/certifications/${cert.id}`,
      lienLibelle:  "Voir la certification",
      sourceModule: "certifications",
      sourceId:     cert.id,
    });
  }
}
