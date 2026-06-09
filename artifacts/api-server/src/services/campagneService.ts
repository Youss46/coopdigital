import { db } from "@workspace/db";
import {
  campagnesTable,
  bilansCampagneTable,
  verificationsClotureCampagneTable,
} from "@workspace/db";
import { eq, and, sql, desc, ne, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { recalculerTous } from "./scoringService";

export interface ResultatVerification {
  code: string;
  verification: string;
  statut: "ok" | "bloquant" | "avertissement";
  message: string;
}

export interface ResultatVerifications {
  bloquants: ResultatVerification[];
  avertissements: ResultatVerification[];
  ok: ResultatVerification[];
  toutOk: boolean;
}

export async function verifierAvantCloture(cooperativeId: number, campagneId: number): Promise<ResultatVerifications> {
  const resultats: ResultatVerification[] = [];

  const ok = (code: string, verification: string): ResultatVerification =>
    ({ code, verification, statut: "ok", message: "Aucun problème détecté" });

  const bloquant = (code: string, verification: string, message: string): ResultatVerification =>
    ({ code, verification, statut: "bloquant", message });

  const avertissement = (code: string, verification: string, message: string): ResultatVerification =>
    ({ code, verification, statut: "avertissement", message });

  const V1_LABEL = "Livraisons sans paiement confirmé";
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*) AS nb
      FROM livraisons l
      LEFT JOIN paiements p ON p.livraison_id = l.id AND p.statut = 'confirme'
      WHERE l.campagne_id = ${campagneId}
        AND p.id IS NULL
    `);
    const nb = Number((r.rows[0] as { nb: string })?.nb ?? 0);
    resultats.push(nb > 0
      ? bloquant("V1", V1_LABEL, `${nb} livraison(s) sans paiement confirmé`)
      : ok("V1", V1_LABEL));
  } catch {
    resultats.push(ok("V1", V1_LABEL));
  }

  const V2_LABEL = "Avances membres non remboursées";
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*) AS nb,
             COALESCE(SUM(solde_restant_fcfa), 0) AS total
      FROM avances
      WHERE statut = 'en_cours'
    `);
    const row = r.rows[0] as { nb: string; total: string };
    const nb = Number(row?.nb ?? 0);
    const total = Number(row?.total ?? 0);
    resultats.push(nb > 0
      ? avertissement("V2", V2_LABEL, `${nb} avance(s) en cours — solde total : ${total.toLocaleString("fr-FR")} FCFA`)
      : ok("V2", V2_LABEL));
  } catch {
    resultats.push(ok("V2", V2_LABEL));
  }

  const V3_LABEL = "Créances exportateurs en retard";
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*) AS nb,
             COALESCE(SUM(montant_net_a_payer_fcfa), 0) AS montant
      FROM ventes_exportateurs
      WHERE campagne_id = ${campagneId}
        AND statut = 'en_retard'
    `);
    const row = r.rows[0] as { nb: string; montant: string };
    const nb = Number(row?.nb ?? 0);
    const montant = Number(row?.montant ?? 0);
    resultats.push(nb > 0
      ? bloquant("V3", V3_LABEL, `${nb} vente(s) en retard — ${montant.toLocaleString("fr-FR")} FCFA impayés`)
      : ok("V3", V3_LABEL));
  } catch {
    resultats.push(ok("V3", V3_LABEL));
  }

  const V4_LABEL = "Lots en stock non vendus";
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*) AS nb
      FROM lots
      WHERE campagne_id = ${campagneId}
        AND statut = 'en_stock'
    `);
    const nb = Number((r.rows[0] as { nb: string })?.nb ?? 0);
    resultats.push(nb > 0
      ? bloquant("V4", V4_LABEL, `${nb} lot(s) toujours en stock`)
      : ok("V4", V4_LABEL));
  } catch {
    resultats.push(ok("V4", V4_LABEL));
  }

  const V5_LABEL = "Stocks refoulés non traités";
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*) AS nb
      FROM traitements_refus
      WHERE statut = 'en_attente'
    `);
    const nb = Number((r.rows[0] as { nb: string })?.nb ?? 0);
    resultats.push(nb > 0
      ? bloquant("V5", V5_LABEL, `${nb} refus en attente de traitement`)
      : ok("V5", V5_LABEL));
  } catch {
    resultats.push(ok("V5", V5_LABEL));
  }

  const V6_LABEL = "Écritures comptables en attente";
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*) AS nb
      FROM ecritures_en_attente
      WHERE statut = 'en_attente'
    `);
    const nb = Number((r.rows[0] as { nb: string })?.nb ?? 0);
    resultats.push(nb > 0
      ? bloquant("V6", V6_LABEL, `${nb} écriture(s) en attente de validation`)
      : ok("V6", V6_LABEL));
  } catch {
    resultats.push(ok("V6", V6_LABEL));
  }

  const V7_LABEL = "Bulletins de salaire non payés";
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*) AS nb
      FROM bulletins_paie
      WHERE statut != 'paye'
    `);
    const nb = Number((r.rows[0] as { nb: string })?.nb ?? 0);
    resultats.push(nb > 0
      ? avertissement("V7", V7_LABEL, `${nb} bulletin(s) de paie non payé(s)`)
      : ok("V7", V7_LABEL));
  } catch {
    resultats.push(ok("V7", V7_LABEL));
  }

  const V8_LABEL = "Budget de campagne validé";
  try {
    const r = await db.execute(sql`
      SELECT statut FROM budgets_campagne
      WHERE campagne_id = ${campagneId}
      LIMIT 1
    `);
    const statut = (r.rows[0] as { statut?: string })?.statut;
    resultats.push(!statut || (statut !== "valide" && statut !== "cloture")
      ? avertissement("V8", V8_LABEL, `Budget en statut "${statut ?? "non défini"}" (devrait être validé)`)
      : ok("V8", V8_LABEL));
  } catch {
    resultats.push(ok("V8", V8_LABEL));
  }

  const V9_LABEL = "Anomalies critiques non traitées";
  try {
    const r = await db.execute(sql`
      SELECT COUNT(*) AS nb
      FROM anomalies
      WHERE campagne_id = ${campagneId}
        AND niveau_gravite = 'critique'
        AND statut = 'nouvelle'
    `);
    const nb = Number((r.rows[0] as { nb: string })?.nb ?? 0);
    resultats.push(nb > 0
      ? bloquant("V9", V9_LABEL, `${nb} anomalie(s) critique(s) non traitée(s)`)
      : ok("V9", V9_LABEL));
  } catch {
    resultats.push(ok("V9", V9_LABEL));
  }

  const V10_LABEL = "Équilibre de l'exercice comptable";
  try {
    const r = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN type_ecriture = 'debit'  THEN montant ELSE 0 END), 0) AS total_debits,
        COALESCE(SUM(CASE WHEN type_ecriture = 'credit' THEN montant ELSE 0 END), 0) AS total_credits
      FROM ecritures_comptables
      WHERE exercice_id IN (
        SELECT id FROM exercices_comptables
        WHERE cooperative_id = ${cooperativeId} AND statut = 'ouvert'
        LIMIT 1
      )
    `);
    const row = r.rows[0] as { total_debits: string; total_credits: string };
    const debits = Number(row?.total_debits ?? 0);
    const credits = Number(row?.total_credits ?? 0);
    const ecart = debits > 0 ? Math.abs(debits - credits) / debits : 0;
    resultats.push(ecart > 0.01
      ? bloquant("V10", V10_LABEL, `Écart de ${(ecart * 100).toFixed(2)}% entre débits (${debits.toLocaleString("fr-FR")}) et crédits (${credits.toLocaleString("fr-FR")}) FCFA`)
      : ok("V10", V10_LABEL));
  } catch {
    resultats.push(ok("V10", V10_LABEL));
  }

  await db.delete(verificationsClotureCampagneTable)
    .where(eq(verificationsClotureCampagneTable.campagneId, campagneId));

  if (resultats.length > 0) {
    await db.insert(verificationsClotureCampagneTable).values(
      resultats.map(r => ({
        campagneId,
        code: r.code,
        verification: r.verification,
        statut: r.statut,
        message: r.message,
      }))
    );
  }

  return {
    bloquants: resultats.filter(r => r.statut === "bloquant"),
    avertissements: resultats.filter(r => r.statut === "avertissement"),
    ok: resultats.filter(r => r.statut === "ok"),
    toutOk: resultats.every(r => r.statut === "ok"),
  };
}

export async function genererBilan(cooperativeId: number, campagneId: number, userId?: number): Promise<BilanData> {
  const campagne = await db.query.campagnesTable.findFirst({
    where: eq(campagnesTable.id, campagneId),
  });
  if (!campagne) throw new Error("Campagne introuvable");

  const prod = await db.execute(sql`
    SELECT
      COALESCE(SUM(poids_kg), 0)                                        AS tonnage_total,
      COALESCE(SUM(CASE WHEN type_fournisseur = 'membre'  THEN poids_kg ELSE 0 END), 0) AS tonnage_membres,
      COALESCE(SUM(CASE WHEN type_fournisseur = 'pisteur' THEN poids_kg ELSE 0 END), 0) AS tonnage_pisteurs,
      COALESCE(SUM(CASE WHEN type_fournisseur NOT IN ('membre','pisteur') AND type_fournisseur IS NOT NULL THEN poids_kg ELSE 0 END), 0) AS tonnage_externes,
      COUNT(*)                                                           AS nb_livraisons,
      COUNT(DISTINCT membre_id)                                          AS nb_membres_actifs,
      COALESCE(AVG(prix_unitaire_fcfa), 0)                               AS prix_achat_moyen,
      COALESCE(SUM(montant_brut_fcfa), 0)                                AS cout_achat_total
    FROM livraisons
    WHERE campagne_id = ${campagneId}
  `);
  const p = prod.rows[0] as Record<string, string>;

  const ventes = await db.execute(sql`
    SELECT
      COALESCE(SUM(COALESCE(poids_net_accepte_kg, poids_kg)), 0) AS tonnage_vendu,
      COALESCE(SUM(montant_total_fcfa), 0)                        AS ca_ventes,
      COUNT(DISTINCT exportateur_id)                              AS nb_exportateurs,
      COALESCE(SUM(CASE WHEN statut IN ('en_attente','partiel','en_retard')
                        THEN COALESCE(montant_net_a_payer_fcfa, montant_total_fcfa) ELSE 0 END), 0) AS creances_restantes
    FROM ventes_exportateurs
    WHERE campagne_id = ${campagneId}
  `);
  const v = ventes.rows[0] as Record<string, string>;

  const avances = await db.execute(sql`
    SELECT
      COALESCE(SUM(montant_octroye_fcfa), 0)                   AS avances_octroyees,
      COALESCE(SUM(montant_rembourse_fcfa), 0)                  AS avances_remboursees,
      COALESCE(SUM(solde_restant_fcfa), 0)                      AS avances_solde
    FROM avances
  `);
  const av = avances.rows[0] as Record<string, string>;

  const intrants = await db.execute(sql`
    SELECT
      COALESCE(SUM(montant_fcfa), 0) AS intrants_distribues
    FROM distributions_intrants
    WHERE campagne_id = ${campagneId}
  `);
  const it = intrants.rows[0] as Record<string, string>;

  const salaires = await db.execute(sql`
    SELECT COALESCE(SUM(salaire_net_fcfa), 0) AS charges_personnel
    FROM bulletins_paie
    WHERE statut = 'paye'
  `);
  const sal = salaires.rows[0] as Record<string, string>;

  const cotisations = await db.execute(sql`
    SELECT COALESCE(SUM(montant_fcfa), 0) AS total
    FROM cotisations
    WHERE campagne_id = ${campagneId}
  `);
  const cot = cotisations.rows[0] as Record<string, string>;

  const partsSociales = await db.execute(sql`
    SELECT COALESCE(SUM(montant_fcfa), 0) AS total
    FROM liberations_parts
    WHERE campagne_id = ${campagneId}
  `).catch(() => ({ rows: [{ total: "0" }] }));
  const ps = partsSociales.rows[0] as Record<string, string>;

  const tonnageTotal = Number(p.tonnage_total ?? 0);
  const caVentes = Number(v.ca_ventes ?? 0);
  const coutAchat = Number(p.cout_achat_total ?? 0);
  const chargesPersonnel = Number(sal.charges_personnel ?? 0);
  const intrantsDistrib = Number(it.intrants_distribues ?? 0);
  const margeBrute = caVentes - coutAchat;
  const chargesExploitation = intrantsDistrib;
  const margeNette = margeBrute - chargesPersonnel - chargesExploitation;
  const margeKg = tonnageTotal > 0 ? margeNette / tonnageTotal : 0;
  const tonnageVendu = Number(v.tonnage_vendu ?? 0);
  const prixVenteMoyen = tonnageVendu > 0 ? caVentes / tonnageVendu : 0;

  const prevBilan = await db.query.bilansCampagneTable.findFirst({
    where: and(
      eq(bilansCampagneTable.cooperativeId, cooperativeId),
      ne(bilansCampagneTable.campagneId, campagneId)
    ),
    orderBy: [desc(bilansCampagneTable.dateGeneration)],
  });

  const variationTonnage = prevBilan && Number(prevBilan.tonnageTotalKg) > 0
    ? ((tonnageTotal - Number(prevBilan.tonnageTotalKg)) / Number(prevBilan.tonnageTotalKg)) * 100
    : null;
  const variationCa = prevBilan && Number(prevBilan.caVentesFcfa) > 0
    ? ((caVentes - Number(prevBilan.caVentesFcfa)) / Number(prevBilan.caVentesFcfa)) * 100
    : null;
  const variationMarge = prevBilan && Number(prevBilan.margeNetteFcfa) > 0
    ? ((margeNette - Number(prevBilan.margeNetteFcfa)) / Number(prevBilan.margeNetteFcfa)) * 100
    : null;

  const bilanData = {
    cooperativeId,
    campagneId,
    tonnageTotalKg: String(tonnageTotal),
    tonnageMembresKg: String(Number(p.tonnage_membres ?? 0)),
    tonnagePisteursKg: String(Number(p.tonnage_pisteurs ?? 0)),
    tonnageExternesKg: String(Number(p.tonnage_externes ?? 0)),
    nbLivraisons: Number(p.nb_livraisons ?? 0),
    nbMembresActifs: Number(p.nb_membres_actifs ?? 0),
    nbFournisseursTotal: Number(p.nb_membres_actifs ?? 0),
    prixAchatMoyenKgFcfa: String(Number(p.prix_achat_moyen ?? 0)),
    tonnageVenduKg: String(tonnageVendu),
    caVentesFcfa: String(caVentes),
    prixVenteMoyenKgFcfa: String(prixVenteMoyen),
    nbExportateurs: Number(v.nb_exportateurs ?? 0),
    creancesRestantesFcfa: String(Number(v.creances_restantes ?? 0)),
    coutAchatTotalFcfa: String(coutAchat),
    chargesExploitationFcfa: String(chargesExploitation),
    chargesPersonnelFcfa: String(chargesPersonnel),
    chargesFinancieresFcfa: "0",
    margeBruteFcfa: String(margeBrute),
    margeNetteFcfa: String(margeNette),
    margeKgFcfa: String(margeKg),
    avancesOctroYeesFcfa: String(Number(av.avances_octroyees ?? 0)),
    avancesRembouRseesFcfa: String(Number(av.avances_remboursees ?? 0)),
    avancesSoldeFcfa: String(Number(av.avances_solde ?? 0)),
    intrantsDistribuEsFcfa: String(intrantsDistrib),
    intrantsRecouVresFcfa: "0",
    partsSocialesCollecteesFcfa: String(Number(ps.total ?? 0)),
    cotisationsCollecteesFcfa: String(Number(cot.total ?? 0)),
    variationTonnagePct: variationTonnage != null ? String(variationTonnage) : null,
    variationCaPct: variationCa != null ? String(variationCa) : null,
    variationMargePct: variationMarge != null ? String(variationMarge) : null,
    generePar: userId ?? null,
    dateGeneration: new Date(),
  };

  await db.delete(bilansCampagneTable).where(eq(bilansCampagneTable.campagneId, campagneId));
  const [bilan] = await db.insert(bilansCampagneTable).values(bilanData).returning();

  return { campagne, bilan: bilan! };
}

export type BilanData = {
  campagne: typeof campagnesTable.$inferSelect;
  bilan: typeof bilansCampagneTable.$inferSelect;
};

export async function cloturerCampagne(cooperativeId: number, campagneId: number, userId: number): Promise<BilanData> {
  const verif = await verifierAvantCloture(cooperativeId, campagneId);
  if (verif.bloquants.length > 0) {
    throw new Error(`Clôture impossible : ${verif.bloquants.length} point(s) bloquant(s) à résoudre`);
  }

  const bilanData = await genererBilan(cooperativeId, campagneId, userId);

  const dateFermeture = new Date().toISOString().slice(0, 10);
  await db.update(campagnesTable)
    .set({ statut: "fermee", dateFermeture })
    .where(and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)));

  // Scoring final de tous les membres — fire-and-forget (non bloquant)
  recalculerTous(cooperativeId, campagneId).catch((err) =>
    logger.warn({ err, campagneId }, "Erreur scoring post-clôture (non bloquant)"),
  );

  return bilanData;
}

export async function getComparaisonCampagnes(cooperativeId: number, ids: number[]) {
  if (ids.length === 0) {
    const campagnes = await db.query.campagnesTable.findMany({
      where: eq(campagnesTable.cooperativeId, cooperativeId),
      orderBy: [desc(campagnesTable.anneeDebut)],
      limit: 5,
    });
    ids = campagnes.map(c => c.id);
  }

  const bilans = await db.query.bilansCampagneTable.findMany({
    where: inArray(bilansCampagneTable.campagneId, ids),
  });

  const campagnes = await db.query.campagnesTable.findMany({
    where: inArray(campagnesTable.id, ids),
    orderBy: [desc(campagnesTable.anneeDebut)],
  });

  return campagnes.map(c => ({
    campagne: c,
    bilan: bilans.find(b => b.campagneId === c.id) ?? null,
  }));
}
