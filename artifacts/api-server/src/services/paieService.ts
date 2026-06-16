/**
 * Service de calcul des bulletins de paie – règles OHADA / Côte d'Ivoire
 *
 * Taux légaux appliqués :
 *   CNPS salariale  :  3,20 % du brut (plafond 1 647 315 FCFA/an)
 *   CNPS patronale  :  7,70 % + AT/MP  2,00 % = 9,70 %
 *   Taxe apprentissage : 0,50 %
 *   FPC              :  1,20 %
 *
 *  ITS — barème progressif mensuel (appliqué sur le brut mensuel) :
 *    0 – 75 000           →  0 %
 *    75 001 – 240 000     → 16 %
 *    240 001 – 800 000    → 21 %
 *    800 001 – 2 400 000  → 24 %
 *    2 400 001 – 8 000 000 → 28 %
 *    > 8 000 000          → 32 %
 *
 *  Prime d'ancienneté (Convention Collective Interprofessionnelle CI) :
 *    Calculée sur le salaire de base de la catégorie professionnelle.
 *    < 2 ans → 0 %  |  de 2 à 25 ans → taux = ancienneté en années entières %
 *    Ex : 2 ans = 2 %, 5 ans = 5 %, 10 ans = 10 %, 25 ans+ → plafonné à 25 %
 */

import { db as defaultDb } from "@workspace/db";
import {
  personnelTable,
  composantesSalaireTable,
  bulletinsPaieTable,
  lignesBulletinTable,
  avancesPersonnelTable,
  configPaieTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ─── Config paie (chargée depuis la DB, avec valeurs par défaut légales CI) ──

const DEFAULT_CONFIG = {
  cnpsSalarialeActif: true, cnpsSalarialeTaux: 320, cnpsPlafondAnnuel: 1_647_315,
  cnpsPatronaleActif: true, cnpsPatronaleTaux: 770,
  cnpsAtmpActif: true,      cnpsAtmpTaux: 200,
  itsActif: true,
  taxeApprentissageActif: true, taxeApprentissageTaux: 50,
  fpcActif: true,               fpcTaux: 120,
  ancienneteActif: true,
  smigFcfa: 75_000,
};

type PaieConfig = typeof DEFAULT_CONFIG;

async function loadConfigPaie(cooperativeId: number, dbInst = defaultDb): Promise<PaieConfig> {
  const [row] = await dbInst.select().from(configPaieTable)
    .where(eq(configPaieTable.cooperativeId, cooperativeId)).limit(1);
  if (!row) return DEFAULT_CONFIG;
  return {
    cnpsSalarialeActif:     row.cnpsSalarialeActif,
    cnpsSalarialeTaux:      row.cnpsSalarialeTaux,
    cnpsPlafondAnnuel:      row.cnpsPlafondAnnuel,
    cnpsPatronaleActif:     row.cnpsPatronaleActif,
    cnpsPatronaleTaux:      row.cnpsPatronaleTaux,
    cnpsAtmpActif:          row.cnpsAtmpActif,
    cnpsAtmpTaux:           row.cnpsAtmpTaux,
    itsActif:               row.itsActif,
    taxeApprentissageActif: row.taxeApprentissageActif,
    taxeApprentissageTaux:  row.taxeApprentissageTaux,
    fpcActif:               row.fpcActif,
    fpcTaux:                row.fpcTaux,
    ancienneteActif:        row.ancienneteActif,
    smigFcfa:               row.smigFcfa,
  };
}

const NOMS_MOIS = [
  "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// ─── Barème ITS ──────────────────────────────────────────────────────────────
// Barème progressif mensuel (Côte d'Ivoire – DGI 2024)
// Appliqué directement sur le salaire brut mensuel.

function calculerITS(salaireMensuelBrut: number): number {
  const tranches = [
    { min: 0,           max: 75_000,         rate: 0    },
    { min: 75_000,      max: 240_000,        rate: 0.16 },
    { min: 240_000,     max: 800_000,        rate: 0.21 },
    { min: 800_000,     max: 2_400_000,      rate: 0.24 },
    { min: 2_400_000,   max: 8_000_000,      rate: 0.28 },
    { min: 8_000_000,   max: Infinity,       rate: 0.32 },
  ];

  let its = 0;
  for (const t of tranches) {
    if (salaireMensuelBrut <= t.min) break;
    const tranchable = Math.min(salaireMensuelBrut, t.max) - t.min;
    its += tranchable * t.rate;
  }
  return Math.round(its);
}

// ─── Prime d'ancienneté ──────────────────────────────────────────────────────

function calculerPrimeAnciennete(
  dateEmbaucheSt: string,
  salaireBase: number,
): number {
  const anneesExactes =
    (Date.now() - new Date(dateEmbaucheSt).getTime()) / (365.25 * 24 * 3600 * 1000);
  const anneesEntieres = Math.floor(anneesExactes);
  // Convention Collective Interprofessionnelle CI :
  // taux = 1 % par année entière d'ancienneté, à partir de 2 ans, plafonné à 25 %
  if (anneesEntieres < 2) return 0;
  const tauxPourcent = Math.min(anneesEntieres, 25);
  return Math.round(salaireBase * tauxPourcent / 100);
}

// ─── Génération d'un bulletin ────────────────────────────────────────────────

export async function generateBulletin(
  personnelId: number,
  mois: number,
  annee: number,
  cooperativeId: number,
  dbInst = defaultDb,
): Promise<number> {
  // 0. Charger la configuration des taux
  const cfg = await loadConfigPaie(cooperativeId, dbInst);

  // 1. Personnel
  const [emp] = await dbInst
    .select()
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.id, personnelId),
        eq(personnelTable.cooperativeId, cooperativeId),
        eq(personnelTable.statut, "actif"),
      ),
    )
    .limit(1);

  if (!emp) throw new Error(`Personnel ${personnelId} introuvable ou inactif`);

  // 2. Bulletin déjà existant ?
  const [existing] = await dbInst
    .select({ id: bulletinsPaieTable.id })
    .from(bulletinsPaieTable)
    .where(
      and(
        eq(bulletinsPaieTable.personnelId, personnelId),
        eq(bulletinsPaieTable.mois, mois),
        eq(bulletinsPaieTable.annee, annee),
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  // 3. Composantes actives de la coop
  const composantes = await dbInst
    .select()
    .from(composantesSalaireTable)
    .where(eq(composantesSalaireTable.cooperativeId, cooperativeId));

  // 4. Base effective : SMIG comme plancher légal
  const baseEffective = Math.max(emp.salaireBaseFcfa, cfg.smigFcfa);

  // 5. Calcul ancienneté (si activée dans la config)
  const primeAnciennete = cfg.ancienneteActif
    ? calculerPrimeAnciennete(emp.dateEmbauche, baseEffective)
    : 0;

  // 5. Lignes avantages personnalisés
  const lignesAvantages: { libelle: string; montant: number }[] = [];
  const lignesRetenues: { libelle: string; montant: number }[] = [];

  if (emp.sursalaireFcfa > 0) {
    lignesAvantages.push({ libelle: "Sursalaire", montant: emp.sursalaireFcfa });
  }
  if (primeAnciennete > 0) {
    lignesAvantages.push({
      libelle: "Prime d'ancienneté",
      montant: primeAnciennete,
    });
  }

  for (const c of composantes) {
    const montant =
      c.calcul === "fixe"
        ? c.valeur
        : Math.round((baseEffective * c.valeur) / 10000); // valeur = % × 100

    if (c.type === "avantage") {
      lignesAvantages.push({ libelle: c.libelle, montant });
    } else {
      lignesRetenues.push({ libelle: c.libelle, montant });
    }
  }

  // 6. Avances en cours → retenue automatique
  const avancesEnCours = await dbInst
    .select()
    .from(avancesPersonnelTable)
    .where(
      and(
        eq(avancesPersonnelTable.personnelId, personnelId),
        eq(avancesPersonnelTable.statut, "en_cours"),
      ),
    );

  const totalAvance = avancesEnCours.reduce(
    (sum, a) => sum + (a.montantFcfa - a.montantRembourse),
    0,
  );
  if (totalAvance > 0) {
    lignesRetenues.push({
      libelle: "Avance sur salaire",
      montant: totalAvance,
    });
  }

  // 8. Totaux
  const totalAvantages =
    lignesAvantages.reduce((s, l) => s + l.montant, 0);
  const brut = baseEffective + totalAvantages;

  // CNPS salariale (retenue employé)
  let cnpsSal = 0;
  if (cfg.cnpsSalarialeActif) {
    const coupeCnpsAnnuel = Math.min(brut * 12, cfg.cnpsPlafondAnnuel);
    cnpsSal = Math.round((coupeCnpsAnnuel * cfg.cnpsSalarialeTaux) / 100 / 12 / 100);
    const taux = (cfg.cnpsSalarialeTaux / 100).toFixed(2).replace(".", ",");
    lignesRetenues.push({ libelle: `CNPS part salariale (${taux} %)`, montant: cnpsSal });
  }

  // ITS (barème mensuel, appliqué sur le brut mensuel)
  let its = 0;
  if (cfg.itsActif) {
    its = calculerITS(brut);
    lignesRetenues.push({ libelle: "Impôt sur salaire (ITS)", montant: its });
  }

  const totalRetenues = lignesRetenues.reduce((s, l) => s + l.montant, 0);
  const net = Math.max(0, brut - totalRetenues);

  // 8. Charges patronales (info employeur uniquement)
  const cnpsPat = cfg.cnpsPatronaleActif
    ? Math.round((brut * cfg.cnpsPatronaleTaux) / 10000) + (cfg.cnpsAtmpActif ? Math.round((brut * cfg.cnpsAtmpTaux) / 10000) : 0)
    : (cfg.cnpsAtmpActif ? Math.round((brut * cfg.cnpsAtmpTaux) / 10000) : 0);
  const taxeApp = cfg.taxeApprentissageActif ? Math.round((brut * cfg.taxeApprentissageTaux) / 10000) : 0;
  const fpc     = cfg.fpcActif ? Math.round((brut * cfg.fpcTaux) / 10000) : 0;
  const coutTotalEmployeur =
    net + totalRetenues + cnpsPat + taxeApp + fpc;

  // 9. Création du bulletin + lignes (transaction)
  const [bulletin] = await dbInst
    .insert(bulletinsPaieTable)
    .values({
      personnelId,
      cooperativeId,
      mois,
      annee,
      periode: `${NOMS_MOIS[mois] ?? mois} ${annee}`,
      salaireBaseFcfa: baseEffective,
      totalAvantagesFcfa: totalAvantages,
      totalRetenuesFcfa: totalRetenues,
      salaireBrutFcfa: brut,
      salaireNetFcfa: net,
      chargesCnpsPatronaleFcfa: cnpsPat,
      chargesTaxeApprentissageFcfa: taxeApp,
      chargesFpcFcfa: fpc,
      coutTotalEmployeurFcfa: coutTotalEmployeur,
    })
    .returning({ id: bulletinsPaieTable.id });

  if (!bulletin) throw new Error("Impossible de créer le bulletin");

  const lignesInsert = [
    ...lignesAvantages.map((l) => ({
      bulletinId: bulletin.id,
      libelle: l.libelle,
      type: "avantage" as const,
      montantFcfa: l.montant,
    })),
    ...lignesRetenues.map((l) => ({
      bulletinId: bulletin.id,
      libelle: l.libelle,
      type: "retenue" as const,
      montantFcfa: l.montant,
    })),
  ];

  if (lignesInsert.length > 0) {
    await dbInst.insert(lignesBulletinTable).values(lignesInsert);
  }

  // 10. Marquer les avances comme remboursées (si déduites en intégralité)
  for (const av of avancesEnCours) {
    await dbInst
      .update(avancesPersonnelTable)
      .set({
        statut: "rembourse",
        montantRembourse: av.montantFcfa,
      })
      .where(eq(avancesPersonnelTable.id, av.id));
  }

  return bulletin.id;
}

// ─── Génération masse salariale ──────────────────────────────────────────────

export async function generateMasse(
  cooperativeId: number,
  mois: number,
  annee: number,
  dbInst = defaultDb,
): Promise<{ personnelId: number; bulletinId: number; erreur?: string }[]> {
  const actifs = await dbInst
    .select({ id: personnelTable.id })
    .from(personnelTable)
    .where(
      and(
        eq(personnelTable.cooperativeId, cooperativeId),
        eq(personnelTable.statut, "actif"),
      ),
    );

  const results = await Promise.allSettled(
    actifs.map((p) =>
      generateBulletin(p.id, mois, annee, cooperativeId, dbInst),
    ),
  );

  return actifs.map((p, i) => {
    const r = results[i];
    if (r && r.status === "fulfilled") {
      return { personnelId: p.id, bulletinId: r.value };
    }
    return {
      personnelId: p.id,
      bulletinId: -1,
      erreur: r?.status === "rejected" ? String(r.reason) : "Inconnu",
    };
  });
}
