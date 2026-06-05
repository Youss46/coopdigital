import { db } from "@workspace/db";
import {
  historiquePrixTable, alertesPrixTable, configPrixTable,
} from "@workspace/db/schema";
import { ventesExportateursTable, exportateursTable } from "@workspace/db/schema";
import { livraisonsTable } from "@workspace/db/schema";
import { lotLivraisonsTable, lotsTable } from "@workspace/db/schema";
import { campagnesTable } from "@workspace/db/schema";
import { eq, and, desc, asc, sql, gte, lte } from "drizzle-orm";
import { sendBulkSMS } from "./smsService";
import { logger } from "../lib/logger";

const COOP_ID = 1;

// ─── Config prix ──────────────────────────────────────────────────────────────
export async function getConfig() {
  const rows = await db
    .select()
    .from(configPrixTable)
    .where(eq(configPrixTable.cooperativeId, COOP_ID))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateConfig(data: {
  seuilMargeMinimumFcfa?: number;
  seuilVariationAlertePct?: number;
  diffusionAutoSms?: boolean;
}) {
  const rows = await db
    .insert(configPrixTable)
    .values({
      cooperativeId: COOP_ID,
      seuilMargeMinimumFcfa:    data.seuilMargeMinimumFcfa    != null ? String(data.seuilMargeMinimumFcfa)    : undefined,
      seuilVariationAlertePct:  data.seuilVariationAlertePct  != null ? String(data.seuilVariationAlertePct)  : undefined,
      diffusionAutoSms:         data.diffusionAutoSms,
    })
    .onConflictDoUpdate({
      target: configPrixTable.cooperativeId,
      set: {
        seuilMargeMinimumFcfa:    data.seuilMargeMinimumFcfa    != null ? String(data.seuilMargeMinimumFcfa)    : undefined,
        seuilVariationAlertePct:  data.seuilVariationAlertePct  != null ? String(data.seuilVariationAlertePct)  : undefined,
        diffusionAutoSms:         data.diffusionAutoSms,
        updatedAt:                sql`now()`,
      },
    })
    .returning();
  return rows[0];
}

// ─── Détecter variation et créer alerte ───────────────────────────────────────
export async function detecterVariation(
  nouveauPrix: number,
  ancienPrix: number,
  config: { seuilVariationAlertePct: string | null },
) {
  if (!ancienPrix) return null;
  const variation = ((nouveauPrix - ancienPrix) / ancienPrix) * 100;
  const seuil = parseFloat(config.seuilVariationAlertePct ?? "10");
  if (Math.abs(variation) < seuil) return null;

  const type = variation > 0 ? "variation_forte" : "prix_bas";
  const direction = variation > 0 ? "hausse" : "baisse";
  const message = `Variation de ${Math.abs(variation).toFixed(1)}% en ${direction} du prix bord champ (${ancienPrix} → ${nouveauPrix} FCFA/kg)`;

  const rows = await db
    .insert(alertesPrixTable)
    .values({
      cooperativeId: COOP_ID,
      type,
      seuilConfigure: String(seuil),
      valeurDeclenchante: String(Math.abs(variation).toFixed(2)),
      message,
      lu: false,
    })
    .returning();
  return rows[0];
}

// ─── Alerte marge faible ──────────────────────────────────────────────────────
export async function creerAlerteMarge(marge: number, seuilMin: number) {
  const message = marge <= 0
    ? `Marge négative ! Marge brute : ${marge} FCFA/kg (seuil : ${seuilMin} FCFA/kg)`
    : `Marge faible : ${marge} FCFA/kg en dessous du seuil de ${seuilMin} FCFA/kg`;

  const rows = await db
    .insert(alertesPrixTable)
    .values({
      cooperativeId: COOP_ID,
      type: "marge_faible",
      seuilConfigure: String(seuilMin),
      valeurDeclenchante: String(marge),
      message,
      lu: false,
    })
    .returning();
  return rows[0];
}

// ─── Saisir nouveau prix ─────────────────────────────────────────────────────
export async function saisirPrix(data: {
  campagneId?: number;
  datePrix: string;
  prixBordChampFcfa: number;
  prixVenteExportFcfa: number;
  source?: string;
  saisiPar?: number;
}) {
  // Récupérer prix précédent pour détecter variation
  const anciens = await db
    .select({ prix: historiquePrixTable.prixBordChampFcfa })
    .from(historiquePrixTable)
    .where(eq(historiquePrixTable.cooperativeId, COOP_ID))
    .orderBy(desc(historiquePrixTable.datePrix))
    .limit(1);
  const ancienPrix = anciens[0] ? parseFloat(anciens[0].prix) : null;

  // Insérer le nouveau prix
  const rows = await db
    .insert(historiquePrixTable)
    .values({
      cooperativeId: COOP_ID,
      campagneId: data.campagneId,
      datePrix: data.datePrix,
      prixBordChampFcfa: String(data.prixBordChampFcfa),
      prixVenteExportFcfa: String(data.prixVenteExportFcfa),
      source: data.source ?? "manuel",
      saisiPar: data.saisiPar,
    })
    .returning();
  const nouveau = rows[0];

  const config = await getConfig();

  // Détecter variation
  if (ancienPrix && config) {
    await detecterVariation(data.prixBordChampFcfa, ancienPrix, config);
  }

  // Vérifier marge minimale
  const marge = data.prixVenteExportFcfa - data.prixBordChampFcfa;
  const seuilMin = parseFloat(config?.seuilMargeMinimumFcfa ?? "100");
  if (marge < seuilMin && config) {
    await creerAlerteMarge(marge, seuilMin);
  }

  // Diffusion SMS automatique
  if (config?.diffusionAutoSms) {
    try {
      await diffuserPrixSMS(data.prixBordChampFcfa, data.datePrix);
    } catch (err) {
      logger.warn({ err }, "Diffusion SMS prix échouée");
    }
  }

  return nouveau;
}

// ─── Diffusion SMS ────────────────────────────────────────────────────────────
export async function diffuserPrixSMS(prix: number, date: string) {
  const dateStr = new Date(date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const message = `Prix bord champ au ${dateStr} : ${prix} FCFA/kg. Votre coopérative CoopDigital.`;

  const membres = await db.execute<{ telephone: string }>(
    sql`SELECT m.telephone FROM membres m WHERE m.cooperative_id = ${COOP_ID} AND m.statut = 'actif' AND m.telephone IS NOT NULL`
  );
  const phones = membres.rows.map((r) => r.telephone).filter(Boolean) as string[];

  if (phones.length === 0) return { envoyes: 0, echecs: 0, total: 0 };

  const results = await sendBulkSMS(phones, message);
  return results;
}

// ─── Historique avec filtres ──────────────────────────────────────────────────
export async function getHistorique(params: {
  campagneId?: number;
  dateDebut?: string;
  dateFin?: string;
  limit?: number;
}) {
  const conditions = [eq(historiquePrixTable.cooperativeId, COOP_ID)];
  if (params.campagneId) conditions.push(eq(historiquePrixTable.campagneId, params.campagneId));
  if (params.dateDebut) conditions.push(gte(historiquePrixTable.datePrix, params.dateDebut));
  if (params.dateFin)   conditions.push(lte(historiquePrixTable.datePrix, params.dateFin));

  return db
    .select()
    .from(historiquePrixTable)
    .where(and(...conditions))
    .orderBy(desc(historiquePrixTable.datePrix))
    .limit(params.limit ?? 200);
}

// ─── Tendance (moyenne mobile 4 semaines) ─────────────────────────────────────
export async function getTendance() {
  // Derniers 90 jours
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - 90);

  const rows = await db
    .select()
    .from(historiquePrixTable)
    .where(and(
      eq(historiquePrixTable.cooperativeId, COOP_ID),
      gte(historiquePrixTable.datePrix, dateDebut.toISOString().slice(0, 10)),
    ))
    .orderBy(asc(historiquePrixTable.datePrix));

  if (rows.length === 0) return null;

  const last = rows[rows.length - 1]!;
  const last4w = rows.filter((r) => {
    const d = new Date(r.datePrix);
    const now = new Date();
    return (now.getTime() - d.getTime()) <= 28 * 24 * 3600 * 1000;
  });
  const moyenneMobile = last4w.length > 0
    ? last4w.reduce((sum, r) => sum + parseFloat(r.prixBordChampFcfa), 0) / last4w.length
    : parseFloat(last.prixBordChampFcfa);

  // Variation semaine
  const last7 = rows.filter((r) => {
    const d = new Date(r.datePrix);
    const now = new Date();
    return (now.getTime() - d.getTime()) <= 7 * 24 * 3600 * 1000;
  });
  const firstOf7 = last7[0];
  const variationSemainePct = firstOf7
    ? ((parseFloat(last.prixBordChampFcfa) - parseFloat(firstOf7.prixBordChampFcfa)) / parseFloat(firstOf7.prixBordChampFcfa)) * 100
    : 0;

  // Tendance globale sur 90 jours
  const first = rows[0]!;
  const diffGlobal = parseFloat(last.prixBordChampFcfa) - parseFloat(first.prixBordChampFcfa);
  const direction = diffGlobal > 0 ? "hausse" : diffGlobal < 0 ? "baisse" : "stable";

  return {
    direction,
    moyenneMobile: Math.round(moyenneMobile),
    variationSemainePct: Math.round(variationSemainePct * 10) / 10,
    dernierPrix: last,
    series: rows,
  };
}

// ─── Analyse de marge par lot ─────────────────────────────────────────────────
export async function analyserMarge(params: { campagneId?: number }) {
  // Récupérer toutes les ventes exportateurs avec infos lot + campagne
  const conditions = [eq(ventesExportateursTable.campagneId ?? 0 as unknown as typeof ventesExportateursTable.campagneId, params.campagneId ?? 0)];

  const ventes = await db.execute<{
    id: number;
    lot_id: number | null;
    exportateur_nom: string;
    poids_kg: string;
    prix_unitaire_fcfa: number;
    montant_total_fcfa: number;
    date_vente: string;
    campagne_id: number | null;
  }>(sql`
    SELECT
      v.id,
      v.lot_id,
      e.nom AS exportateur_nom,
      v.poids_kg::text,
      v.prix_unitaire_fcfa,
      v.montant_total_fcfa,
      v.date_vente,
      v.campagne_id
    FROM ventes_exportateurs v
    LEFT JOIN exportateurs e ON e.id = v.exportateur_id
    WHERE v.cooperative_id = ${COOP_ID}
    ${params.campagneId ? sql`AND v.campagne_id = ${params.campagneId}` : sql``}
    ORDER BY v.date_vente DESC
    LIMIT 100
  `);

  // Pour chaque vente, calculer le prix d'achat moyen depuis les livraisons liées
  const lots: Array<{
    venteId: number;
    lotId: number | null;
    exportateur: string;
    poidsKg: number;
    prixVenteKg: number;
    prixAchatMoyenKg: number;
    chargesEstimeesKg: number;
    margeKg: number;
    margeTotale: number;
    dateVente: string;
    rentabilite: "bonne" | "faible" | "negative";
  }> = [];

  // Config pour seuil marge
  const config = await getConfig();
  const seuilMin = parseFloat(config?.seuilMargeMinimumFcfa ?? "100");

  for (const v of ventes.rows) {
    const poidsKg = parseFloat(String(v.poids_kg));
    const prixVenteKg = v.prix_unitaire_fcfa;

    // Récupérer prix moyen d'achat depuis les livraisons liées au lot
    let prixAchatMoyenKg = 0;
    if (v.lot_id) {
      const livs = await db.execute<{ prix_moyen: string }>(sql`
        SELECT AVG(l.prix_unitaire_fcfa)::text AS prix_moyen
        FROM lot_livraisons ll
        JOIN livraisons l ON l.id = ll.livraison_id
        WHERE ll.lot_id = ${v.lot_id}
      `);
      prixAchatMoyenKg = parseFloat(livs.rows[0]?.prix_moyen ?? "0");
    }

    // Si pas de livraisons liées, utiliser le dernier prix bord champ historique à la date de vente
    if (!prixAchatMoyenKg) {
      const hp = await db
        .select({ prix: historiquePrixTable.prixBordChampFcfa })
        .from(historiquePrixTable)
        .where(and(
          eq(historiquePrixTable.cooperativeId, COOP_ID),
          lte(historiquePrixTable.datePrix, v.date_vente),
        ))
        .orderBy(desc(historiquePrixTable.datePrix))
        .limit(1);
      prixAchatMoyenKg = hp[0] ? parseFloat(hp[0].prix) : prixVenteKg * 0.75;
    }

    // Charges estimées : 5% du prix vente (transport + manutention estimé)
    const chargesEstimeesKg = Math.round(prixVenteKg * 0.05);
    const margeKg = Math.round(prixVenteKg - prixAchatMoyenKg - chargesEstimeesKg);
    const margeTotale = Math.round(margeKg * poidsKg);
    const rentabilite: "bonne" | "faible" | "negative" =
      margeKg >= seuilMin ? "bonne" : margeKg >= 0 ? "faible" : "negative";

    lots.push({
      venteId: v.id,
      lotId: v.lot_id,
      exportateur: v.exportateur_nom ?? "—",
      poidsKg,
      prixVenteKg,
      prixAchatMoyenKg: Math.round(prixAchatMoyenKg),
      chargesEstimeesKg,
      margeKg,
      margeTotale,
      dateVente: v.date_vente,
      rentabilite,
    });
  }

  // Trier par marge décroissante
  lots.sort((a, b) => b.margeKg - a.margeKg);

  return {
    lots,
    meilleurLot: lots[0] ?? null,
    moinsRentable: lots[lots.length - 1] ?? null,
    margesMoyenne: lots.length > 0 ? Math.round(lots.reduce((s, l) => s + l.margeKg, 0) / lots.length) : 0,
  };
}

// ─── Comparaison campagnes ────────────────────────────────────────────────────
export async function getComparaison() {
  const rows = await db.execute<{
    campagne_id: number;
    libelle: string;
    prix_achat_moy: string;
    prix_vente_moy: string;
    marge_moy: string;
    tonnage_total: string;
    nb_ventes: string;
  }>(sql`
    SELECT
      c.id AS campagne_id,
      c.libelle,
      AVG(v.pu_mise_en_compte_fcfa)::text AS prix_achat_moy,
      AVG(v.prix_unitaire_fcfa)::text AS prix_vente_moy,
      AVG(v.prix_unitaire_fcfa - COALESCE(v.pu_mise_en_compte_fcfa, v.prix_unitaire_fcfa * 0.75))::text AS marge_moy,
      SUM(v.poids_kg / 1000)::text AS tonnage_total,
      COUNT(v.id)::text AS nb_ventes
    FROM campagnes c
    LEFT JOIN ventes_exportateurs v ON v.campagne_id = c.id AND v.cooperative_id = ${COOP_ID}
    WHERE c.cooperative_id = ${COOP_ID}
    GROUP BY c.id, c.libelle, c.annee_debut
    ORDER BY c.annee_debut DESC
    LIMIT 5
  `);
  return rows.rows;
}

// ─── Alertes prix ─────────────────────────────────────────────────────────────
export async function getAlertes(seulementNonLues = false) {
  const conditions = [eq(alertesPrixTable.cooperativeId, COOP_ID)];
  if (seulementNonLues) conditions.push(eq(alertesPrixTable.lu, false));

  return db
    .select()
    .from(alertesPrixTable)
    .where(and(...conditions))
    .orderBy(desc(alertesPrixTable.createdAt))
    .limit(50);
}

export async function marquerAlerteLue(id: number) {
  const rows = await db
    .update(alertesPrixTable)
    .set({ lu: true })
    .where(and(eq(alertesPrixTable.id, id), eq(alertesPrixTable.cooperativeId, COOP_ID)))
    .returning();
  return rows[0];
}

// ─── Simulation ───────────────────────────────────────────────────────────────
export async function simulerMarge(prixHypothetique: number) {
  // Utiliser le dernier prix vente export comme référence
  const dernier = await db
    .select()
    .from(historiquePrixTable)
    .where(eq(historiquePrixTable.cooperativeId, COOP_ID))
    .orderBy(desc(historiquePrixTable.datePrix))
    .limit(1);

  const prixVenteRef = dernier[0] ? parseFloat(dernier[0].prixVenteExportFcfa) : prixHypothetique * 1.3;
  const chargesEstimees = Math.round(prixVenteRef * 0.05);
  const margeSimulee = Math.round(prixVenteRef - prixHypothetique - chargesEstimees);

  return {
    prixBordChampHypothetique: prixHypothetique,
    prixVenteReference: Math.round(prixVenteRef),
    chargesEstimees,
    margeSimulee,
    rentabilite: margeSimulee >= 100 ? "bonne" : margeSimulee >= 0 ? "faible" : "negative",
  };
}
