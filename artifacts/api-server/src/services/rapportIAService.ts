import {
  db,
  cooperativesTable,
  campagnesTable,
  livraisonsTable,
  lotsTable,
  ventesExportateursTable,
  exportateursTable,
  avancesTable,
  paiementsTable,
  membresTable,
  primesDistributionsTable,
} from "@workspace/db";
import { eq, and, sql, isNotNull } from "drizzle-orm";

export interface RapportKPIs {
  cooperative: { nom: string; ville: string };
  campagne: { anneeDebut: number; anneeFin: number; libelle: string } | null;
  collecte: {
    nbLivraisons: number;
    tonnageTotalKg: number;
    montantBrutFcfa: number;
    nbMembresLivrant: number;
    prixMoyenKgFcfa: number;
  };
  commercialisation: {
    nbLots: number;
    nbLotsVendus: number;
    poidsVenduKg: number;
    caTotalFcfa: number;
    prixMoyenKgFcfa: number;
    nbVentes: number;
  };
  finances: {
    avancesOctroTotalFcfa: number;
    avancesRembourseesFcfa: number;
    avancesEnCoursFcfa: number;
    paiementsTotalFcfa: number;
    nbPaiements: number;
    primesDistribueesFcfa: number;
    nbDistributions: number;
  };
  membres: {
    nbTotal: number;
    nbActifs: number;
    nbInactifs: number;
  };
}

export async function getKPIs(
  cooperativeId: number,
  campagneId?: number
): Promise<RapportKPIs> {
  // ── Coopérative ─────────────────────────────────────────────────────────────
  const [coop] = await db
    .select({ nom: cooperativesTable.nom, ville: cooperativesTable.ville })
    .from(cooperativesTable)
    .where(eq(cooperativesTable.id, cooperativeId))
    .limit(1);

  // ── Campagne ─────────────────────────────────────────────────────────────────
  let campagne: RapportKPIs["campagne"] = null;
  if (campagneId) {
    const [c] = await db
      .select({ anneeDebut: campagnesTable.anneeDebut, anneeFin: campagnesTable.anneeFin })
      .from(campagnesTable)
      .where(and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (c) {
      campagne = { ...c, libelle: `${c.anneeDebut}/${c.anneeFin}` };
    }
  }

  // livraisonsTable n'a pas de cooperativeId — join via membresTable
  const livCampagneFilter = campagneId
    ? and(eq(membresTable.cooperativeId, cooperativeId), eq(livraisonsTable.campagneId, campagneId))
    : eq(membresTable.cooperativeId, cooperativeId);

  // ── Collecte ─────────────────────────────────────────────────────────────────
  const [collecteRow] = await db
    .select({
      nbLivraisons: sql<number>`count(${livraisonsTable.id})::int`,
      tonnageTotalKg: sql<number>`coalesce(sum(${livraisonsTable.poidsNetKg}::numeric), 0)::float`,
      montantBrutFcfa: sql<number>`coalesce(sum(${livraisonsTable.montantBrutFcfa}), 0)::bigint`,
      nbMembresLivrant: sql<number>`count(distinct ${livraisonsTable.membreId})::int`,
    })
    .from(livraisonsTable)
    .innerJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
    .where(livCampagneFilter);

  const tonnage = collecteRow?.tonnageTotalKg ?? 0;
  const montantBrut = Number(collecteRow?.montantBrutFcfa ?? 0);
  const prixMoyenCollecte = tonnage > 0 ? Math.round(montantBrut / tonnage) : 0;

  // ── Commercialisation ─────────────────────────────────────────────────────────
  const lotsFilter = campagneId
    ? and(eq(lotsTable.cooperativeId, cooperativeId), eq(lotsTable.campagneId, campagneId))
    : eq(lotsTable.cooperativeId, cooperativeId);

  const [lotsRow] = await db
    .select({
      nbLots: sql<number>`count(*)::int`,
      nbLotsVendus: sql<number>`count(*) filter (where ${lotsTable.statut} = 'vendu')::int`,
    })
    .from(lotsTable)
    .where(lotsFilter);

  // ventesExportateursTable n'a pas de cooperativeId — join via exportateursTable
  const ventesFilter = campagneId
    ? and(eq(exportateursTable.cooperativeId, cooperativeId), eq(ventesExportateursTable.campagneId, campagneId))
    : eq(exportateursTable.cooperativeId, cooperativeId);

  const [ventesRow] = await db
    .select({
      nbVentes: sql<number>`count(${ventesExportateursTable.id})::int`,
      poidsVenduKg: sql<number>`coalesce(sum(${ventesExportateursTable.poidsKg}::numeric), 0)::float`,
      caTotalFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.montantTotalFcfa}), 0)::bigint`,
    })
    .from(ventesExportateursTable)
    .innerJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
    .where(ventesFilter);

  const poidsVendu = ventesRow?.poidsVenduKg ?? 0;
  const caTotal = Number(ventesRow?.caTotalFcfa ?? 0);
  const prixMoyenVente = poidsVendu > 0 ? Math.round(caTotal / poidsVendu) : 0;

  // ── Finances — Avances ────────────────────────────────────────────────────────
  const [avancesRow] = await db
    .select({
      totalOctroi: sql<number>`coalesce(sum(${avancesTable.montantOctroyeFcfa}), 0)::bigint`,
      totalRembourse: sql<number>`coalesce(sum(${avancesTable.montantRembourse_fcfa}), 0)::bigint`,
    })
    .from(avancesTable)
    .innerJoin(membresTable, eq(membresTable.id, avancesTable.membreId))
    .where(eq(membresTable.cooperativeId, cooperativeId));

  const avancesOctroi = Number(avancesRow?.totalOctroi ?? 0);
  const avancesRembourses = Number(avancesRow?.totalRembourse ?? 0);

  // ── Finances — Paiements ──────────────────────────────────────────────────────
  const [paiementsRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${paiementsTable.montantFcfa}), 0)::bigint`,
      nb: sql<number>`count(*)::int`,
    })
    .from(paiementsTable)
    .innerJoin(membresTable, eq(membresTable.id, paiementsTable.membreId))
    .where(and(eq(membresTable.cooperativeId, cooperativeId), isNotNull(paiementsTable.membreId)));

  // ── Finances — Primes ─────────────────────────────────────────────────────────
  const [primesRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${primesDistributionsTable.montantDistribueFcfa}), 0)::bigint`,
      nb: sql<number>`count(*)::int`,
    })
    .from(primesDistributionsTable)
    .where(and(eq(primesDistributionsTable.cooperativeId, cooperativeId), eq(primesDistributionsTable.statut, "validee")));

  // ── Membres ───────────────────────────────────────────────────────────────────
  const [membresRow] = await db
    .select({
      nbTotal: sql<number>`count(*)::int`,
      nbActifs: sql<number>`count(*) filter (where ${membresTable.statut} = 'actif')::int`,
    })
    .from(membresTable)
    .where(eq(membresTable.cooperativeId, cooperativeId));

  const nbTotal = membresRow?.nbTotal ?? 0;
  const nbActifs = membresRow?.nbActifs ?? 0;

  return {
    cooperative: { nom: coop?.nom ?? "N/A", ville: coop?.ville ?? "N/A" },
    campagne,
    collecte: {
      nbLivraisons: collecteRow?.nbLivraisons ?? 0,
      tonnageTotalKg: Math.round(tonnage * 10) / 10,
      montantBrutFcfa: montantBrut,
      nbMembresLivrant: collecteRow?.nbMembresLivrant ?? 0,
      prixMoyenKgFcfa: prixMoyenCollecte,
    },
    commercialisation: {
      nbLots: lotsRow?.nbLots ?? 0,
      nbLotsVendus: lotsRow?.nbLotsVendus ?? 0,
      poidsVenduKg: Math.round(poidsVendu * 10) / 10,
      caTotalFcfa: caTotal,
      prixMoyenKgFcfa: prixMoyenVente,
      nbVentes: ventesRow?.nbVentes ?? 0,
    },
    finances: {
      avancesOctroTotalFcfa: avancesOctroi,
      avancesRembourseesFcfa: avancesRembourses,
      avancesEnCoursFcfa: Math.max(0, avancesOctroi - avancesRembourses),
      paiementsTotalFcfa: Number(paiementsRow?.total ?? 0),
      nbPaiements: paiementsRow?.nb ?? 0,
      primesDistribueesFcfa: Number(primesRow?.total ?? 0),
      nbDistributions: primesRow?.nb ?? 0,
    },
    membres: {
      nbTotal,
      nbActifs,
      nbInactifs: nbTotal - nbActifs,
    },
  };
}

const SECTIONS_MAP: Record<string, string> = {
  resume: "Résumé exécutif",
  collecte: "Collecte & Production",
  commercialisation: "Commercialisation",
  finances: "Situation financière",
  membres: "Gouvernance & Membres",
  recommandations: "Recommandations stratégiques",
};

export function buildPrompt(kpis: RapportKPIs, sections: string[]): { system: string; user: string } {
  const sectionLabels = sections.map((s) => SECTIONS_MAP[s] ?? s).join(", ");
  const fcfa = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " FCFA";
  const kg = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n)) + " kg";

  const dataBlock = {
    cooperative: kpis.cooperative,
    periode: kpis.campagne
      ? `Campagne ${kpis.campagne.libelle}`
      : "Cumul toutes campagnes",
    collecte: {
      "Nombre de livraisons": kpis.collecte.nbLivraisons,
      "Tonnage total": kg(kpis.collecte.tonnageTotalKg),
      "Montant brut collecte": fcfa(kpis.collecte.montantBrutFcfa),
      "Membres ayant livré": kpis.collecte.nbMembresLivrant,
      "Prix moyen collecte/kg": fcfa(kpis.collecte.prixMoyenKgFcfa),
    },
    commercialisation: {
      "Lots constitués": kpis.commercialisation.nbLots,
      "Lots vendus": kpis.commercialisation.nbLotsVendus,
      "Poids vendu total": kg(kpis.commercialisation.poidsVenduKg),
      "Chiffre d'affaires": fcfa(kpis.commercialisation.caTotalFcfa),
      "Prix moyen vente/kg": fcfa(kpis.commercialisation.prixMoyenKgFcfa),
      "Nombre de ventes": kpis.commercialisation.nbVentes,
    },
    finances: {
      "Avances octroyées": fcfa(kpis.finances.avancesOctroTotalFcfa),
      "Avances remboursées": fcfa(kpis.finances.avancesRembourseesFcfa),
      "Avances en cours": fcfa(kpis.finances.avancesEnCoursFcfa),
      "Paiements membres effectués": fcfa(kpis.finances.paiementsTotalFcfa),
      "Nombre de paiements": kpis.finances.nbPaiements,
      "Primes distribuées": fcfa(kpis.finances.primesDistribueesFcfa),
      "Distributions de primes": kpis.finances.nbDistributions,
    },
    membres: {
      "Total membres": kpis.membres.nbTotal,
      "Membres actifs": kpis.membres.nbActifs,
      "Membres inactifs": kpis.membres.nbInactifs,
      "Taux d'activité": kpis.membres.nbTotal > 0
        ? `${Math.round((kpis.membres.nbActifs / kpis.membres.nbTotal) * 100)}%`
        : "N/A",
    },
  };

  const system = `Vous êtes un expert en gestion de coopératives agricoles en Côte d'Ivoire, spécialisé dans la filière cacao et les normes de gouvernance coopérative (OHADA). Vous rédigez des rapports de gestion professionnels destinés aux conseils d'administration et aux auditeurs. Votre style est formel, analytique, et précis. Vous utilisez toujours des données chiffrées pour étayer vos analyses.`;

  const user = `Rédigez un rapport de gestion professionnel en français pour la coopérative **${kpis.cooperative.nom}** (${kpis.cooperative.ville}), couvrant la période : ${dataBlock.periode}.

**Données disponibles :**
\`\`\`json
${JSON.stringify(dataBlock, null, 2)}
\`\`\`

**Sections à rédiger (dans cet ordre) :** ${sectionLabels}

**Instructions de format :**
- Utilisez le markdown : ## pour les sections, ### pour les sous-sections
- Incluez des tableaux récapitulatifs avec les chiffres clés au début de chaque section
- Analysez les performances, identifiez les tendances, et formulez des observations stratégiques
- La section "Résumé exécutif" doit tenir en 150 mots maximum et mettre en évidence 3 points essentiels
- La section "Recommandations stratégiques" doit proposer 4 à 6 actions concrètes, priorisées, avec justification
- Ton : professionnel, direct, orienté décision
- Commencez directement par le contenu (pas de préambule ni "Voici le rapport...")`;

  return { system, user };
}
