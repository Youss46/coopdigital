import {
  db,
  membresTable,
  livraisonsTable,
  parcellesTable,
  assembleesGeneralesTable,
  campagnesTable,
  avancesTable,
  indicateursRseTable,
  formationsRseTable,
} from "@workspace/db";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import { calculerConformiteGlobale } from "./parcelleService";
import { logger } from "../lib/logger";

export type { IndicateurRse, FormationRse } from "@workspace/db";

// ── Helpers ──────────────────────────────────────────────────────────────────

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

// ── Service principal ─────────────────────────────────────────────────────────

export async function calculerIndicateurs(
  cooperativeId: number,
  campagneId: number,
  userId?: number,
) {
  const [campagne] = await db
    .select()
    .from(campagnesTable)
    .where(eq(campagnesTable.id, campagneId))
    .limit(1);

  if (!campagne) throw new Error("Campagne introuvable");
  const annee = campagne.anneeDebut;

  // ── 1. MEMBRES ─────────────────────────────────────────────────────────────
  const [membresStats] = await db
    .select({
      total:  sql<number>`count(*)::int`,
      femmes: sql<number>`count(*) FILTER (WHERE sexe = 'F')::int`,
      jeunes: sql<number>`count(*) FILTER (
        WHERE date_naissance IS NOT NULL
          AND extract(year FROM now()) - extract(year FROM date_naissance) < 35
      )::int`,
    })
    .from(membresTable)
    .where(
      and(
        eq(membresTable.cooperativeId, cooperativeId),
        eq(membresTable.statut, "actif"),
      ),
    );

  const nbTotal  = membresStats?.total  ?? 0;
  const nbFemmes = membresStats?.femmes ?? 0;
  const nbJeunes = membresStats?.jeunes ?? 0;

  // ── 2. REVENUS par membre ──────────────────────────────────────────────────
  const idsCoop = (
    await db
      .select({ id: membresTable.id })
      .from(membresTable)
      .where(eq(membresTable.cooperativeId, cooperativeId))
  ).map((r) => r.id);

  const revenuRows = await db
    .select({
      membreId: livraisonsTable.membreId,
      revenu:   sql<string>`sum(montant_net_fcfa)`,
    })
    .from(livraisonsTable)
    .where(eq(livraisonsTable.campagneId, campagneId))
    .groupBy(livraisonsTable.membreId);

  const idSet = new Set(idsCoop);
  const revenus = revenuRows
    .filter((r) => idSet.has(r.membreId))
    .map((r) => Math.round(Number(r.revenu)));

  const SEUIL = 750_000;
  let revenuMoyen = 0, revenuMedian = 0, revenuMin = 0, revenuMax = 0, nbSousSeuil = 0;

  if (revenus.length > 0) {
    const sorted = [...revenus].sort((a, b) => a - b);
    revenuMoyen  = Math.round(revenus.reduce((s, v) => s + v, 0) / revenus.length);
    revenuMedian = median(sorted);
    revenuMin    = sorted[0] ?? 0;
    revenuMax    = sorted[sorted.length - 1] ?? 0;
    nbSousSeuil  = sorted.filter((v) => v < SEUIL).length;
  }

  // ── 3. PRIX MOYEN au kg ────────────────────────────────────────────────────
  const [prixRow] = await db
    .select({
      prixMoyen: sql<string>`
        (sum(montant_net_fcfa)::numeric / NULLIF(sum(poids_net_kg)::numeric, 0))
      `,
    })
    .from(livraisonsTable)
    .where(eq(livraisonsTable.campagneId, campagneId));

  const prixMoyenKg = prixRow?.prixMoyen
    ? Math.round(Number(prixRow.prixMoyen))
    : null;

  // ── 4. EUDR ────────────────────────────────────────────────────────────────
  let conformite = {
    nb_conformes: 0,
    nb_non_conformes: 0,
    nb_en_cours: 0,
    nb_non_verifiees: 0,
    nb_parcelles_total: 0,
    pct_superficie_conforme: 0,
    superficie_totale_ha: 0,
    superficie_conforme_ha: 0,
    membres_avec_parcelle: 0,
    membres_sans_parcelle: 0,
    par_section: [] as { section: string; total: number; conformes: number; pct: number }[],
  };
  try {
    conformite = await calculerConformiteGlobale(cooperativeId);
  } catch (err) {
    logger.warn({ err }, "RSE: impossible de calculer conformité EUDR");
  }

  const pctEudr = conformite.nb_parcelles_total > 0
    ? pct(conformite.nb_conformes, conformite.nb_parcelles_total)
    : 0;

  // ── 5. CERTIFICATIONS depuis parcelles ────────────────────────────────────
  const certRows = await db
    .select({
      organisme: parcellesTable.organismeCertificateur,
      nb:        sql<number>`count(distinct membre_id)::int`,
    })
    .from(parcellesTable)
    .where(
      and(
        eq(parcellesTable.cooperativeId, cooperativeId),
        eq(parcellesTable.actif, true),
        isNotNull(parcellesTable.certificationStatut),
        isNotNull(parcellesTable.organismeCertificateur),
      ),
    )
    .groupBy(parcellesTable.organismeCertificateur);

  const certMap: Record<string, number> = {};
  for (const r of certRows) {
    const key = (r.organisme ?? "").toLowerCase();
    certMap[key] = r.nb;
  }
  const nbUtz       = certMap["utz"]                                       ?? 0;
  const nbRainforest= certMap["rainforest alliance"] ?? certMap["rainforest"] ?? 0;
  const nbFairtrade = certMap["fairtrade"]                                 ?? 0;
  const nbEudr      = conformite.nb_conformes;

  const [certMembresRow] = await db
    .select({ nb: sql<number>`count(distinct membre_id)::int` })
    .from(parcellesTable)
    .where(
      and(
        eq(parcellesTable.cooperativeId, cooperativeId),
        isNotNull(parcellesTable.certificationStatut),
      ),
    );
  const pctCertifies = pct(certMembresRow?.nb ?? 0, nbTotal);

  // ── 6. SUPERFICIES ─────────────────────────────────────────────────────────
  const [supRow] = await db
    .select({
      totale:    sql<string>`sum(coalesce(superficie_calculee_ha::numeric, superficie_declaree_ha::numeric, 0))`,
      certifiee: sql<string>`sum(CASE WHEN certification_statut IS NOT NULL THEN coalesce(superficie_calculee_ha::numeric, superficie_declaree_ha::numeric, 0) ELSE 0 END)`,
    })
    .from(parcellesTable)
    .where(and(eq(parcellesTable.cooperativeId, cooperativeId), eq(parcellesTable.actif, true)));

  const supTotale    = parseFloat(supRow?.totale    ?? "0") || 0;
  const supCertifiee = parseFloat(supRow?.certifiee ?? "0") || 0;
  const pctSupCert   = supTotale > 0 ? Math.round((supCertifiee / supTotale) * 100) : 0;

  // ── 7. FORMATIONS RSE ──────────────────────────────────────────────────────
  const [formRow] = await db
    .select({
      nbFormations:    sql<number>`count(*)::int`,
      nbBeneficiaires: sql<number>`coalesce(sum(nb_participants), 0)::int`,
      nbJours:         sql<number>`coalesce(sum(duree_jours)::int, 0)`,
    })
    .from(formationsRseTable)
    .where(
      and(
        eq(formationsRseTable.cooperativeId, cooperativeId),
        eq(formationsRseTable.campagneId, campagneId),
      ),
    );

  const themeRows = await db
    .select({ thematique: formationsRseTable.thematique })
    .from(formationsRseTable)
    .where(
      and(
        eq(formationsRseTable.cooperativeId, cooperativeId),
        eq(formationsRseTable.campagneId, campagneId),
      ),
    );
  const thematiquesFormation = [
    ...new Set(themeRows.map((t) => t.thematique).filter(Boolean)),
  ] as string[];

  // ── 8. ASSEMBLÉES GÉNÉRALES ────────────────────────────────────────────────
  const [agRow] = await db
    .select({
      nb:             sql<number>`count(*)::int`,
      totalConvoques: sql<string>`sum(nb_membres_convoques)`,
      totalPresents:  sql<string>`sum(nb_membres_presents)`,
    })
    .from(assembleesGeneralesTable)
    .where(
      and(
        eq(assembleesGeneralesTable.cooperativeId, cooperativeId),
        sql`extract(year from date_ag) = ${annee}`,
      ),
    );

  const nbAgTenues      = agRow?.nb ?? 0;
  const totalConv       = parseFloat(agRow?.totalConvoques ?? "0") || 0;
  const totalPres       = parseFloat(agRow?.totalPresents  ?? "0") || 0;
  const tauxParticipAg  = totalConv > 0 ? Math.round((totalPres / totalConv) * 100) : 0;

  // ── 9. TAUX REMBOURSEMENT AVANCES ─────────────────────────────────────────
  const [avRow] = await db
    .select({
      total:     sql<string>`sum(a.montant_octroye_fcfa)`,
      rembourse: sql<string>`sum(a.montant_rembourse_fcfa)`,
    })
    .from(avancesTable)
    .innerJoin(membresTable, eq(membresTable.id, avancesTable.membreId))
    .where(eq(membresTable.cooperativeId, cooperativeId));

  const montantTotal    = parseFloat(avRow?.total     ?? "0") || 0;
  const montantRembourse= parseFloat(avRow?.rembourse ?? "0") || 0;
  const tauxRembAv      = montantTotal > 0
    ? Math.round((montantRembourse / montantTotal) * 100)
    : null;

  // ── UPSERT indicateurs_rse ────────────────────────────────────────────────
  const values = {
    cooperativeId,
    campagneId,
    nbMembresTotal:            nbTotal,
    nbMembresFemmes:           nbFemmes,
    nbMembresJeunes:           nbJeunes,
    revenuMoyenMembreFcfa:     revenuMoyen  > 0 ? String(revenuMoyen)  : null,
    revenuMedianMembreFcfa:    revenuMedian > 0 ? String(revenuMedian) : null,
    revenuMinMembreFcfa:       revenuMin    > 0 ? String(revenuMin)    : null,
    revenuMaxMembreFcfa:       revenuMax    > 0 ? String(revenuMax)    : null,
    seuilPauvreteFcfa:         "750000",
    nbMembresSousSeuil:        nbSousSeuil,
    pctMembresSousSeuil:       revenus.length > 0
      ? String(pct(nbSousSeuil, revenus.length))
      : null,
    nbFormationsDispensees:    formRow?.nbFormations    ?? 0,
    nbBeneficiairesFormation:  formRow?.nbBeneficiaires ?? 0,
    thematiquesFormation,
    nbJoursFormation:          formRow?.nbJours         ?? 0,
    superficieTotaleHa:        String(supTotale),
    superficieCertifieeHa:     String(supCertifiee),
    pctSuperficieCertifiee:    String(pctSupCert),
    nbParcellesConformesEudr:  conformite.nb_conformes,
    pctConformiteEudr:         String(pctEudr),
    nbMembresCertifiesUtz:     nbUtz,
    nbMembresCertifiesRainforest: nbRainforest,
    nbMembresCertifiesFairtrade:  nbFairtrade,
    nbMembresCertifiesEudr:    nbEudr,
    pctMembresCertifies:       String(pctCertifies),
    prixMoyenPayeKgFcfa:       prixMoyenKg != null ? String(prixMoyenKg) : null,
    tauxRemboursementAvancesPct: tauxRembAv != null ? String(tauxRembAv) : null,
    nbAgTenues,
    tauxParticipationAgPct:    String(tauxParticipAg),
    dateCalcul:                new Date(),
    calculePar:                userId ?? null,
  } as const;

  // Upsert manuel — évite onConflictDoUpdate qui requiert une contrainte UNIQUE
  const [existing] = await db
    .select({ id: indicateursRseTable.id })
    .from(indicateursRseTable)
    .where(
      and(
        eq(indicateursRseTable.cooperativeId, cooperativeId),
        eq(indicateursRseTable.campagneId, campagneId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(indicateursRseTable)
      .set({ ...values, dateCalcul: new Date() })
      .where(eq(indicateursRseTable.id, existing.id));
  } else {
    await db.insert(indicateursRseTable).values({ ...values });
  }

  const [result] = await db
    .select()
    .from(indicateursRseTable)
    .where(
      and(
        eq(indicateursRseTable.cooperativeId, cooperativeId),
        eq(indicateursRseTable.campagneId, campagneId),
      ),
    )
    .limit(1);

  return result!;
}

// ── Indicateurs (lecture seule) ───────────────────────────────────────────────
export async function getIndicateurs(cooperativeId: number, campagneId: number) {
  const [row] = await db
    .select()
    .from(indicateursRseTable)
    .where(
      and(
        eq(indicateursRseTable.cooperativeId, cooperativeId),
        eq(indicateursRseTable.campagneId, campagneId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ── Comparaison multi-campagnes ────────────────────────────────────────────────
export async function getComparaison(cooperativeId: number) {
  const rows = await db
    .select({
      ind: indicateursRseTable,
      campagne: {
        libelle:    campagnesTable.libelle,
        anneeDebut: campagnesTable.anneeDebut,
      },
    })
    .from(indicateursRseTable)
    .innerJoin(campagnesTable, eq(campagnesTable.id, indicateursRseTable.campagneId))
    .where(eq(indicateursRseTable.cooperativeId, cooperativeId))
    .orderBy(campagnesTable.anneeDebut);

  return rows.map((r) => ({
    campagne:          r.campagne.libelle,
    annee:             r.campagne.anneeDebut,
    pctFemmes:         parseFloat(r.ind.pctFemmes ?? "0") || 0,
    pctConformiteEudr: parseFloat(r.ind.pctConformiteEudr ?? "0") || 0,
    pctCertifies:      parseFloat(r.ind.pctMembresCertifies ?? "0") || 0,
    revenuMoyen:       parseFloat(r.ind.revenuMoyenMembreFcfa ?? "0") || 0,
    tauxParticipAg:    parseFloat(r.ind.tauxParticipationAgPct ?? "0") || 0,
    nbFormations:      r.ind.nbFormationsDispensees ?? 0,
  }));
}

// ── Formations ────────────────────────────────────────────────────────────────
export async function getFormations(cooperativeId: number, campagneId?: number) {
  const conditions = campagneId
    ? and(
        eq(formationsRseTable.cooperativeId, cooperativeId),
        eq(formationsRseTable.campagneId, campagneId),
      )
    : eq(formationsRseTable.cooperativeId, cooperativeId);

  return db
    .select()
    .from(formationsRseTable)
    .where(conditions)
    .orderBy(formationsRseTable.dateFormation);
}

export async function creerFormation(
  cooperativeId: number,
  data: {
    campagneId?: number;
    titre?: string;
    thematique?: string;
    dateFormation?: string;
    lieu?: string;
    formateur?: string;
    nbParticipants?: number;
    nbFemmes?: number;
    dureeJours?: number;
    financement?: string;
  },
) {
  const [row] = await db
    .insert(formationsRseTable)
    .values({
      cooperativeId,
      campagneId:    data.campagneId ?? null,
      titre:         data.titre,
      thematique:    data.thematique,
      dateFormation: data.dateFormation,
      lieu:          data.lieu,
      formateur:     data.formateur,
      nbParticipants:data.nbParticipants,
      nbFemmes:      data.nbFemmes,
      dureeJours:    data.dureeJours != null ? String(data.dureeJours) : null,
      financement:   data.financement,
    })
    .returning();
  return row!;
}

// ── Enregistrer engagements ────────────────────────────────────────────────────
export async function enregistrerEngagements(
  cooperativeId: number,
  campagneId: number,
  engagements: string,
) {
  await db
    .update(indicateursRseTable)
    .set({ engagementsCampagneSuivante: engagements })
    .where(
      and(
        eq(indicateursRseTable.cooperativeId, cooperativeId),
        eq(indicateursRseTable.campagneId, campagneId),
      ),
    );
}

// ── Distribution des revenus pour histogramme ──────────────────────────────────
export async function getDistributionRevenus(cooperativeId: number, campagneId: number) {
  const idsCoop = (
    await db
      .select({ id: membresTable.id })
      .from(membresTable)
      .where(eq(membresTable.cooperativeId, cooperativeId))
  ).map((r) => r.id);

  const rows = await db
    .select({
      membreId: livraisonsTable.membreId,
      revenu:   sql<string>`sum(montant_net_fcfa)`,
    })
    .from(livraisonsTable)
    .where(eq(livraisonsTable.campagneId, campagneId))
    .groupBy(livraisonsTable.membreId);

  const idSet  = new Set(idsCoop);
  const values = rows
    .filter((r) => idSet.has(r.membreId))
    .map((r) => Math.round(Number(r.revenu)));

  if (values.length === 0) return [];

  const SEUIL = 750_000;
  const bins = [
    { label: "< 200k",      min: 0,         max: 200_000   },
    { label: "200–400k",    min: 200_000,   max: 400_000   },
    { label: "400–600k",    min: 400_000,   max: 600_000   },
    { label: "600–750k",    min: 600_000,   max: 750_000   },
    { label: "750k–1M",     min: 750_000,   max: 1_000_000 },
    { label: "1M–1,5M",     min: 1_000_000, max: 1_500_000 },
    { label: "> 1,5M",      min: 1_500_000, max: Infinity   },
  ];

  return bins.map((b) => ({
    tranche:       b.label,
    nb:            values.filter((v) => v >= b.min && v < b.max).length,
    sousSeuil:     b.max <= SEUIL,
  }));
}
