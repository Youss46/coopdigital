import { db } from "@workspace/db";
import {
  previsionsCampagneTable, simulationsTable,
  campagnesTable, livraisonsTable, avancesTable, membresTable,
} from "@workspace/db";
import { eq, and, sql, gte, gt } from "drizzle-orm";
import { logger } from "../lib/logger.js";

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

// ─── Projection fin de campagne ───────────────────────────────────────────────

export async function projeterFinCampagne(campagneId: number, cooperativeId: number) {
  // Campagne
  const [campagne] = await db
    .select()
    .from(campagnesTable)
    .where(and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)));

  if (!campagne) return null;

  // Prévision existante
  const [prevExistante] = await db
    .select()
    .from(previsionsCampagneTable)
    .where(and(
      eq(previsionsCampagneTable.campagneId, campagneId),
      eq(previsionsCampagneTable.cooperativeId, cooperativeId),
    ));

  // Stats réelles livraisons
  const [statsLiv] = await db
    .select({
      tonnage_total: sql<string>`COALESCE(SUM(${livraisonsTable.poidsKg}), 0)`,
      prix_achat_moyen: sql<string>`COALESCE(AVG(${livraisonsTable.prixUnitaireFcfa}), 0)`,
      nb_livraisons: sql<number>`COUNT(${livraisonsTable.id})`,
      nb_membres: sql<number>`COUNT(DISTINCT ${livraisonsTable.membreId})`,
      date_premiere: sql<string>`MIN(${livraisonsTable.dateLivraison})`,
      date_derniere: sql<string>`MAX(${livraisonsTable.dateLivraison})`,
    })
    .from(livraisonsTable)
    .where(eq(livraisonsTable.campagneId, campagneId));

  const tonnageActuel = toNum(statsLiv?.tonnage_total);
  const prixAchatMoyen = toNum(statsLiv?.prix_achat_moyen);

  // Calcul du rythme
  const dateOuverture = new Date(campagne.dateOuverture);
  const today = new Date();
  const msParSemaine = 7 * 24 * 3600 * 1000;
  const semainesEcoulees = Math.max(1, (today.getTime() - dateOuverture.getTime()) / msParSemaine);

  const prevision = prevExistante;
  const nbSemainesTotal = prevision?.nbSemainesCampagne ?? 20;
  const tonnagePrevu = toNum(prevision?.tonnagePrevuKg) || 0;
  const prixVentePrevu = toNum(prevision?.prixVentePrevuFcfa) || prixAchatMoyen * 1.15;
  const prixAchatPrevu = toNum(prevision?.prixAchatPrevuFcfa) || prixAchatMoyen;

  const rythmHebdo = tonnageActuel / semainesEcoulees;
  const semainesRestantes = Math.max(0, nbSemainesTotal - semainesEcoulees);
  const tonnageProjecte = tonnageActuel + rythmHebdo * semainesRestantes;

  const caProjecte = tonnageProjecte * prixVentePrevu;
  const coutProjecte = tonnageProjecte * prixAchatMoyen;
  const margeProjectee = caProjecte - coutProjecte;

  const ecartTonnagePct = tonnagePrevu > 0
    ? ((tonnageProjecte - tonnagePrevu) / tonnagePrevu) * 100
    : 0;
  const caPrevu = toNum(prevision?.caPrevuFcfa) || tonnagePrevu * prixVentePrevu;
  const ecartCaPct = caPrevu > 0
    ? ((caProjecte - caPrevu) / caPrevu) * 100
    : 0;

  // Sauvegarder / mettre à jour la projection
  const projData = {
    tonnageRythmeActuelKg: String(Math.round(tonnageProjecte * 100) / 100),
    caProjectionFinFcfa: String(Math.round(caProjecte)),
    margeProjectionFinFcfa: String(Math.round(margeProjectee)),
    ecartTonnagePct: String(Math.round(ecartTonnagePct * 100) / 100),
    ecartCaPct: String(Math.round(ecartCaPct * 100) / 100),
    dateDerniereProjection: new Date(),
    updatedAt: new Date(),
  };

  if (prevExistante) {
    await db.update(previsionsCampagneTable).set(projData)
      .where(eq(previsionsCampagneTable.id, prevExistante.id));
  } else {
    await db.insert(previsionsCampagneTable).values({
      cooperativeId,
      campagneId,
      nbSemainesCampagne: nbSemainesTotal,
      ...projData,
    });
  }

  // Alerte si retard > 10%
  if (ecartTonnagePct < -10 && tonnagePrevu > 0) {
    logger.warn({ campagneId, ecartTonnagePct }, "Alerte prévision : retard tonnage > 10%");
  }

  // Historique semaine par semaine depuis date ouverture
  const historiqueHebdo = await genererHistoriqueHebdomadaire(campagneId, dateOuverture, nbSemainesTotal, rythmHebdo, tonnagePrevu);

  // Interprétation textuelle
  const semainesRestantesArrondi = Math.ceil(semainesRestantes);
  let interpretation = "";
  if (tonnagePrevu > 0) {
    const rythmNecessaire = semainesRestantes > 0
      ? (tonnagePrevu - tonnageActuel) / semainesRestantes
      : 0;
    interpretation = `Au rythme actuel de ${Math.round(rythmHebdo).toLocaleString("fr-FR")} kg/semaine, vous atteindrez `
      + `${Math.round(tonnageProjecte / 1000)} tonnes à la clôture`;
    if (ecartTonnagePct < -1) {
      const ecart = Math.round((tonnagePrevu - tonnageProjecte) / 1000 * 10) / 10;
      interpretation += `, soit ${ecart} T sous l'objectif. Pour atteindre ${Math.round(tonnagePrevu / 1000)} T, `
        + `il faudrait collecter ${Math.round(rythmNecessaire).toLocaleString("fr-FR")} kg/semaine`
        + ` sur les ${semainesRestantesArrondi} semaine${semainesRestantesArrondi > 1 ? "s" : ""} restante${semainesRestantesArrondi > 1 ? "s" : ""}.`;
    } else if (ecartTonnagePct > 1) {
      interpretation += `, soit ${Math.round((tonnageProjecte - tonnagePrevu) / 1000 * 10) / 10} T au-dessus de l'objectif. Excellent rythme !`;
    } else {
      interpretation += ". Vous êtes dans les objectifs.";
    }
  }

  return {
    campagne: {
      id: campagne.id,
      libelle: campagne.libelle,
      date_ouverture: campagne.dateOuverture,
      date_fermeture: campagne.dateFermeture,
      statut: campagne.statut,
    },
    prevision: prevExistante ? {
      ...prevExistante,
      ...projData,
    } : null,
    reel: {
      tonnage_actuel_kg: tonnageActuel,
      prix_achat_moyen_fcfa: Math.round(prixAchatMoyen),
      nb_livraisons: Number(statsLiv?.nb_livraisons ?? 0),
      nb_membres: Number(statsLiv?.nb_membres ?? 0),
    },
    projection: {
      semaines_ecoulees: Math.round(semainesEcoulees * 10) / 10,
      semaines_totales: nbSemainesTotal,
      semaines_restantes: Math.round(semainesRestantes * 10) / 10,
      rythme_hebdo_kg: Math.round(rythmHebdo),
      tonnage_projete_kg: Math.round(tonnageProjecte),
      tonnage_prevu_kg: tonnagePrevu,
      ca_projete_fcfa: Math.round(caProjecte),
      ca_prevu_fcfa: Math.round(caPrevu),
      marge_projetee_fcfa: Math.round(margeProjectee),
      ecart_tonnage_pct: Math.round(ecartTonnagePct * 10) / 10,
      ecart_ca_pct: Math.round(ecartCaPct * 10) / 10,
    },
    historique_hebdo: historiqueHebdo,
    interpretation,
  };
}

async function genererHistoriqueHebdomadaire(
  campagneId: number,
  dateOuverture: Date,
  nbSemaines: number,
  rythmHebdo: number,
  tonnagePrevu: number,
) {
  // Récupérer toutes les livraisons de la campagne et grouper en TypeScript
  const livraisons = await db
    .select({
      date: livraisonsTable.dateLivraison,
      poids: livraisonsTable.poidsKg,
    })
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.campagneId, campagneId),
      gte(livraisonsTable.dateLivraison, dateOuverture.toISOString().slice(0, 10)),
    ));

  const mapSemaine = new Map<number, number>();
  const ouvertureMs = dateOuverture.getTime();
  for (const l of livraisons) {
    const livMs = new Date(l.date).getTime();
    const semaine = Math.floor((livMs - ouvertureMs) / (7 * 24 * 3600 * 1000)) + 1;
    mapSemaine.set(semaine, (mapSemaine.get(semaine) ?? 0) + toNum(l.poids));
  }

  const today = new Date();
  const semaineActuelle = Math.ceil((today.getTime() - dateOuverture.getTime()) / (7 * 24 * 3600 * 1000));
  const rythmeObjHebdo = tonnagePrevu > 0 ? tonnagePrevu / nbSemaines : 0;

  const lignes = [];
  let cumulReel = 0;
  let cumulProjecte = 0;

  for (let s = 1; s <= nbSemaines; s++) {
    const date = new Date(dateOuverture.getTime() + (s - 1) * 7 * 24 * 3600 * 1000);
    const estPasse = s <= semaineActuelle;
    const tonnageSemaine = mapSemaine.get(s) ?? 0;

    if (estPasse) {
      cumulReel += tonnageSemaine;
    }
    cumulProjecte = estPasse ? cumulReel : cumulReel + rythmHebdo * (s - semaineActuelle);

    lignes.push({
      semaine: s,
      date: date.toISOString().slice(0, 10),
      tonnage_reel: estPasse ? cumulReel : null,
      tonnage_projete: cumulProjecte,
      objectif: rythmeObjHebdo * s,
      est_passe: estPasse,
    });
  }

  return lignes;
}

// ─── Hypothèses ───────────────────────────────────────────────────────────────

export async function saisirHypotheses(campagneId: number, cooperativeId: number, data: {
  tonnage_prevu_kg?: number;
  prix_achat_prevu_fcfa?: number;
  prix_vente_prevu_fcfa?: number;
  nb_membres_prevus?: number;
  nb_semaines_campagne?: number;
}) {
  const [existing] = await db
    .select({ id: previsionsCampagneTable.id })
    .from(previsionsCampagneTable)
    .where(and(
      eq(previsionsCampagneTable.campagneId, campagneId),
      eq(previsionsCampagneTable.cooperativeId, cooperativeId),
    ));

  const tonnage = data.tonnage_prevu_kg;
  const prixAchat = data.prix_achat_prevu_fcfa;
  const prixVente = data.prix_vente_prevu_fcfa;

  const valeurs = {
    tonnagePrevuKg: tonnage !== undefined ? String(tonnage) : undefined,
    prixAchatPrevuFcfa: prixAchat !== undefined ? String(prixAchat) : undefined,
    prixVentePrevuFcfa: prixVente !== undefined ? String(prixVente) : undefined,
    nbMembresPrevus: data.nb_membres_prevus,
    nbSemainesCampagne: data.nb_semaines_campagne,
    caPrevuFcfa: tonnage !== undefined && prixVente !== undefined ? String(Math.round(tonnage * prixVente)) : undefined,
    coutAchatPrevuFcfa: tonnage !== undefined && prixAchat !== undefined ? String(Math.round(tonnage * prixAchat)) : undefined,
    margeBrutePrevueFcfa: tonnage !== undefined && prixVente !== undefined && prixAchat !== undefined
      ? String(Math.round(tonnage * (prixVente - prixAchat))) : undefined,
    margeKgPrevueFcfa: prixVente !== undefined && prixAchat !== undefined
      ? String(Math.round(prixVente - prixAchat)) : undefined,
    updatedAt: new Date(),
  };

  const valeursSansUndefined = Object.fromEntries(
    Object.entries(valeurs).filter(([, v]) => v !== undefined)
  );

  if (existing) {
    await db.update(previsionsCampagneTable)
      .set(valeursSansUndefined)
      .where(eq(previsionsCampagneTable.id, existing.id));
  } else {
    await db.insert(previsionsCampagneTable).values({
      cooperativeId,
      campagneId,
      ...valeursSansUndefined,
    });
  }

  return projeterFinCampagne(campagneId, cooperativeId);
}

// ─── Projection trésorerie ────────────────────────────────────────────────────

export async function projeterTresorerie(cooperativeId: number, nbJours: number) {
  const today = new Date();
  const horizon = new Date(today.getTime() + nbJours * 24 * 3600 * 1000);

  // Avances en cours (filtrées par coopérative via membres)
  const [avancesEnCours] = await db
    .select({ total: sql<string>`COALESCE(SUM(${avancesTable.soldeRestantFcfa}), 0)` })
    .from(avancesTable)
    .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
    .where(and(
      eq(membresTable.cooperativeId, cooperativeId),
      gt(avancesTable.soldeRestantFcfa, sql`0`),
    ));

  // Trésorerie approximative (solde estimé = avances octroyées - avances remboursées)
  const [soldeAvances] = await db
    .select({
      total_octroye: sql<string>`COALESCE(SUM(${avancesTable.montantOctroyeFcfa}), 0)`,
      total_rembourse: sql<string>`COALESCE(SUM(${avancesTable.montantRembourse_fcfa}), 0)`,
    })
    .from(avancesTable)
    .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
    .where(eq(membresTable.cooperativeId, cooperativeId));

  const tresorerieApprox = 0; // Sera calculée via comptes 521/571 en prod

  // Génération de semaines
  const semaines: Array<{
    semaine: number;
    date_debut: string;
    date_fin: string;
    encaissements: number;
    decaissements: number;
    solde_net: number;
    solde_cumul: number;
  }> = [];

  const nbSemaines = Math.ceil(nbJours / 7);
  let soldeRunning = tresorerieApprox;

  // Estimation charges hebdomadaires (à affiner avec données réelles)
  const chargesHebdoEstimees = toNum(soldeAvances?.total_octroye) / 52 * 0.05; // 5% charges hebdo estimées

  for (let s = 0; s < nbSemaines; s++) {
    const dateDebut = new Date(today.getTime() + s * 7 * 24 * 3600 * 1000);
    const dateFin = new Date(today.getTime() + (s + 1) * 7 * 24 * 3600 * 1000);

    // Encaissements estimés (proportionnels aux créances en cours)
    const encaissements = 0; // À connecter aux créances exportateurs réelles
    const decaissements = Math.round(chargesHebdoEstimees);

    soldeRunning += encaissements - decaissements;

    semaines.push({
      semaine: s + 1,
      date_debut: dateDebut.toISOString().slice(0, 10),
      date_fin: dateFin.toISOString().slice(0, 10),
      encaissements,
      decaissements,
      solde_net: encaissements - decaissements,
      solde_cumul: Math.round(soldeRunning),
    });
  }

  const risqueRupture = semaines.some((s) => s.solde_cumul < 0);
  const joursRisque = risqueRupture
    ? semaines.findIndex((s) => s.solde_cumul < 0) * 7
    : null;

  return {
    tresorerie_actuelle: Math.round(tresorerieApprox),
    nb_jours: nbJours,
    semaines,
    risque_rupture: risqueRupture,
    jours_avant_rupture: joursRisque,
    avances_en_cours_fcfa: Math.round(toNum(avancesEnCours?.total)),
    horizon: horizon.toISOString().slice(0, 10),
  };
}

// ─── Simulateur ───────────────────────────────────────────────────────────────

export async function simuler(cooperativeId: number, campagneId: number | null, params: {
  prix_achat: number;
  prix_vente: number;
  tonnage: number;
  nb_membres?: number;
}, nomSimulation: string, typeSimul: string, createdBy?: number) {
  const ca = params.tonnage * params.prix_vente;
  const cout = params.tonnage * params.prix_achat;
  const marge = ca - cout;
  const margeKg = params.prix_vente - params.prix_achat;

  // Variation vs actuel (si campagne connue)
  let variationPct: number | null = null;
  if (campagneId) {
    const [stats] = await db
      .select({
        ca_actuel: sql<string>`COALESCE(SUM(${livraisonsTable.poidsKg} * ${livraisonsTable.prixUnitaireFcfa}), 0)`,
      })
      .from(livraisonsTable)
      .where(eq(livraisonsTable.campagneId, campagneId));
    const caActuel = toNum(stats?.ca_actuel);
    if (caActuel > 0) {
      variationPct = Math.round(((ca - caActuel) / caActuel) * 100 * 10) / 10;
    }
  }

  const resultats = {
    ca_fcfa: Math.round(ca),
    cout_fcfa: Math.round(cout),
    marge_fcfa: Math.round(marge),
    marge_kg: Math.round(margeKg),
    variation_vs_actuel_pct: variationPct,
  };

  const [saved] = await db.insert(simulationsTable).values({
    cooperativeId,
    campagneId: campagneId ?? undefined,
    nomSimulation,
    type: typeSimul,
    parametres: params,
    resultats,
    createdBy,
  }).returning();

  return { simulation: saved, resultats };
}

export async function listerCampagnes(cooperativeId: number) {
  return db
    .select()
    .from(campagnesTable)
    .where(eq(campagnesTable.cooperativeId, cooperativeId))
    .orderBy(sql`${campagnesTable.anneeDebut} DESC`);
}

export async function listerSimulations(cooperativeId: number) {
  return db
    .select()
    .from(simulationsTable)
    .where(eq(simulationsTable.cooperativeId, cooperativeId))
    .orderBy(sql`${simulationsTable.createdAt} DESC`)
    .limit(50);
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

export async function getAlertesPrevisions(cooperativeId: number) {
  // Campagne ouverte active
  const [campagneActive] = await db
    .select({ id: campagnesTable.id })
    .from(campagnesTable)
    .where(and(
      eq(campagnesTable.cooperativeId, cooperativeId),
      eq(campagnesTable.statut, "ouverte"),
    ));

  const alertes: Array<{
    type: string;
    niveau: "rouge" | "orange" | "vert" | "bleu";
    message: string;
    valeur?: number;
  }> = [];

  if (campagneActive) {
    const [prev] = await db
      .select()
      .from(previsionsCampagneTable)
      .where(and(
        eq(previsionsCampagneTable.campagneId, campagneActive.id),
        eq(previsionsCampagneTable.cooperativeId, cooperativeId),
      ));

    if (prev) {
      const ecartTonnage = toNum(prev.ecartTonnagePct);
      const ecartCa = toNum(prev.ecartCaPct);

      if (ecartTonnage < -10) {
        alertes.push({
          type: "tonnage",
          niveau: "rouge",
          message: `Retard tonnage : ${Math.abs(Math.round(ecartTonnage))}% sous l'objectif`,
          valeur: ecartTonnage,
        });
      } else if (ecartTonnage < -5) {
        alertes.push({
          type: "tonnage",
          niveau: "orange",
          message: `Légère baisse tonnage : ${Math.abs(Math.round(ecartTonnage))}% sous l'objectif`,
          valeur: ecartTonnage,
        });
      } else {
        alertes.push({
          type: "tonnage",
          niveau: "vert",
          message: "Tonnage conforme aux prévisions",
          valeur: ecartTonnage,
        });
      }

      if (ecartCa < -10) {
        alertes.push({
          type: "ca",
          niveau: "rouge",
          message: `CA projeté en retard : ${Math.abs(Math.round(ecartCa))}% sous l'objectif`,
          valeur: ecartCa,
        });
      }
    } else {
      alertes.push({
        type: "configuration",
        niveau: "orange",
        message: "Hypothèses de prévision non saisies pour la campagne active",
      });
    }
  } else {
    alertes.push({
      type: "campagne",
      niveau: "bleu",
      message: "Aucune campagne ouverte actuellement",
    });
  }

  // Alerte trésorerie
  const tresorerie = await projeterTresorerie(cooperativeId, 90);
  if (tresorerie.risque_rupture) {
    alertes.push({
      type: "tresorerie",
      niveau: "rouge",
      message: `Risque de rupture de trésorerie dans ${tresorerie.jours_avant_rupture ?? 90} jours`,
      valeur: tresorerie.jours_avant_rupture ?? undefined,
    });
  } else {
    alertes.push({
      type: "tresorerie",
      niveau: "vert",
      message: "Trésorerie à 90 jours sans risque de rupture détecté",
    });
  }

  return { alertes, campagne_active_id: campagneActive?.id ?? null };
}
