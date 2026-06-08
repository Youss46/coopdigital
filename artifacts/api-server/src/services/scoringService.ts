import { db } from "@workspace/db";
import {
  scoresMembreTable, configScoringTable,
} from "@workspace/db/schema";
import {
  livraisonsTable, avancesTable, distributionsIntrantsTable,
  cotisationsTable, membresTable, campagnesTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { logger } from "../lib/logger";



// ─── Helpers ──────────────────────────────────────────────────────────────────
function attribuerNiveau(score: number, seuils: {
  seuilPlatine: number; seuilOr: number; seuilArgent: number; seuilBronze: number;
}): string {
  if (score >= seuils.seuilPlatine) return "platine";
  if (score >= seuils.seuilOr)      return "or";
  if (score >= seuils.seuilArgent)  return "argent";
  if (score >= seuils.seuilBronze)  return "bronze";
  return "non_classe";
}

// ─── Config ───────────────────────────────────────────────────────────────────
export async function getConfig(cooperativeId: number) {
  const rows = await db.select().from(configScoringTable)
    .where(eq(configScoringTable.cooperativeId, cooperativeId)).limit(1);
  return rows[0] ?? null;
}

export async function updateConfig(cooperativeId: number, data: Partial<{
  poidsVolumePct: number; poidsQualitePct: number; poidsRegularitePct: number;
  poidsRemboursementPct: number; poidsFidelitePct: number; poidsCotisationPct: number;
  seuilBronze: number; seuilArgent: number; seuilOr: number; seuilPlatine: number;
  avantagesBronze: string; avantagesArgent: string; avantagesOr: string; avantagesPlatine: string;
}>) {
  const toStr = (v: number | undefined) => v != null ? String(v) : undefined;
  const vals = {
    cooperativeId:          cooperativeId,
    poidsVolumePct:         toStr(data.poidsVolumePct),
    poidsQualitePct:        toStr(data.poidsQualitePct),
    poidsRegularitePct:     toStr(data.poidsRegularitePct),
    poidsRemboursementPct:  toStr(data.poidsRemboursementPct),
    poidsFidelitePct:       toStr(data.poidsFidelitePct),
    poidsCotisationPct:     toStr(data.poidsCotisationPct),
    seuilBronze:            toStr(data.seuilBronze),
    seuilArgent:            toStr(data.seuilArgent),
    seuilOr:                toStr(data.seuilOr),
    seuilPlatine:           toStr(data.seuilPlatine),
    avantagesBronze:        data.avantagesBronze,
    avantagesArgent:        data.avantagesArgent,
    avantagesOr:            data.avantagesOr,
    avantagesPlatine:       data.avantagesPlatine,
  };
  const rows = await db.insert(configScoringTable).values(vals)
    .onConflictDoUpdate({
      target: configScoringTable.cooperativeId,
      set: { ...vals, updatedAt: sql`now()` },
    })
    .returning();
  return rows[0];
}

// ─── Config par défaut ────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  poidsVolumePct: "30", poidsQualitePct: "25", poidsRegularitePct: "20",
  poidsRemboursementPct: "15", poidsFidelitePct: "5", poidsCotisationPct: "5",
  seuilBronze: "40", seuilArgent: "60", seuilOr: "75", seuilPlatine: "90",
  avantagesBronze: "", avantagesArgent: "", avantagesOr: "", avantagesPlatine: "",
};

async function getOrCreateConfig(cooperativeId: number) {
  const existing = await getConfig(cooperativeId);
  if (existing) return existing;
  const rows = await db.insert(configScoringTable)
    .values({ cooperativeId, ...DEFAULT_CONFIG })
    .returning();
  return rows[0];
}

// ─── Calculer score individuel ────────────────────────────────────────────────
export async function calculerScore(cooperativeId: number, membreId: number, campagneId: number) {
  const cfg = await getOrCreateConfig(cooperativeId);
  if (!cfg) throw new Error("config_scoring introuvable");

  const seuils = {
    seuilPlatine: Number(cfg.seuilPlatine),
    seuilOr:      Number(cfg.seuilOr),
    seuilArgent:  Number(cfg.seuilArgent),
    seuilBronze:  Number(cfg.seuilBronze),
  };

  // 1. Campagne — durée en semaines
  const campRow = await db.select({
    dateOuverture: campagnesTable.dateOuverture,
    dateFermeture: campagnesTable.dateFermeture,
  }).from(campagnesTable).where(eq(campagnesTable.id, campagneId)).limit(1);
  const camp = campRow[0];
  if (!camp) throw new Error("Campagne introuvable");

  const dateFin = camp.dateFermeture ?? new Date().toISOString().slice(0, 10);
  const dateDebut = camp.dateOuverture;
  const semaines = Math.max(
    1,
    Math.ceil(
      (new Date(dateFin).getTime() - new Date(dateDebut).getTime()) /
      (7 * 86400 * 1000),
    ),
  );

  // Condition d'appartenance d'une livraison à la campagne :
  // soit campagne_id correspond, soit campagne_id est NULL et la date est dans la période
  // (gère le cas de livraisons enregistrées avant la création de la campagne)

  // 2. Score Volume — tonnage membre vs moyenne coop
  const volRows = await db.execute<{ tonnage_membre: string; tonnage_moyen: string }>(sql`
    SELECT
      COALESCE(SUM(CASE WHEN l.membre_id = ${membreId} THEN COALESCE(l.poids_net_kg, l.poids_kg) ELSE 0 END), 0) AS tonnage_membre,
      COALESCE(
        (SELECT AVG(t.s) FROM (
          SELECT SUM(COALESCE(l2.poids_net_kg, l2.poids_kg)) AS s
          FROM livraisons l2
          WHERE (l2.campagne_id = ${campagneId}
                 OR (l2.campagne_id IS NULL AND l2.date_livraison >= ${dateDebut}::date AND l2.date_livraison <= ${dateFin}::date))
          GROUP BY l2.membre_id
        ) t), 1
      ) AS tonnage_moyen
    FROM livraisons l
    WHERE (l.campagne_id = ${campagneId}
           OR (l.campagne_id IS NULL AND l.date_livraison >= ${dateDebut}::date AND l.date_livraison <= ${dateFin}::date))
  `);
  const vol = volRows.rows[0];
  const scoreVolume = Math.min(100,
    (Number(vol.tonnage_moyen) > 0)
      ? (Number(vol.tonnage_membre) / Number(vol.tonnage_moyen)) * 100
      : 0,
  );

  // 3. Score Qualité — poids_net / produit_brut
  const qualRows = await db.execute<{ poids_net: string; poids_brut: string }>(sql`
    SELECT
      COALESCE(SUM(COALESCE(l.poids_net_kg, l.poids_kg)), 0) AS poids_net,
      COALESCE(SUM(COALESCE(l.produit_brut_kg, l.poids_kg)), 0) AS poids_brut
    FROM livraisons l
    WHERE l.membre_id = ${membreId}
      AND (l.campagne_id = ${campagneId}
           OR (l.campagne_id IS NULL AND l.date_livraison >= ${dateDebut}::date AND l.date_livraison <= ${dateFin}::date))
  `);
  const qual = qualRows.rows[0];
  const scoreQualite = (Number(qual.poids_brut) > 0)
    ? Math.min(100, (Number(qual.poids_net) / Number(qual.poids_brut)) * 100)
    : 100;

  // 4. Score Régularité — semaines actives
  const regRows = await db.execute<{ semaines_actives: string }>(sql`
    SELECT COUNT(DISTINCT DATE_TRUNC('week', l.date_livraison::date)) AS semaines_actives
    FROM livraisons l
    WHERE l.membre_id = ${membreId}
      AND (l.campagne_id = ${campagneId}
           OR (l.campagne_id IS NULL AND l.date_livraison >= ${dateDebut}::date AND l.date_livraison <= ${dateFin}::date))
  `);
  const semainesActives = Number(regRows.rows[0]?.semaines_actives ?? 0);
  const scoreRegularite = Math.min(100, (semainesActives / semaines) * 100);

  // 5. Score Remboursement — avances + intrants
  const avRows = await db.execute<{ total_octroye: string; total_rembourse: string }>(sql`
    SELECT
      COALESCE(SUM(a.montant_octroye_fcfa), 0)    AS total_octroye,
      COALESCE(SUM(a.montant_rembourse_fcfa), 0)  AS total_rembourse
    FROM avances a
    WHERE a.membre_id = ${membreId}
  `);
  const av = avRows.rows[0];

  const inRows = await db.execute<{ total_du: string; total_rembourse: string }>(sql`
    SELECT
      COALESCE(SUM(di.montant_membre_fcfa), 0)      AS total_du,
      COALESCE(SUM(di.montant_rembourse_fcfa), 0)   AS total_rembourse
    FROM distributions_intrants di
    WHERE di.membre_id = ${membreId} AND di.campagne_id = ${campagneId}
  `);
  const intr = inRows.rows[0];

  const totalDu = Number(av.total_octroye) + Number(intr.total_du);
  const totalRemb = Number(av.total_rembourse) + Number(intr.total_rembourse);
  const scoreRemboursement = (totalDu === 0) ? 100 : Math.min(100, (totalRemb / totalDu) * 100);

  // 6. Score Fidélité — campagnes avec au moins 1 livraison
  const fidRows = await db.execute<{ nb_campagnes: string }>(sql`
    SELECT COUNT(DISTINCT l.campagne_id) AS nb_campagnes
    FROM livraisons l
    WHERE l.membre_id = ${membreId} AND l.campagne_id IS NOT NULL
  `);
  const nbCampagnes = Number(fidRows.rows[0]?.nb_campagnes ?? 0);
  const scoreFidelite = Math.min(100, nbCampagnes * 20);

  // 7. Score Cotisation — cotisation payée pour l'année en cours
  const annee = new Date().getFullYear();
  const cotRows = await db.execute<{ a_jour: string }>(sql`
    SELECT COUNT(*) AS a_jour
    FROM cotisations c
    WHERE c.membre_id = ${membreId} AND c.annee = ${annee} AND c.statut_paiement = 'paye'
  `);
  const scoreCotisation = (Number(cotRows.rows[0]?.a_jour ?? 0) > 0) ? 100 : 0;

  // Score global pondéré
  const p = {
    volume:         Number(cfg.poidsVolumePct) / 100,
    qualite:        Number(cfg.poidsQualitePct) / 100,
    regularite:     Number(cfg.poidsRegularitePct) / 100,
    remboursement:  Number(cfg.poidsRemboursementPct) / 100,
    fidelite:       Number(cfg.poidsFidelitePct) / 100,
    cotisation:     Number(cfg.poidsCotisationPct) / 100,
  };
  const scoreGlobal = Math.round(
    (scoreVolume        * p.volume)
    + (scoreQualite     * p.qualite)
    + (scoreRegularite  * p.regularite)
    + (scoreRemboursement * p.remboursement)
    + (scoreFidelite    * p.fidelite)
    + (scoreCotisation  * p.cotisation),
  );

  const niveau = attribuerNiveau(scoreGlobal, seuils);

  // Upsert dans scores_membres
  const rows = await db.insert(scoresMembreTable).values({
    cooperativeId:      cooperativeId,
    membreId,
    campagneId,
    scoreVolume:        String(Math.round(scoreVolume * 100) / 100),
    scoreQualite:       String(Math.round(scoreQualite * 100) / 100),
    scoreRegularite:    String(Math.round(scoreRegularite * 100) / 100),
    scoreRemboursement: String(Math.round(scoreRemboursement * 100) / 100),
    scoreFidelite:      String(scoreFidelite),
    scoreCotisation:    String(scoreCotisation),
    scoreGlobal:        String(scoreGlobal),
    niveau,
    dateCalcul:         new Date(),
  }).onConflictDoUpdate({
    target: [scoresMembreTable.cooperativeId, scoresMembreTable.membreId, scoresMembreTable.campagneId],
    set: {
      scoreVolume:        String(Math.round(scoreVolume * 100) / 100),
      scoreQualite:       String(Math.round(scoreQualite * 100) / 100),
      scoreRegularite:    String(Math.round(scoreRegularite * 100) / 100),
      scoreRemboursement: String(Math.round(scoreRemboursement * 100) / 100),
      scoreFidelite:      String(scoreFidelite),
      scoreCotisation:    String(scoreCotisation),
      scoreGlobal:        String(scoreGlobal),
      niveau,
      dateCalcul:         sql`now()`,
    },
  }).returning();

  return rows[0];
}

// ─── Recalculer tous les membres d'une campagne ───────────────────────────────
export async function recalculerTous(cooperativeId: number, campagneId: number) {
  // Récupérer les dates de la campagne pour le fallback date-range
  const campRow = await db.select({
    dateOuverture: campagnesTable.dateOuverture,
    dateFermeture: campagnesTable.dateFermeture,
  }).from(campagnesTable).where(eq(campagnesTable.id, campagneId)).limit(1);
  const camp = campRow[0];
  if (!camp) return { calculés: 0, campagneId };

  const dateDebut = camp.dateOuverture;
  const dateFin = camp.dateFermeture ?? new Date().toISOString().slice(0, 10);

  // Membres actifs ayant au moins 1 livraison dans la campagne
  // Inclut les livraisons sans campagne_id dont la date tombe dans la période
  const membres = await db.execute<{ membre_id: number }>(sql`
    SELECT DISTINCT l.membre_id
    FROM livraisons l
    INNER JOIN membres m ON m.id = l.membre_id
    WHERE (l.campagne_id = ${campagneId}
           OR (l.campagne_id IS NULL AND l.date_livraison >= ${dateDebut}::date AND l.date_livraison <= ${dateFin}::date))
      AND m.cooperative_id = ${cooperativeId}
      AND m.statut = 'actif'
  `);

  let calculés = 0;
  for (const row of membres.rows) {
    try {
      await calculerScore(cooperativeId, row.membre_id, campagneId);
      calculés++;
    } catch (err) {
      logger.warn({ err, membre_id: row.membre_id }, "Erreur calcul score membre");
    }
  }

  // Mise à jour des rangs
  await db.execute(sql`
    UPDATE scores_membres sm
    SET rang = r.rang
    FROM (
      SELECT id, RANK() OVER (PARTITION BY campagne_id ORDER BY score_global DESC) AS rang
      FROM scores_membres
      WHERE campagne_id = ${campagneId} AND cooperative_id = ${cooperativeId}
    ) r
    WHERE sm.id = r.id
  `);

  return { calculés, campagneId };
}

// ─── Classement complet d'une campagne ───────────────────────────────────────
export async function getClassementCampagne(cooperativeId: number, campagneId: number) {
  const rows = await db.execute<{
    id: number; membre_id: number; score_global: string; niveau: string; rang: number;
    score_volume: string; score_qualite: string; score_regularite: string;
    score_remboursement: string; score_fidelite: string; score_cotisation: string;
    date_calcul: string;
    nom: string; prenoms: string; village: string | null; groupement: string | null;
    section: string | null; photo_url: string | null;
    tonnage: string;
  }>(sql`
    SELECT
      sm.id, sm.membre_id, sm.score_global, sm.niveau, sm.rang,
      sm.score_volume, sm.score_qualite, sm.score_regularite,
      sm.score_remboursement, sm.score_fidelite, sm.score_cotisation,
      sm.date_calcul,
      m.nom, m.prenoms, m.village, m.groupement, m.section, m.photo_url,
      COALESCE(SUM(l.poids_net_kg), 0) AS tonnage
    FROM scores_membres sm
    INNER JOIN membres m ON m.id = sm.membre_id
    LEFT JOIN livraisons l ON l.membre_id = sm.membre_id AND l.campagne_id = ${campagneId}
    WHERE sm.campagne_id = ${campagneId} AND sm.cooperative_id = ${cooperativeId}
    GROUP BY sm.id, m.id
    ORDER BY sm.rang ASC NULLS LAST, sm.score_global DESC
  `);
  return rows.rows;
}

// ─── Score détaillé d'un membre ───────────────────────────────────────────────
export async function getScoreMembre(cooperativeId: number, membreId: number) {
  const rows = await db.execute<{
    id: number; campagne_id: number; score_global: string; niveau: string; rang: number;
    score_volume: string; score_qualite: string; score_regularite: string;
    score_remboursement: string; score_fidelite: string; score_cotisation: string;
    date_calcul: string;
    nom_campagne: string;
  }>(sql`
    SELECT
      sm.*,
      CONCAT(c.annee_debut, '-', c.annee_fin) AS nom_campagne
    FROM scores_membres sm
    INNER JOIN campagnes c ON c.id = sm.campagne_id
    WHERE sm.membre_id = ${membreId} AND sm.cooperative_id = ${cooperativeId}
    ORDER BY sm.date_calcul DESC
    LIMIT 5
  `);
  return rows.rows;
}

// ─── Évolution sur N campagnes ────────────────────────────────────────────────
export async function getEvolution(cooperativeId: number, membreId: number) {
  const rows = await db.execute<{
    campagne_id: number; nom_campagne: string;
    score_global: string; niveau: string; rang: number; date_calcul: string;
  }>(sql`
    SELECT
      sm.campagne_id,
      CONCAT(c.annee_debut, '-', c.annee_fin) AS nom_campagne,
      sm.score_global, sm.niveau, sm.rang, sm.date_calcul
    FROM scores_membres sm
    INNER JOIN campagnes c ON c.id = sm.campagne_id
    WHERE sm.membre_id = ${membreId} AND sm.cooperative_id = ${cooperativeId}
    ORDER BY c.annee_debut DESC
    LIMIT 10
  `);
  return rows.rows;
}

// ─── Top N producteurs ────────────────────────────────────────────────────────
export async function getTopN(cooperativeId: number, campagneId: number, n: number) {
  const rows = await db.execute<{
    rang: number; membre_id: number; nom: string; prenoms: string;
    village: string | null; score_global: string; niveau: string;
    score_volume: string; score_qualite: string; tonnage: string;
  }>(sql`
    SELECT
      sm.rang, sm.membre_id, m.nom, m.prenoms, m.village,
      sm.score_global, sm.niveau, sm.score_volume, sm.score_qualite,
      COALESCE(SUM(l.poids_net_kg), 0) AS tonnage
    FROM scores_membres sm
    INNER JOIN membres m ON m.id = sm.membre_id
    LEFT JOIN livraisons l ON l.membre_id = sm.membre_id AND l.campagne_id = ${campagneId}
    WHERE sm.campagne_id = ${campagneId} AND sm.cooperative_id = ${cooperativeId}
      AND sm.rang IS NOT NULL
    GROUP BY sm.id, m.id
    ORDER BY sm.rang ASC
    LIMIT ${n}
  `);
  return rows.rows;
}

// ─── Membres par niveau ───────────────────────────────────────────────────────
export async function getParNiveau(cooperativeId: number, campagneId: number, niveau: string) {
  const rows = await db.execute<{
    membre_id: number; nom: string; prenoms: string; village: string | null;
    groupement: string | null; score_global: string; rang: number;
  }>(sql`
    SELECT sm.membre_id, m.nom, m.prenoms, m.village, m.groupement, sm.score_global, sm.rang
    FROM scores_membres sm
    INNER JOIN membres m ON m.id = sm.membre_id
    WHERE sm.campagne_id = ${campagneId} AND sm.cooperative_id = ${cooperativeId}
      AND sm.niveau = ${niveau}
    ORDER BY sm.rang ASC
  `);
  return rows.rows;
}

// ─── Score résumé pour un membre (pour fiche + formulaire avance) ─────────────
export async function getResumeMembre(cooperativeId: number, membreId: number) {
  const rows = await db.execute<{
    score_global: string; niveau: string; rang: number;
    date_calcul: string; campagne_id: number;
  }>(sql`
    SELECT sm.score_global, sm.niveau, sm.rang, sm.date_calcul, sm.campagne_id
    FROM scores_membres sm
    INNER JOIN campagnes c ON c.id = sm.campagne_id
    WHERE sm.membre_id = ${membreId} AND sm.cooperative_id = ${cooperativeId}
    ORDER BY sm.date_calcul DESC
    LIMIT 1
  `);
  return rows.rows[0] ?? null;
}
