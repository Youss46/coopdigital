import { db, certificationsTable, auditsCertificationsTable, certificationsMembresTable, membresTable, campagnesTable, livraisonsTable, missionsEnqueteTable } from "@workspace/db";
import { eq, and, desc, lte, sql, count, inArray, sum, ne } from "drizzle-orm";
import { logger } from "../lib/logger";
import { notifierParRole } from "./notificationService.js";

// ─── Critères par type de certification ──────────────────────────────────────

export const CRITERES_PAR_TYPE: Record<string, string[]> = {
  rainforest_alliance: [
    "Gestion durable des terres",
    "Biodiversité et écosystèmes",
    "Protection des ressources en eau",
    "Conditions de travail équitables",
    "Sécurité et santé des travailleurs",
    "Droits des communautés locales",
    "Traçabilité et gestion de la chaîne d'approvisionnement",
  ],
  fairtrade: [
    "Commerce équitable et prix minimum",
    "Prime Fairtrade utilisée correctement",
    "Droits des travailleurs respectés",
  ],
  bio: [
    "Absence de pesticides chimiques",
    "Fertilisation organique uniquement",
    "Rotation des cultures respectée",
    "Zone tampon avec parcelles conventionnelles",
    "Traçabilité des intrants biologiques",
  ],
  eudr: [
    "Géolocalisation GPS des parcelles complète",
    "Déforestation zéro après 2020 prouvée",
    "Conformité réglementaire pays d'origine",
    "Diligence raisonnée documentée",
  ],
  utz: [
    "Bonnes pratiques agricoles",
    "Traçabilité interne",
    "Gestion environnementale de base",
  ],
  autre: [
    "Critère personnalisé 1",
    "Critère personnalisé 2",
  ],
};

function calculerStatutConformite(score: number, scoreMax: number): string {
  if (scoreMax === 0) return "non_conforme";
  const pct = score / scoreMax;
  if (pct >= 0.8) return "certifie";
  if (pct >= 0.5) return "en_cours";
  return "non_conforme";
}

// ─── Types entrée ─────────────────────────────────────────────────────────────

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

export interface EvaluerMembreInput {
  membreId: number;
  criteresValides: string[];
  primeFcfaHa?: string | null;
  notes?: string | null;
  dateEvaluation?: string | null;
}

export interface CreateAuditInput {
  action: string;
  ancienStatut?: string | null;
  nouveauStatut?: string | null;
  notes?: string | null;
}

// ─── Certifications coopérative — Lecture ─────────────────────────────────────

export async function listCertifications(cooperativeId: number) {
  return db
    .select()
    .from(certificationsTable)
    .where(eq(certificationsTable.cooperativeId, cooperativeId))
    .orderBy(desc(certificationsTable.createdAt));
}

export async function getCertification(cooperativeId: number, id: number) {
  const [row] = await db
    .select()
    .from(certificationsTable)
    .where(and(eq(certificationsTable.cooperativeId, cooperativeId), eq(certificationsTable.id, id)))
    .limit(1);
  return row ?? null;
}

export async function getAuditsCertification(cooperativeId: number, certificationId: number) {
  return db
    .select()
    .from(auditsCertificationsTable)
    .where(
      and(
        eq(auditsCertificationsTable.cooperativeId, cooperativeId),
        eq(auditsCertificationsTable.certificationId, certificationId),
      ),
    )
    .orderBy(desc(auditsCertificationsTable.createdAt));
}

// ─── Stats dashboard ──────────────────────────────────────────────────────────

export async function getStatsCertifications(cooperativeId: number) {
  const all = await listCertifications(cooperativeId);

  const today    = new Date().toISOString().slice(0, 10);
  const in90Days = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  const total       = all.length;
  const actives     = all.filter(c => c.statut === "actif").length;
  const expirees    = all.filter(c => c.statut === "expire").length;
  const suspendues  = all.filter(c => c.statut === "suspendu").length;
  const aRenouveler = all.filter(c =>
    c.statut === "actif" && c.dateExpiration &&
    c.dateExpiration >= today && c.dateExpiration <= in90Days,
  ).length;

  const [res] = await db
    .select({ nb: count() })
    .from(certificationsMembresTable)
    .where(and(
      eq(certificationsMembresTable.cooperativeId, cooperativeId),
      eq(certificationsMembresTable.statutConformite, "certifie"),
    ));
  const nbMembresCertifies = Number(res?.nb ?? 0);

  const parType: Record<string, number> = {};
  for (const c of all) parType[c.type] = (parType[c.type] ?? 0) + 1;

  return {
    total, actives, expirees, suspendues, aRenouveler, nbMembresCertifies, parType,
    prochesExpiration: all
      .filter(c => c.statut === "actif" && c.dateExpiration && c.dateExpiration >= today && c.dateExpiration <= in90Days)
      .sort((a, b) => (a.dateExpiration ?? "").localeCompare(b.dateExpiration ?? "")),
  };
}

// ─── Certifications coopérative — Création / MAJ / Suppression ───────────────

export async function createCertification(cooperativeId: number, data: CreateCertificationInput, userId: number) {
  const [row] = await db.insert(certificationsTable).values({
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
  }).returning();

  await db.insert(auditsCertificationsTable).values({
    certificationId: row!.id, cooperativeId,
    action: "creation", nouveauStatut: row!.statut,
    notes: `Certification ${data.type} créée`, faitPar: userId,
  });

  return row!;
}

export async function updateCertification(cooperativeId: number, id: number, data: UpdateCertificationInput, userId: number) {
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
    .where(and(eq(certificationsTable.cooperativeId, cooperativeId), eq(certificationsTable.id, id)))
    .returning();

  const statutChange = data.statut && data.statut !== existing.statut;
  const action = statutChange
    ? (data.statut === "renouvellement_en_cours" ? "renouvellement" : data.statut === "suspendu" ? "suspension" : "modification")
    : "modification";

  await db.insert(auditsCertificationsTable).values({
    certificationId: id, cooperativeId, action,
    ancienStatut: existing.statut, nouveauStatut: updated!.statut,
    notes: data.notes ?? null, faitPar: userId,
  });

  if (updated!.statut === "actif" && updated!.dateExpiration) {
    const daysLeft = Math.round((new Date(updated!.dateExpiration).getTime() - Date.now()) / 86_400_000);
    if (daysLeft <= 90 && daysLeft > 0) {
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

export async function deleteCertification(cooperativeId: number, id: number, userId: number): Promise<void> {
  const existing = await getCertification(cooperativeId, id);
  if (!existing) throw new Error("Certification introuvable");

  await db.delete(certificationsMembresTable)
    .where(and(eq(certificationsMembresTable.cooperativeId, cooperativeId), eq(certificationsMembresTable.certificationId, id)));

  await db.delete(certificationsTable)
    .where(and(eq(certificationsTable.cooperativeId, cooperativeId), eq(certificationsTable.id, id)));

  logger.info({ id, cooperativeId, userId }, "Certification supprimée");
}

// ─── Audit — Création manuelle ────────────────────────────────────────────────

export async function createAudit(cooperativeId: number, certificationId: number, data: CreateAuditInput, userId: number) {
  const certif = await getCertification(cooperativeId, certificationId);
  if (!certif) throw new Error("Certification introuvable");

  const [audit] = await db.insert(auditsCertificationsTable).values({
    certificationId, cooperativeId,
    action:        data.action,
    ancienStatut:  data.ancienStatut  ?? null,
    nouveauStatut: data.nouveauStatut ?? null,
    notes:         data.notes         ?? null,
    faitPar:       userId,
  }).returning();

  if (data.nouveauStatut && data.nouveauStatut !== certif.statut) {
    await db.update(certificationsTable)
      .set({ statut: data.nouveauStatut, updatedAt: new Date() })
      .where(and(eq(certificationsTable.cooperativeId, cooperativeId), eq(certificationsTable.id, certificationId)));
  }

  return audit!;
}

// ─── Conformité membres ───────────────────────────────────────────────────────

export async function listMembresCertification(cooperativeId: number, certificationId: number) {
  const rows = await db
    .select({
      cm: certificationsMembresTable,
      membre: {
        id:        membresTable.id,
        nom:       membresTable.nom,
        prenoms:   membresTable.prenoms,
        section:   membresTable.section,
        telephone: membresTable.telephone,
      },
    })
    .from(certificationsMembresTable)
    .innerJoin(membresTable, eq(membresTable.id, certificationsMembresTable.membreId))
    .where(and(
      eq(certificationsMembresTable.cooperativeId, cooperativeId),
      eq(certificationsMembresTable.certificationId, certificationId),
      eq(membresTable.cooperativeId, cooperativeId),   // guard multi-tenant sur le membre
    ))
    .orderBy(desc(certificationsMembresTable.updatedAt));

  return rows.map(r => ({
    ...r.cm,
    membreNom:       `${r.membre.prenoms} ${r.membre.nom}`,
    membreSection:   r.membre.section,
    membreTelephone: r.membre.telephone,
  }));
}

export async function getMembreCertification(cooperativeId: number, certificationId: number, membreId: number) {
  const [row] = await db
    .select()
    .from(certificationsMembresTable)
    .where(and(
      eq(certificationsMembresTable.cooperativeId, cooperativeId),
      eq(certificationsMembresTable.certificationId, certificationId),
      eq(certificationsMembresTable.membreId, membreId),
    ))
    .limit(1);
  return row ?? null;
}

export async function evaluerMembre(cooperativeId: number, certificationId: number, data: EvaluerMembreInput, userId: number) {
  const certif = await getCertification(cooperativeId, certificationId);
  if (!certif) throw new Error("Certification introuvable");

  // Guard IDOR : vérifier que le membre appartient bien à la même coopérative
  const [membreOwnership] = await db
    .select({ id: membresTable.id })
    .from(membresTable)
    .where(and(eq(membresTable.id, data.membreId), eq(membresTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!membreOwnership) throw new Error("Membre introuvable ou hors coopérative");

  const criteresPossibles = CRITERES_PAR_TYPE[certif.type] ?? [];
  const criteresValides   = (data.criteresValides ?? []).filter(c => criteresPossibles.includes(c));
  const score             = criteresValides.length;
  const scoreMax          = criteresPossibles.length;
  const statut            = calculerStatutConformite(score, scoreMax);

  const existing = await getMembreCertification(cooperativeId, certificationId, data.membreId);

  if (existing) {
    const [updated] = await db
      .update(certificationsMembresTable)
      .set({
        criteresValides, score, scoreMax, statutConformite: statut,
        primeFcfaHa:    data.primeFcfaHa    ?? null,
        notes:          data.notes          ?? null,
        evaluePar:      userId,
        dateEvaluation: data.dateEvaluation ?? new Date().toISOString().slice(0, 10),
        updatedAt:      new Date(),
      })
      .where(and(
        eq(certificationsMembresTable.cooperativeId, cooperativeId),
        eq(certificationsMembresTable.certificationId, certificationId),
        eq(certificationsMembresTable.membreId, data.membreId),
      ))
      .returning();
    return updated!;
  }

  const [created] = await db.insert(certificationsMembresTable).values({
    cooperativeId, certificationId, membreId: data.membreId,
    criteresValides, score, scoreMax, statutConformite: statut,
    primeFcfaHa:    data.primeFcfaHa    ?? null,
    notes:          data.notes          ?? null,
    evaluePar:      userId,
    dateEvaluation: data.dateEvaluation ?? new Date().toISOString().slice(0, 10),
  }).returning();
  return created!;
}

export async function getStatsMembresConformite(cooperativeId: number, certificationId: number) {
  const membres      = await listMembresCertification(cooperativeId, certificationId);
  const certifies    = membres.filter(m => m.statutConformite === "certifie").length;
  const enCours      = membres.filter(m => m.statutConformite === "en_cours").length;
  const nonConformes = membres.filter(m => m.statutConformite === "non_conforme").length;
  const total        = membres.length;
  const tauxConformite = total > 0 ? Math.round((certifies / total) * 100) : 0;
  return { certifies, enCours, nonConformes, total, tauxConformite };
}

// ─── Vérification auto des expirations (cron nightly) ────────────────────────

export async function verifierExpirationsCertifications(): Promise<void> {
  const today    = new Date().toISOString().slice(0, 10);
  const in90Days = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  const expired = await db
    .update(certificationsTable)
    .set({ statut: "expire", updatedAt: new Date() })
    .where(and(
      eq(certificationsTable.statut, "actif"),
      sql`${certificationsTable.dateExpiration} IS NOT NULL`,
      lte(certificationsTable.dateExpiration, today),
    ))
    .returning();

  for (const cert of expired) {
    logger.info({ id: cert.id, cooperativeId: cert.cooperativeId }, "Certification expirée automatiquement");
    await db.insert(auditsCertificationsTable).values({
      certificationId: cert.id, cooperativeId: cert.cooperativeId,
      action: "expiration", ancienStatut: "actif", nouveauStatut: "expire",
      notes: "Expiration automatique détectée", faitPar: null,
    });
    await notifierParRole(cert.cooperativeId, ["pca", "directeur", "responsable_tracabilite"], {
      type: "certification_expiration", gravite: "critique",
      titre:   `Certification ${cert.type} expirée`,
      message: `La certification ${cert.type} (${cert.numeroCertificat ?? "sans numéro"}) a expiré le ${cert.dateExpiration}.`,
      lien: `/certifications/${cert.id}`, lienLibelle: "Voir la certification",
      sourceModule: "certifications", sourceId: cert.id,
    });
  }

  const prochaines = await db
    .select()
    .from(certificationsTable)
    .where(and(
      eq(certificationsTable.statut, "actif"),
      sql`${certificationsTable.dateExpiration} IS NOT NULL`,
      sql`${certificationsTable.dateExpiration} > ${today}`,
      lte(certificationsTable.dateExpiration, in90Days),
    ));

  for (const cert of prochaines) {
    const daysLeft = Math.round((new Date(cert.dateExpiration!).getTime() - Date.now()) / 86_400_000);
    if ([90, 60, 30, 14, 7].includes(daysLeft)) {
      await notifierParRole(cert.cooperativeId, ["pca", "directeur", "responsable_tracabilite"], {
        type: "certification_expiration", gravite: daysLeft <= 30 ? "critique" : "attention",
        titre:   `Certification ${cert.type} expire dans ${daysLeft} jours`,
        message: `La certification ${cert.type} (${cert.numeroCertificat ?? "sans numéro"}) expire le ${cert.dateExpiration}.`,
        lien: `/certifications/${cert.id}`, lienLibelle: "Voir la certification",
        sourceModule: "certifications", sourceId: cert.id,
      });
    }
  }

  logger.info({ expired: expired.length, prochaines: prochaines.length }, "Vérification expirations certifications terminée");
}

// ─── Dashboard consolidé ──────────────────────────────────────────────────────

export async function getDashboardCertifications(cooperativeId: number) {
  const today    = new Date().toISOString().slice(0, 10);
  const in90Days = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  // 1. Toutes les certifications de la coop
  const certs = await listCertifications(cooperativeId);

  // 2. Stats conformité membres par certification (agrégées en une query)
  const membresStats = await db
    .select({
      certificationId:  certificationsMembresTable.certificationId,
      statutConformite: certificationsMembresTable.statutConformite,
      nb:               count(),
    })
    .from(certificationsMembresTable)
    .where(eq(certificationsMembresTable.cooperativeId, cooperativeId))
    .groupBy(certificationsMembresTable.certificationId, certificationsMembresTable.statutConformite);

  // 3. Missions en cours par certification (une query)
  const missionsStats = await db
    .select({
      certificationId: missionsEnqueteTable.certificationId,
      nb:              count(),
    })
    .from(missionsEnqueteTable)
    .where(and(
      eq(missionsEnqueteTable.cooperativeId, cooperativeId),
      ne(missionsEnqueteTable.statut, "validee"),
    ))
    .groupBy(missionsEnqueteTable.certificationId);

  // 4. Campagne active pour tonnage
  const [campagne] = await db
    .select({ id: campagnesTable.id, libelle: campagnesTable.libelle })
    .from(campagnesTable)
    .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
    .limit(1);

  // 5. Tonnage par certification (si campagne active)
  let tonnageParCertif: Record<number, number> = {};
  if (campagne) {
    // Récupérer tous les membres certifiés avec leur certificationId
    const certifies = await db
      .select({ certificationId: certificationsMembresTable.certificationId, membreId: certificationsMembresTable.membreId })
      .from(certificationsMembresTable)
      .where(and(
        eq(certificationsMembresTable.cooperativeId, cooperativeId),
        eq(certificationsMembresTable.statutConformite, "certifie"),
      ));

    if (certifies.length > 0) {
      const allMembreIds = [...new Set(certifies.map(c => c.membreId))];
      const [tonnageRow] = await db
        .select({ membreId: livraisonsTable.membreId, tonnage: sum(livraisonsTable.poidsKg) })
        .from(livraisonsTable)
        .where(and(eq(livraisonsTable.campagneId, campagne.id), inArray(livraisonsTable.membreId, allMembreIds)))
        .groupBy(livraisonsTable.membreId)
        .limit(1);
      // Accumulate tonnage per certification
      const tonnageParMembre: Record<number, number> = {};
      const rows = await db
        .select({ membreId: livraisonsTable.membreId, tonnage: sum(livraisonsTable.poidsKg) })
        .from(livraisonsTable)
        .where(and(eq(livraisonsTable.campagneId, campagne.id), inArray(livraisonsTable.membreId, allMembreIds)))
        .groupBy(livraisonsTable.membreId);
      for (const r of rows) if (r.membreId !== null) tonnageParMembre[r.membreId] = parseFloat(r.tonnage ?? "0") || 0;
      for (const c of certifies) {
        tonnageParCertif[c.certificationId] = (tonnageParCertif[c.certificationId] ?? 0) + (tonnageParMembre[c.membreId] ?? 0);
      }
      void tonnageRow;
    }
  }

  // 6. Construire les stats par certification
  const membresMap: Record<number, Record<string, number>> = {};
  for (const row of membresStats) {
    if (!membresMap[row.certificationId]) membresMap[row.certificationId] = {};
    membresMap[row.certificationId]![row.statutConformite ?? "non_conforme"] = Number(row.nb);
  }
  const missionsMap: Record<number, number> = {};
  for (const row of missionsStats) missionsMap[row.certificationId] = Number(row.nb);

  const parCertification = certs.map(c => {
    const m = membresMap[c.id] ?? {};
    const certifies2  = m["certifie"]      ?? 0;
    const enCours     = m["en_cours"]      ?? 0;
    const nonConf     = m["non_conforme"]  ?? 0;
    const totalMembres = certifies2 + enCours + nonConf;
    const tauxConformite = totalMembres > 0 ? Math.round((certifies2 / totalMembres) * 100) : 0;
    const daysLeft = c.dateExpiration
      ? Math.round((new Date(c.dateExpiration).getTime() - Date.now()) / 86_400_000)
      : null;
    return {
      id: c.id, type: c.type, statut: c.statut,
      nomCertificateur: c.nomCertificateur, numeroCertificat: c.numeroCertificat,
      dateExpiration: c.dateExpiration, daysLeft,
      membres: { certifies: certifies2, enCours, nonConformes: nonConf, total: totalMembres, tauxConformite },
      tonnageKg: tonnageParCertif[c.id] ?? 0,
      missionsEnCours: missionsMap[c.id] ?? 0,
      campagne: campagne ?? null,
    };
  });

  // 7. KPIs globaux
  const totalActives        = certs.filter(c => c.statut === "actif").length;
  const totalExpirees       = certs.filter(c => c.statut === "expire").length;
  const totalARenouveler    = certs.filter(c => c.statut === "actif" && c.dateExpiration && c.dateExpiration >= today && c.dateExpiration <= in90Days).length;
  const totalMembresCertifies = Object.values(membresMap).reduce((acc, m) => acc + (m["certifie"] ?? 0), 0);
  const prochesExpiration   = certs
    .filter(c => c.statut === "actif" && c.dateExpiration && c.dateExpiration >= today && c.dateExpiration <= in90Days)
    .sort((a, b) => (a.dateExpiration ?? "").localeCompare(b.dateExpiration ?? ""));

  return {
    kpis: { total: certs.length, actives: totalActives, expirees: totalExpirees, aRenouveler: totalARenouveler, membresCertifies: totalMembresCertifies },
    parCertification,
    prochesExpiration,
    campagne: campagne ?? null,
  };
}

// ─── Tonnage & primes — campagne active ──────────────────────────────────────

export async function getTonnageCampagneCertification(cooperativeId: number, certificationId: number) {
  // 1. Campagne active
  const [campagne] = await db
    .select({ id: campagnesTable.id, libelle: campagnesTable.libelle })
    .from(campagnesTable)
    .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
    .limit(1);
  if (!campagne) return null;

  // 2. Membres certifiés pour cette certification
  const certifies = await db
    .select({ membreId: certificationsMembresTable.membreId, primeFcfaHa: certificationsMembresTable.primeFcfaHa })
    .from(certificationsMembresTable)
    .where(and(
      eq(certificationsMembresTable.cooperativeId, cooperativeId),
      eq(certificationsMembresTable.certificationId, certificationId),
      eq(certificationsMembresTable.statutConformite, "certifie"),
    ));
  if (certifies.length === 0) return { campagneId: campagne.id, campagneLibelle: campagne.libelle, tonnageTotalKg: 0, nbMembresAvecLivraison: 0, primeTotaleEstimeeFcfa: 0 };

  const membreIds = certifies.map(c => c.membreId);

  // 3. Somme du tonnage livré par ces membres durant la campagne active
  const [tonnageRow] = await db
    .select({
      tonnageTotalKg: sum(livraisonsTable.poidsKg),
      nbMembres: count(livraisonsTable.membreId),
    })
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.campagneId, campagne.id),
      inArray(livraisonsTable.membreId, membreIds),
    ));

  const tonnageTotalKg = parseFloat(tonnageRow?.tonnageTotalKg ?? "0") || 0;
  const nbMembresAvecLivraison = Number(tonnageRow?.nbMembres ?? 0);

  // 4. Prime totale estimée = somme(prime_fcfa_ha) pour les certifiés (si renseignée)
  const primeTotaleEstimeeFcfa = certifies
    .reduce((acc, c) => acc + (c.primeFcfaHa ? parseFloat(c.primeFcfaHa) : 0), 0);

  return {
    campagneId: campagne.id,
    campagneLibelle: campagne.libelle,
    tonnageTotalKg,
    nbMembresAvecLivraison,
    primeTotaleEstimeeFcfa,
  };
}
