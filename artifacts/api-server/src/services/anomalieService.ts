import {
  db,
  anomaliesTable,
  configAnomaliesTable,
  livraisonsTable,
  avancesTable,
  paiementsTable,
  mouvementsStockTable,
  historiquePrixTable,
  campagnesTable,
  ecrituresComptablesTable,
} from "@workspace/db";
import { eq, and, desc, gte, lt, avg, count, sql, gt } from "drizzle-orm";
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnomalieDetectee = {
  typeAnomalie:   string;
  niveauGravite:  "info" | "attention" | "critique";
  description:    string;
  valeurDetectee?: number;
  seuilConfigure?: number;
  membreId?:       number | null;
  agentId?:        number | null;
};

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getConfigAnomalie(cooperativeId: number) {
  const [cfg] = await db
    .select()
    .from(configAnomaliesTable)
    .where(eq(configAnomaliesTable.cooperativeId, cooperativeId))
    .limit(1);
  return cfg ?? null;
}

export async function updateConfigAnomalie(cooperativeId: number, data: {
  poidsMaxLivraisonKg?:      number;
  poidsMoyenMultiplicateur?: number;
  delaiMinEntreLivraisonsH?: number;
  avanceMaxFcfa?:            number;
  avanceSiRetardExistant?:   boolean;
  sortieMaxPctStock?:        number;
  paiementSansLivraison?:    boolean;
  doublonPaiementDelaiH?:    number;
  ecritureMontantMaxFcfa?:   number;
  ecartReconciliationPct?:   number;
}) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (data.poidsMaxLivraisonKg      != null) set.poidsMaxLivraisonKg      = String(data.poidsMaxLivraisonKg);
  if (data.poidsMoyenMultiplicateur != null) set.poidsMoyenMultiplicateur = String(data.poidsMoyenMultiplicateur);
  if (data.delaiMinEntreLivraisonsH != null) set.delaiMinEntreLivraisonsH = data.delaiMinEntreLivraisonsH;
  if (data.avanceMaxFcfa            != null) set.avanceMaxFcfa            = String(data.avanceMaxFcfa);
  if (data.avanceSiRetardExistant   != null) set.avanceSiRetardExistant   = data.avanceSiRetardExistant;
  if (data.sortieMaxPctStock        != null) set.sortieMaxPctStock        = String(data.sortieMaxPctStock);
  if (data.paiementSansLivraison    != null) set.paiementSansLivraison    = data.paiementSansLivraison;
  if (data.doublonPaiementDelaiH    != null) set.doublonPaiementDelaiH    = data.doublonPaiementDelaiH;
  if (data.ecritureMontantMaxFcfa   != null) set.ecritureMontantMaxFcfa   = String(data.ecritureMontantMaxFcfa);
  if (data.ecartReconciliationPct   != null) set.ecartReconciliationPct   = String(data.ecartReconciliationPct);

  const [updated] = await db
    .update(configAnomaliesTable)
    .set(set)
    .where(eq(configAnomaliesTable.cooperativeId, cooperativeId))
    .returning();
  return updated;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

export async function creerAnomalies(
  cooperativeId: number,
  anomalies: AnomalieDetectee[],
  moduleSource: string,
  extras?: { entiteId?: number; entiteType?: string },
) {
  if (anomalies.length === 0) return;
  try {
    await db.insert(anomaliesTable).values(
      anomalies.map((a) => ({
        cooperativeId:  cooperativeId,
        typeAnomalie:   a.typeAnomalie,
        niveauGravite:  a.niveauGravite,
        moduleSource,
        entiteId:       extras?.entiteId ?? null,
        entiteType:     extras?.entiteType ?? null,
        description:    a.description,
        valeurDetectee: a.valeurDetectee != null ? String(a.valeurDetectee) : null,
        seuilConfigure: a.seuilConfigure != null ? String(a.seuilConfigure) : null,
        agentId:        a.agentId   ?? null,
        membreId:       a.membreId  ?? null,
        statut:         "nouvelle" as const,
      })),
    );
  } catch (err) {
    logger.error({ err }, "Erreur creerAnomalies");
  }
}

// ─── Détecteurs ───────────────────────────────────────────────────────────────

export async function checkLivraison(cooperativeId: number, params: {
  membreId:        number;
  poidsKg:         number;
  prixUnitaireFcfa: number;
  campagneIdResolu: number | null;
  agentId:         number | null;
}): Promise<AnomalieDetectee[]> {
  const cfg = await getConfigAnomalie(cooperativeId);
  if (!cfg) return [];

  const { membreId, poidsKg, prixUnitaireFcfa, campagneIdResolu, agentId } = params;
  const anomalies: AnomalieDetectee[] = [];

  const poidsMax  = parseFloat(cfg.poidsMaxLivraisonKg      ?? "5000");
  const multMoyen = parseFloat(cfg.poidsMoyenMultiplicateur ?? "3");
  const delaiH    = cfg.delaiMinEntreLivraisonsH ?? 12;

  // RÈGLE 1a — Poids dépassant le maximum absolu
  if (poidsKg > poidsMax) {
    anomalies.push({
      typeAnomalie:   "poids_max_depasse",
      niveauGravite:  "critique",
      description:    `Poids ${poidsKg} kg dépasse le maximum autorisé (${poidsMax} kg)`,
      valeurDetectee: poidsKg,
      seuilConfigure: poidsMax,
      membreId, agentId,
    });
  }

  // RÈGLE 1b — Poids anormalement élevé par rapport à la moyenne du membre
  const depuis30j = new Date();
  depuis30j.setDate(depuis30j.getDate() - 30);
  const [moyenneRow] = await db
    .select({ moy: avg(sql<number>`${livraisonsTable.poidsKg}::numeric`) })
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.membreId, membreId),
      gte(livraisonsTable.createdAt, depuis30j),
    ));
  const moyenneMembre = moyenneRow?.moy ? parseFloat(String(moyenneRow.moy)) : null;
  if (moyenneMembre && moyenneMembre > 0 && poidsKg > moyenneMembre * multMoyen) {
    const ratio = (poidsKg / moyenneMembre).toFixed(1);
    anomalies.push({
      typeAnomalie:   "poids_anormal_vs_moyenne",
      niveauGravite:  "attention",
      description:    `Poids ${poidsKg} kg est ${ratio}x supérieur à la moyenne du membre (${moyenneMembre.toFixed(0)} kg)`,
      valeurDetectee: poidsKg,
      seuilConfigure: moyenneMembre * multMoyen,
      membreId, agentId,
    });
  }

  // RÈGLE 2 — Double livraison rapprochée
  const limiteDelai = new Date(Date.now() - delaiH * 3600 * 1000);
  const [recente] = await db
    .select({ createdAt: livraisonsTable.createdAt })
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.membreId, membreId),
      gte(livraisonsTable.createdAt, limiteDelai),
    ))
    .orderBy(desc(livraisonsTable.createdAt))
    .limit(1);
  if (recente) {
    const diffH = Math.round((Date.now() - recente.createdAt.getTime()) / 3600000);
    anomalies.push({
      typeAnomalie:   "double_livraison_rapprochee",
      niveauGravite:  "attention",
      description:    `Livraison moins de ${delaiH}h après la précédente (${diffH}h d'écart)`,
      valeurDetectee: diffH,
      seuilConfigure: delaiH,
      membreId, agentId,
    });
  }

  // RÈGLE 3 — Livraison hors campagne active
  if (!campagneIdResolu) {
    const [campagneOuverte] = await db
      .select({ id: campagnesTable.id })
      .from(campagnesTable)
      .where(eq(campagnesTable.statut, "ouverte"))
      .limit(1);
    if (!campagneOuverte) {
      anomalies.push({
        typeAnomalie:  "livraison_hors_campagne",
        niveauGravite: "critique",
        description:   "Livraison enregistrée sans campagne active",
        membreId, agentId,
      });
    }
  }

  // RÈGLE 4 — Prix unitaire incohérent
  const [dernierPrix] = await db
    .select({ prix: historiquePrixTable.prixBordChampFcfa })
    .from(historiquePrixTable)
    .where(eq(historiquePrixTable.cooperativeId, cooperativeId))
    .orderBy(desc(historiquePrixTable.datePrix))
    .limit(1);
  if (dernierPrix) {
    const refPrix = parseFloat(String(dernierPrix.prix));
    if (prixUnitaireFcfa > refPrix * 1.20 || prixUnitaireFcfa < refPrix * 0.80) {
      const pct = Math.round(((prixUnitaireFcfa - refPrix) / refPrix) * 100);
      anomalies.push({
        typeAnomalie:   "prix_incoherent",
        niveauGravite:  "attention",
        description:    `Prix unitaire ${prixUnitaireFcfa} FCFA/kg est ${Math.abs(pct)}% ${pct > 0 ? "au-dessus" : "en-dessous"} du prix de référence (${refPrix} FCFA/kg)`,
        valeurDetectee: prixUnitaireFcfa,
        seuilConfigure: refPrix,
        membreId, agentId,
      });
    }
  }

  return anomalies;
}

export async function checkAvance(cooperativeId: number, params: {
  membreId:           number;
  montantOctroyeFcfa: number;
  agentId:            number | null;
}): Promise<AnomalieDetectee[]> {
  const cfg = await getConfigAnomalie(cooperativeId);
  if (!cfg) return [];

  const { membreId, montantOctroyeFcfa, agentId } = params;
  const anomalies: AnomalieDetectee[] = [];
  const maxFcfa = parseFloat(cfg.avanceMaxFcfa ?? "500000");

  // RÈGLE 5 — Avance si retard existant
  if (cfg.avanceSiRetardExistant) {
    const [retard] = await db
      .select({ id: avancesTable.id })
      .from(avancesTable)
      .where(and(eq(avancesTable.membreId, membreId), eq(avancesTable.statut, "en_retard")))
      .limit(1);
    if (retard) {
      anomalies.push({
        typeAnomalie:  "avance_sur_retard",
        niveauGravite: "attention",
        description:   "Membre a une avance en retard non remboursée",
        membreId, agentId,
      });
    }
  }

  // RÈGLE 6 — Montant avance excessif
  if (montantOctroyeFcfa > maxFcfa) {
    anomalies.push({
      typeAnomalie:   "avance_montant_excessif",
      niveauGravite:  "critique",
      description:    `Montant ${montantOctroyeFcfa.toLocaleString("fr-FR")} FCFA dépasse le plafond autorisé (${maxFcfa.toLocaleString("fr-FR")} FCFA)`,
      valeurDetectee: montantOctroyeFcfa,
      seuilConfigure: maxFcfa,
      membreId, agentId,
    });
  }

  // RÈGLE 7 — Avances multiples actives
  const [nbRow] = await db
    .select({ nb: count() })
    .from(avancesTable)
    .where(and(eq(avancesTable.membreId, membreId), eq(avancesTable.statut, "en_cours")));
  const nbActives = Number(nbRow?.nb ?? 0);
  if (nbActives >= 2) {
    anomalies.push({
      typeAnomalie:   "avances_multiples_actives",
      niveauGravite:  "attention",
      description:    `Membre a déjà ${nbActives} avance(s) en cours`,
      valeurDetectee: nbActives,
      seuilConfigure: 2,
      membreId, agentId,
    });
  }

  return anomalies;
}

export async function checkPaiement(cooperativeId: number, params: {
  membreId:    number;
  montantFcfa: number;
  livraisonId: number | null;
  agentId:     number | null;
}): Promise<AnomalieDetectee[]> {
  const cfg = await getConfigAnomalie(cooperativeId);
  if (!cfg) return [];

  const { membreId, montantFcfa, livraisonId, agentId } = params;
  const anomalies: AnomalieDetectee[] = [];
  const delaiDoublon = cfg.doublonPaiementDelaiH ?? 24;

  // RÈGLE 8 — Paiement sans livraison associée
  if (!livraisonId && cfg.paiementSansLivraison) {
    anomalies.push({
      typeAnomalie:  "paiement_sans_livraison",
      niveauGravite: "critique",
      description:   "Paiement enregistré sans livraison associée",
      membreId, agentId,
    });
  }

  // RÈGLE 9 — Doublon de paiement
  const limiteDoublon = new Date(Date.now() - delaiDoublon * 3600 * 1000);
  const [doublon] = await db
    .select({ id: paiementsTable.id, montant: paiementsTable.montantFcfa })
    .from(paiementsTable)
    .where(and(
      eq(paiementsTable.membreId, membreId),
      gte(paiementsTable.createdAt, limiteDoublon),
    ))
    .orderBy(desc(paiementsTable.createdAt))
    .limit(1);
  if (doublon) {
    const ecart = Math.abs((doublon.montant - montantFcfa) / montantFcfa);
    if (ecart <= 0.05) {
      anomalies.push({
        typeAnomalie:   "doublon_paiement",
        niveauGravite:  "critique",
        description:    `Possible doublon — paiement similaire (${doublon.montant.toLocaleString("fr-FR")} FCFA) enregistré dans les dernières ${delaiDoublon}h`,
        valeurDetectee: montantFcfa,
        seuilConfigure: delaiDoublon,
        membreId, agentId,
      });
    }
  }

  return anomalies;
}

export async function checkStock(cooperativeId: number, params: {
  entrepotId: number;
  poidsKg:    number;
  stockActuel: number;
  agentId:    number | null;
}): Promise<AnomalieDetectee[]> {
  const cfg = await getConfigAnomalie(cooperativeId);
  if (!cfg) return [];

  const { entrepotId, poidsKg, stockActuel, agentId } = params;
  const anomalies: AnomalieDetectee[] = [];
  const maxPct = parseFloat(cfg.sortieMaxPctStock ?? "80");

  // RÈGLE 10 — Sortie dépassant le stock (déjà gérée par le contrôleur, mais on l'enregistre)
  if (poidsKg > stockActuel) {
    anomalies.push({
      typeAnomalie:   "sortie_depasse_stock",
      niveauGravite:  "critique",
      description:    `Sortie (${poidsKg} kg) supérieure au stock disponible (${stockActuel} kg)`,
      valeurDetectee: poidsKg,
      seuilConfigure: stockActuel,
      agentId,
    });
  }

  // RÈGLE 11 — Sortie massive (> X% du stock)
  if (stockActuel > 0 && poidsKg <= stockActuel) {
    const pctSortie = (poidsKg / stockActuel) * 100;
    if (pctSortie > maxPct) {
      anomalies.push({
        typeAnomalie:   "sortie_massive",
        niveauGravite:  "attention",
        description:    `Sortie représente ${pctSortie.toFixed(1)}% du stock disponible (seuil : ${maxPct}%)`,
        valeurDetectee: pctSortie,
        seuilConfigure: maxPct,
        agentId,
      });
    }
  }

  return anomalies;
}

export async function checkEcriture(cooperativeId: number, params: {
  montantFcfa: number;
  agentId:     number | null;
}): Promise<AnomalieDetectee[]> {
  const cfg = await getConfigAnomalie(cooperativeId);
  if (!cfg) return [];

  const { montantFcfa, agentId } = params;
  const anomalies: AnomalieDetectee[] = [];
  const maxMontant  = parseFloat(cfg.ecritureMontantMaxFcfa  ?? "10000000");
  const ecartPct    = parseFloat(cfg.ecartReconciliationPct  ?? "1");

  // RÈGLE 12 — Montant exceptionnel
  if (montantFcfa > maxMontant) {
    anomalies.push({
      typeAnomalie:   "ecriture_montant_exceptionnel",
      niveauGravite:  "info",
      description:    `Écriture de ${montantFcfa.toLocaleString("fr-FR")} FCFA — montant élevé (seuil : ${maxMontant.toLocaleString("fr-FR")} FCFA). Vérification recommandée.`,
      valeurDetectee: montantFcfa,
      seuilConfigure: maxMontant,
      agentId,
    });
  }

  // RÈGLE 13 — Équilibre débit/crédit sur l'exercice courant
  const [bilan] = await db
    .select({
      totalDebits:  sql<number>`SUM(CASE WHEN compte_debit  IS NOT NULL THEN montant_fcfa ELSE 0 END)`,
      totalCredits: sql<number>`SUM(CASE WHEN compte_credit IS NOT NULL THEN montant_fcfa ELSE 0 END)`,
    })
    .from(ecrituresComptablesTable)
    .where(gte(ecrituresComptablesTable.dateEcriture, new Date().toISOString().slice(0, 7) + "-01"));
  if (bilan) {
    const debits  = Number(bilan.totalDebits  ?? 0);
    const credits = Number(bilan.totalCredits ?? 0);
    const ecart   = credits > 0 ? Math.abs((debits - credits) / credits) * 100 : 0;
    if (ecart > ecartPct) {
      anomalies.push({
        typeAnomalie:   "desequilibre_debit_credit",
        niveauGravite:  "critique",
        description:    `Déséquilibre débit/crédit détecté : débits ${debits.toLocaleString("fr-FR")} vs crédits ${credits.toLocaleString("fr-FR")} FCFA (écart ${ecart.toFixed(2)}%)`,
        valeurDetectee: ecart,
        seuilConfigure: ecartPct,
        agentId,
      });
    }
  }

  return anomalies;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listAnomalies(cooperativeId: number, filters: {
  gravite?:    string;
  statut?:     string;
  module?:     string;
  membreId?:   number;
  agentId?:    number;
  dateDebut?:  string;
  dateFin?:    string;
  limit?:      number;
  offset?:     number;
}) {
  const conditions = [eq(anomaliesTable.cooperativeId, cooperativeId)];
  if (filters.gravite)   conditions.push(eq(anomaliesTable.niveauGravite, filters.gravite as "info" | "attention" | "critique"));
  if (filters.statut)    conditions.push(eq(anomaliesTable.statut, filters.statut as "nouvelle" | "en_cours" | "resolue" | "ignoree" | "faux_positif"));
  if (filters.module)    conditions.push(eq(anomaliesTable.moduleSource, filters.module));
  if (filters.membreId)  conditions.push(eq(anomaliesTable.membreId, filters.membreId));
  if (filters.agentId)   conditions.push(eq(anomaliesTable.agentId, filters.agentId));
  if (filters.dateDebut) conditions.push(gte(anomaliesTable.createdAt, new Date(filters.dateDebut)));
  if (filters.dateFin)   conditions.push(lt(anomaliesTable.createdAt, new Date(filters.dateFin + "T23:59:59Z")));

  const limit  = Math.min(filters.limit  ?? 50, 100);
  const offset = filters.offset ?? 0;

  const rows = await db
    .select()
    .from(anomaliesTable)
    .where(and(...conditions))
    .orderBy(desc(anomaliesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ nb: count() })
    .from(anomaliesTable)
    .where(and(...conditions));

  return { anomalies: rows, total: Number(totalRow?.nb ?? 0), limit, offset };
}

export async function traiterAnomalie(
  cooperativeId: number,
  id: number,
  data: { statut: "resolue" | "ignoree" | "faux_positif"; commentaire?: string; traitePar: number },
) {
  const [updated] = await db
    .update(anomaliesTable)
    .set({
      statut:                data.statut,
      traitePar:             data.traitePar,
      traiteLe:              new Date(),
      commentaireTraitement: data.commentaire ?? null,
    })
    .where(and(eq(anomaliesTable.id, id), eq(anomaliesTable.cooperativeId, cooperativeId)))
    .returning();
  return updated ?? null;
}

export async function getStats(cooperativeId: number) {
  const debut_mois = new Date();
  debut_mois.setDate(1); debut_mois.setHours(0, 0, 0, 0);

  const [totaux] = await db
    .select({
      nb_critiques:     sql<number>`COUNT(*) FILTER (WHERE niveau_gravite = 'critique' AND statut IN ('nouvelle','en_cours'))`,
      nb_attention:     sql<number>`COUNT(*) FILTER (WHERE niveau_gravite = 'attention' AND statut IN ('nouvelle','en_cours'))`,
      nb_info:          sql<number>`COUNT(*) FILTER (WHERE niveau_gravite = 'info'      AND statut IN ('nouvelle','en_cours'))`,
      nb_non_traitees:  sql<number>`COUNT(*) FILTER (WHERE statut IN ('nouvelle','en_cours'))`,
      nb_resolues_mois: sql<number>`COUNT(*) FILTER (WHERE statut = 'resolue' AND created_at >= ${debut_mois})`,
      nb_faux_positifs: sql<number>`COUNT(*) FILTER (WHERE statut = 'faux_positif' AND created_at >= ${debut_mois})`,
    })
    .from(anomaliesTable)
    .where(eq(anomaliesTable.cooperativeId, cooperativeId));

  const parModule = await db
    .select({
      module:   anomaliesTable.moduleSource,
      nb:       count(),
    })
    .from(anomaliesTable)
    .where(eq(anomaliesTable.cooperativeId, cooperativeId))
    .groupBy(anomaliesTable.moduleSource)
    .orderBy(desc(count()));

  const topAgents = await db
    .select({
      agent_id: anomaliesTable.agentId,
      nb:       count(),
    })
    .from(anomaliesTable)
    .where(and(eq(anomaliesTable.cooperativeId, cooperativeId), gt(anomaliesTable.agentId, 0)))
    .groupBy(anomaliesTable.agentId)
    .orderBy(desc(count()))
    .limit(5);

  const topMembres = await db
    .select({
      membre_id: anomaliesTable.membreId,
      nb:        count(),
    })
    .from(anomaliesTable)
    .where(and(eq(anomaliesTable.cooperativeId, cooperativeId), gt(anomaliesTable.membreId, 0)))
    .groupBy(anomaliesTable.membreId)
    .orderBy(desc(count()))
    .limit(5);

  // Évolution 30 derniers jours
  const depuis30j = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const evolution = await db
    .select({
      jour: sql<string>`DATE(created_at)`,
      nb:   count(),
    })
    .from(anomaliesTable)
    .where(and(
      eq(anomaliesTable.cooperativeId, cooperativeId),
      gte(anomaliesTable.createdAt, depuis30j),
    ))
    .groupBy(sql`DATE(created_at)`)
    .orderBy(sql`DATE(created_at)`);

  return {
    ...totaux,
    par_module:  parModule,
    top_agents:  topAgents,
    top_membres: topMembres,
    evolution,
  };
}
