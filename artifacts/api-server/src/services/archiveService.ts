import { createHash } from "crypto";
import { db } from "@workspace/db";
import {
  campagnesTable,
  bilansCampagneTable,
  archivesCampagnesTable,
  archiveLivraisonsTable,
  archiveMembreSnapshotTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Types internes ───────────────────────────────────────────────────────────

interface RowMembresStats { [key: string]: unknown; total: string; femmes: string; certifies: string }
interface RowLotsStats { [key: string]: unknown; total: string; vendus: string; refoules: string; tonnage_refoule: string }
interface RowParcellesStats { [key: string]: unknown; total: string; conformes: string }
interface RowLivraison {
  [key: string]: unknown;
  livraison_id: number; fournisseur_id: number; fournisseur_nom: string;
  fournisseur_type: string; poids_net_kg: string; prix_unitaire_fcfa: number;
  montant_brut_fcfa: number; avance_deduite_fcfa: number; montant_net_fcfa: number;
  date_livraison: string; delegue_nom: string; zone: string; created_at: Date;
}
interface RowMembreSnapshot {
  [key: string]: unknown;
  membre_id: number; nom: string; prenoms: string; village: string; section: string;
  delegue_nom: string; tonnage_livre_kg: string; montant_percu_fcfa: string;
  nb_livraisons: number; certifie: boolean; score_global: string; niveau: string;
}

// ─── Archivage complet d'une campagne ────────────────────────────────────────

export async function archiverCampagne(
  cooperativeId: number,
  campagneId: number,
  userId: number,
): Promise<void> {
  const campagne = await db.query.campagnesTable.findFirst({
    where: and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)),
  });
  if (!campagne) throw new Error("Campagne introuvable");

  // Supprimer un éventuel archive partiel existant (re-archivage)
  const existingArchive = await db.query.archivesCampagnesTable.findFirst({
    where: and(
      eq(archivesCampagnesTable.campagneId, campagneId),
      eq(archivesCampagnesTable.cooperativeId, cooperativeId),
    ),
  });
  if (existingArchive) {
    await db.delete(archiveLivraisonsTable).where(
      and(eq(archiveLivraisonsTable.campagneId, campagneId), eq(archiveLivraisonsTable.cooperativeId, cooperativeId)),
    );
    await db.delete(archiveMembreSnapshotTable).where(
      and(eq(archiveMembreSnapshotTable.campagneId, campagneId), eq(archiveMembreSnapshotTable.cooperativeId, cooperativeId)),
    );
    await db.delete(archivesCampagnesTable).where(
      and(eq(archivesCampagnesTable.campagneId, campagneId), eq(archivesCampagnesTable.cooperativeId, cooperativeId)),
    );
  }

  // ── ÉTAPE 1 : Snapshot KPIs ───────────────────────────────────────────────
  const bilan = await db.query.bilansCampagneTable.findFirst({
    where: and(
      eq(bilansCampagneTable.campagneId, campagneId),
      eq(bilansCampagneTable.cooperativeId, cooperativeId),
    ),
  });

  const membresRes = await db.execute<RowMembresStats>(sql`
    SELECT
      COUNT(*)                                                         AS total,
      COUNT(*) FILTER (WHERE sexe = 'F')                              AS femmes,
      COUNT(*) FILTER (WHERE certification IS NOT NULL AND certification <> '') AS certifies
    FROM membres WHERE cooperative_id = ${cooperativeId}
  `);
  const membresStats = membresRes.rows[0];

  const lotsRes = await db.execute<RowLotsStats>(sql`
    SELECT
      COUNT(*)                                           AS total,
      COUNT(*) FILTER (WHERE statut = 'vendu')           AS vendus,
      COUNT(*) FILTER (WHERE statut = 'refoule')         AS refoules,
      COALESCE(SUM(poids_total_kg) FILTER (WHERE statut = 'refoule'), 0) AS tonnage_refoule
    FROM lots WHERE cooperative_id = ${cooperativeId} AND campagne_id = ${campagneId}
  `);
  const lotsStats = lotsRes.rows[0];

  const parcellesRes = await db.execute<RowParcellesStats>(sql`
    SELECT
      COUNT(*)                                                         AS total,
      COUNT(*) FILTER (WHERE p.eudr_statut = 'conforme')              AS conformes
    FROM parcelles p
    INNER JOIN membres m ON m.id = p.membre_id
    WHERE m.cooperative_id = ${cooperativeId}
  `);
  const parcellesStats = parcellesRes.rows[0];

  const totalParcelles = parseInt(String(parcellesStats?.total ?? "0"));
  const parcellesConformes = parseInt(String(parcellesStats?.conformes ?? "0"));
  const pctEudr = totalParcelles > 0 ? (parcellesConformes / totalParcelles) * 100 : 0;

  const dateOuverture = campagne.dateOuverture;
  const dateCloture = campagne.dateFermeture ?? new Date().toISOString().slice(0, 10);
  const dureeJours = Math.round(
    (new Date(dateCloture).getTime() - new Date(dateOuverture).getTime()) / 86_400_000,
  );

  const [archive] = await db.insert(archivesCampagnesTable).values({
    cooperativeId,
    campagneId,
    tonnageTotalKg:              bilan?.tonnageTotalKg              ?? "0",
    tonnageMembresKg:            bilan?.tonnageMembresKg            ?? "0",
    tonnagePisteursKg:           bilan?.tonnagePisteursKg           ?? "0",
    tonnageExternesKg:           bilan?.tonnageExternesKg           ?? "0",
    nbLivraisons:                bilan?.nbLivraisons                ?? 0,
    nbMembresActifs:             bilan?.nbMembresActifs             ?? 0,
    nbFournisseursTotal:         bilan?.nbFournisseursTotal         ?? 0,
    prixAchatMoyenKgFcfa:        bilan?.prixAchatMoyenKgFcfa        ?? "0",
    prixVenteMoyenKgFcfa:        bilan?.prixVenteMoyenKgFcfa        ?? "0",
    caVentesFcfa:                bilan?.caVentesFcfa                ?? "0",
    coutAchatsFcfa:              bilan?.coutAchatTotalFcfa          ?? "0",
    chargesExploitationFcfa:     bilan?.chargesExploitationFcfa     ?? "0",
    chargesPersonnelFcfa:        bilan?.chargesPersonnelFcfa        ?? "0",
    margeBruteFcfa:              bilan?.margeBruteFcfa              ?? "0",
    margeNetteFcfa:              bilan?.margeNetteFcfa              ?? "0",
    margeKgFcfa:                 bilan?.margeKgFcfa                 ?? "0",
    nbMembresTotal:              parseInt(String(membresStats?.total    ?? "0")),
    nbMembresFemmes:             parseInt(String(membresStats?.femmes   ?? "0")),
    nbMembresCertifies:          parseInt(String(membresStats?.certifies ?? "0")),
    partsSocialesCollecteesFcfa: bilan?.partsSocialesCollecteesFcfa ?? "0",
    avancesOctroYeesFcfa:        bilan?.avancesOctroYeesFcfa        ?? "0",
    avancesRembouRseesFcfa:      bilan?.avancesRembouRseesFcfa      ?? "0",
    intrantsDistribuEsFcfa:      bilan?.intrantsDistribuEsFcfa      ?? "0",
    nbLotsTotal:                 parseInt(String(lotsStats?.total          ?? "0")),
    nbLotsVendus:                parseInt(String(lotsStats?.vendus         ?? "0")),
    nbLotsRefoules:              parseInt(String(lotsStats?.refoules       ?? "0")),
    tonnageRefouleKg:            String(lotsStats?.tonnage_refoule  ?? "0"),
    nbParcellesGps:              totalParcelles,
    pctConformiteEudr:           String(Math.round(pctEudr * 100) / 100),
    dateOuverture,
    dateCloture,
    dureeJours,
    archivePar:                  userId,
    versionCoopdigital:          "1.0",
  }).returning();

  // ── ÉTAPE 2 : Snapshot livraisons ─────────────────────────────────────────
  const livraisonsRes = await db.execute<RowLivraison>(sql`
    SELECT
      l.id                                                                    AS livraison_id,
      l.membre_id                                                             AS fournisseur_id,
      TRIM(COALESCE(m.nom,'') || ' ' || COALESCE(m.prenoms,''))              AS fournisseur_nom,
      COALESCE(l.type_fournisseur, 'membre')                                  AS fournisseur_type,
      l.poids_net_kg,
      l.prix_unitaire_fcfa,
      l.montant_brut_fcfa,
      l.avance_deduite_fcfa,
      l.montant_net_fcfa,
      l.date_livraison,
      TRIM(COALESCE(u.nom,'') || ' ' || COALESCE(u.prenoms,''))              AS delegue_nom,
      COALESCE(m.zone_nom, m.section, l.section_livraison, '')               AS zone,
      l.created_at
    FROM livraisons l
    LEFT JOIN membres m ON m.id = l.membre_id
    LEFT JOIN users u   ON u.id = l.agent_id
    WHERE l.campagne_id = ${campagneId}
    ORDER BY l.date_livraison
  `);

  const livraisonRows = livraisonsRes.rows;
  if (livraisonRows.length > 0) {
    const toInsert = livraisonRows.map(r => ({
      cooperativeId,
      campagneId,
      livraisonId:      r.livraison_id,
      fournisseurId:    r.fournisseur_id,
      fournisseurNom:   r.fournisseur_nom,
      fournisseurType:  r.fournisseur_type,
      poidsNetKg:       String(r.poids_net_kg),
      prixUnitaireFcfa: r.prix_unitaire_fcfa,
      montantBrutFcfa:  r.montant_brut_fcfa,
      avanceDeduiteFcfa:r.avance_deduite_fcfa,
      montantNetFcfa:   r.montant_net_fcfa,
      dateLivraison:    String(r.date_livraison),
      delegueNom:       r.delegue_nom,
      zone:             r.zone,
      createdAt:        r.created_at,
    }));
    for (let i = 0; i < toInsert.length; i += 500) {
      await db.insert(archiveLivraisonsTable).values(toInsert.slice(i, i + 500));
    }
  }

  // ── ÉTAPE 3 : Snapshot membres ────────────────────────────────────────────
  const membresSnapRes = await db.execute<RowMembreSnapshot>(sql`
    SELECT
      m.id                                                                    AS membre_id,
      m.nom,
      COALESCE(m.prenoms,'')                                                  AS prenoms,
      COALESCE(m.village,'')                                                  AS village,
      COALESCE(m.section,'')                                                  AS section,
      TRIM(COALESCE(u.nom,'') || ' ' || COALESCE(u.prenoms,''))              AS delegue_nom,
      COALESCE(SUM(l.poids_net_kg), 0)                                        AS tonnage_livre_kg,
      COALESCE(SUM(l.montant_net_fcfa), 0)                                    AS montant_percu_fcfa,
      COUNT(DISTINCT l.id)::integer                                           AS nb_livraisons,
      (m.certification IS NOT NULL AND m.certification <> '')                 AS certifie,
      sc.score_global,
      sc.niveau
    FROM membres m
    LEFT JOIN livraisons l         ON l.membre_id = m.id AND l.campagne_id = ${campagneId}
    LEFT JOIN users u              ON u.id = m.delegue_id
    LEFT JOIN scores_membres sc    ON sc.membre_id = m.id AND sc.campagne_id = ${campagneId}
    WHERE m.cooperative_id = ${cooperativeId}
    GROUP BY m.id, m.nom, m.prenoms, m.village, m.section, u.nom, u.prenoms, sc.score_global, sc.niveau
    ORDER BY tonnage_livre_kg DESC
  `);

  const snapshotRows = membresSnapRes.rows;
  if (snapshotRows.length > 0) {
    const toInsert = snapshotRows.map(r => ({
      cooperativeId,
      campagneId,
      membreId:          r.membre_id,
      nom:               r.nom,
      prenoms:           r.prenoms,
      village:           r.village,
      section:           r.section,
      delegueNom:        r.delegue_nom,
      tonnageLivreKg:    String(r.tonnage_livre_kg),
      montantPercuFcfa:  Math.round(Number(r.montant_percu_fcfa)),
      avancesRecuesFcfa: 0,
      nbLivraisons:      r.nb_livraisons,
      certifie:          Boolean(r.certifie),
      actifCetteCampagne:r.nb_livraisons > 0,
      scoreCampagne:     r.score_global ? String(r.score_global) : null,
      niveauCampagne:    r.niveau ?? null,
    }));
    for (let i = 0; i < toInsert.length; i += 500) {
      await db.insert(archiveMembreSnapshotTable).values(toInsert.slice(i, i + 500));
    }
  }

  // ── ÉTAPE 5 : Checksum SHA-256 ────────────────────────────────────────────
  const dataToHash = JSON.stringify({
    campagneId,
    cooperativeId,
    tonnageTotalKg:     bilan?.tonnageTotalKg,
    caVentesFcfa:       bilan?.caVentesFcfa,
    nbLivraisons:       bilan?.nbLivraisons,
    nbLivraisonsArchive:livraisonRows.length,
    nbMembresSnapshot:  snapshotRows.length,
    dateArchivage:      new Date().toISOString(),
  });
  const checksum = createHash("sha256").update(dataToHash).digest("hex");

  await db.update(archivesCampagnesTable)
    .set({ checksum })
    .where(eq(archivesCampagnesTable.id, archive!.id));

  // ── ÉTAPE 6 : Verrouiller la campagne ─────────────────────────────────────
  await db.update(campagnesTable)
    .set({ statut: "archivee" })
    .where(and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)));

  logger.info(
    { campagneId, cooperativeId, userId, checksum, nbLivraisons: livraisonRows.length, nbMembres: snapshotRows.length },
    "Campagne archivée avec succès",
  );
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

export async function getArchivesCampagnes(cooperativeId: number) {
  const archives = await db.query.archivesCampagnesTable.findMany({
    where: eq(archivesCampagnesTable.cooperativeId, cooperativeId),
    orderBy: (t, { desc }) => [desc(t.dateOuverture)],
  });

  const campagnes = await db.query.campagnesTable.findMany({
    where: eq(campagnesTable.cooperativeId, cooperativeId),
  });

  return archives.map(a => ({
    ...a,
    campagne: campagnes.find(c => c.id === a.campagneId) ?? null,
  }));
}

export async function getArchiveCampagne(cooperativeId: number, campagneId: number) {
  const archive = await db.query.archivesCampagnesTable.findFirst({
    where: and(
      eq(archivesCampagnesTable.cooperativeId, cooperativeId),
      eq(archivesCampagnesTable.campagneId, campagneId),
    ),
  });
  if (!archive) throw new Error("Archive introuvable");

  const campagne = await db.query.campagnesTable.findFirst({
    where: eq(campagnesTable.id, campagneId),
  });

  return { ...archive, campagne };
}

export async function getArchiveLivraisons(
  cooperativeId: number,
  campagneId: number,
  opts: { search?: string; zone?: string; delegue?: string; offset?: number; limit?: number } = {},
) {
  const { search, zone, delegue, offset = 0, limit = 50 } = opts;

  const rows = await db.execute<{
    id: number; fournisseur_nom: string; fournisseur_type: string;
    poids_net_kg: string; prix_unitaire_fcfa: number; montant_net_fcfa: number;
    date_livraison: string; delegue_nom: string; zone: string; total: string;
  }>(sql`
    SELECT *, COUNT(*) OVER() AS total
    FROM archive_livraisons
    WHERE cooperative_id = ${cooperativeId}
      AND campagne_id    = ${campagneId}
      ${search ? sql`AND fournisseur_nom ILIKE ${'%' + search + '%'}` : sql``}
      ${zone ? sql`AND zone ILIKE ${'%' + zone + '%'}` : sql``}
      ${delegue ? sql`AND delegue_nom ILIKE ${'%' + delegue + '%'}` : sql``}
    ORDER BY date_livraison DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const total = parseInt(String(rows.rows[0]?.total ?? "0"));
  return { livraisons: rows.rows, total, offset, limit };
}

export async function getArchiveMembres(
  cooperativeId: number,
  campagneId: number,
  opts: { search?: string; zone?: string; actif?: boolean; offset?: number; limit?: number } = {},
) {
  const { search, zone, actif, offset = 0, limit = 50 } = opts;

  const rows = await db.execute<{
    id: number; nom: string; prenoms: string; village: string; section: string;
    delegue_nom: string; tonnage_livre_kg: string; montant_percu_fcfa: number;
    score_campagne: string; niveau_campagne: string; nb_livraisons: number;
    certifie: boolean; actif_cette_campagne: boolean; total: string;
  }>(sql`
    SELECT *, COUNT(*) OVER() AS total
    FROM archive_membres_snapshot
    WHERE cooperative_id = ${cooperativeId}
      AND campagne_id    = ${campagneId}
      ${search ? sql`AND (nom ILIKE ${'%' + search + '%'} OR prenoms ILIKE ${'%' + search + '%'})` : sql``}
      ${zone   ? sql`AND (section ILIKE ${'%' + zone + '%'}   OR village ILIKE ${'%' + zone + '%'})` : sql``}
      ${actif !== undefined ? sql`AND actif_cette_campagne = ${actif}` : sql``}
    ORDER BY tonnage_livre_kg DESC NULLS LAST
    LIMIT ${limit} OFFSET ${offset}
  `);

  const total = parseInt(String(rows.rows[0]?.total ?? "0"));
  return { membres: rows.rows, total, offset, limit };
}

export async function comparerCampagnes(cooperativeId: number, campagneIds: number[]) {
  if (campagneIds.length === 0) {
    const all = await db.query.archivesCampagnesTable.findMany({
      where: eq(archivesCampagnesTable.cooperativeId, cooperativeId),
      orderBy: (t, { desc }) => [desc(t.dateOuverture)],
      limit: 5,
    });
    campagneIds = all.map(a => a.campagneId);
  }

  if (campagneIds.length === 0) return [];

  const archives = await db.query.archivesCampagnesTable.findMany({
    where: eq(archivesCampagnesTable.cooperativeId, cooperativeId),
  });

  const campagnes = await db.query.campagnesTable.findMany({
    where: eq(campagnesTable.cooperativeId, cooperativeId),
    orderBy: (t, { asc }) => [asc(t.anneeDebut)],
  });

  return campagneIds.map(id => ({
    campagne: campagnes.find(c => c.id === id) ?? null,
    archive: archives.find(a => a.campagneId === id) ?? null,
  }));
}

export async function verifierIntegrite(cooperativeId: number, campagneId: number) {
  const archive = await db.query.archivesCampagnesTable.findFirst({
    where: and(
      eq(archivesCampagnesTable.cooperativeId, cooperativeId),
      eq(archivesCampagnesTable.campagneId, campagneId),
    ),
  });
  if (!archive) throw new Error("Archive introuvable");

  const [nbLiv] = (await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count FROM archive_livraisons
    WHERE cooperative_id = ${cooperativeId} AND campagne_id = ${campagneId}
  `)).rows;
  const [nbMbr] = (await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count FROM archive_membres_snapshot
    WHERE cooperative_id = ${cooperativeId} AND campagne_id = ${campagneId}
  `)).rows;

  const dataToHash = JSON.stringify({
    campagneId,
    cooperativeId,
    tonnageTotalKg:      archive.tonnageTotalKg,
    caVentesFcfa:        archive.caVentesFcfa,
    nbLivraisons:        archive.nbLivraisons,
    nbLivraisonsArchive: parseInt(String(nbLiv?.count ?? "0")),
    nbMembresSnapshot:   parseInt(String(nbMbr?.count ?? "0")),
    dateArchivage:       archive.dateArchivage?.toISOString?.() ?? "",
  });

  const checksumRecalcule = createHash("sha256").update(dataToHash).digest("hex");
  const integre = checksumRecalcule === archive.checksum;

  return {
    integre,
    checksumStocke:    archive.checksum,
    checksumRecalcule,
    dateArchivage:     archive.dateArchivage,
    archivePar:        archive.archivePar,
  };
}
