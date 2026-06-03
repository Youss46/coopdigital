/**
 * Service de calcul des bulletins de paie – règles OHADA / Côte d'Ivoire
 *
 * Taux légaux appliqués :
 *   CNPS salariale  :  3,20 % du brut (plafond 1 647 315 FCFA/an)
 *   CNPS patronale  :  7,70 % + AT/MP  2,00 % = 9,70 %
 *   Taxe apprentissage : 0,50 %
 *   FPC              :  1,20 %
 *
 *  ITS — barème progressif annuel :
 *    0 – 600 000        →  0 %
 *    600 001 – 1 200 000 → 10 %
 *    1 200 001 – 2 400 000 → 15 %
 *    2 400 001 – 4 800 000 → 20 %
 *    > 4 800 000         → 25 %
 *
 *  Prime d'ancienneté (sur salaire de base) :
 *    < 2 ans → 0 %   |  2–5 ans → 3 %  |  5–10 ans → 5 %  |  > 10 ans → 8 %
 */

import { db as defaultDb } from "@workspace/db";
import {
  personnelTable,
  composantesSalaireTable,
  bulletinsPaieTable,
  lignesBulletinTable,
  avancesPersonnelTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ─── Constantes ───────────────────────────────────────────────────────────────

const CNPS_SALARIALE_RATE = 320;      // 3,20 × 100
const CNPS_PATRONALE_RATE = 970;      // 9,70 × 100
const TAXE_APPRENTISSAGE_RATE = 50;   // 0,50 × 100
const FPC_RATE = 120;                 // 1,20 × 100
const CNPS_PLAFOND_ANNUEL = 1_647_315;

const NOMS_MOIS = [
  "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// ─── Barème ITS ──────────────────────────────────────────────────────────────

function calculerITS(salaireAnnuelBrut: number): number {
  const tranches = [
    { min: 0,         max: 600_000,         rate: 0 },
    { min: 600_000,   max: 1_200_000,        rate: 0.10 },
    { min: 1_200_000, max: 2_400_000,        rate: 0.15 },
    { min: 2_400_000, max: 4_800_000,        rate: 0.20 },
    { min: 4_800_000, max: Infinity,         rate: 0.25 },
  ];

  let its = 0;
  for (const t of tranches) {
    if (salaireAnnuelBrut <= t.min) break;
    const tranchable = Math.min(salaireAnnuelBrut, t.max) - t.min;
    its += tranchable * t.rate;
  }
  return Math.round(its / 12);
}

// ─── Prime d'ancienneté ──────────────────────────────────────────────────────

function calculerPrimeAnciennete(
  dateEmbaucheSt: string,
  salaireBase: number,
): number {
  const annees =
    (Date.now() - new Date(dateEmbaucheSt).getTime()) / (365.25 * 24 * 3600 * 1000);
  let rate = 0;
  if (annees >= 10) rate = 0.08;
  else if (annees >= 5) rate = 0.05;
  else if (annees >= 2) rate = 0.03;
  return Math.round(salaireBase * rate);
}

// ─── Génération d'un bulletin ────────────────────────────────────────────────

export async function generateBulletin(
  personnelId: number,
  mois: number,
  annee: number,
  cooperativeId: number,
  dbInst = defaultDb,
): Promise<number> {
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

  // 4. Calcul ancienneté
  const primeAnciennete = calculerPrimeAnciennete(
    emp.dateEmbauche,
    emp.salaireBaseFcfa,
  );

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
        : Math.round((emp.salaireBaseFcfa * c.valeur) / 10000); // valeur = % × 100

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

  // 7. Totaux
  const totalAvantages =
    lignesAvantages.reduce((s, l) => s + l.montant, 0);
  const brut = emp.salaireBaseFcfa + totalAvantages;

  // CNPS salariale
  const coupeCnpsAnnuel = Math.min(brut * 12, CNPS_PLAFOND_ANNUEL);
  const cnpsSal = Math.round((coupeCnpsAnnuel * CNPS_SALARIALE_RATE) / 100 / 12 / 100);

  // ITS
  const its = calculerITS(brut * 12);

  lignesRetenues.push({ libelle: "CNPS part salariale (3,20 %)", montant: cnpsSal });
  lignesRetenues.push({ libelle: "Impôt sur salaire (ITS)", montant: its });

  const totalRetenues = lignesRetenues.reduce((s, l) => s + l.montant, 0);
  const net = Math.max(0, brut - totalRetenues);

  // 8. Charges patronales (info employeur uniquement)
  const cnpsPat = Math.round((brut * CNPS_PATRONALE_RATE) / 10000);
  const taxeApp = Math.round((brut * TAXE_APPRENTISSAGE_RATE) / 10000);
  const fpc = Math.round((brut * FPC_RATE) / 10000);
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
      salaireBaseFcfa: emp.salaireBaseFcfa,
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
