import {
  db,
  obligationsFiscalesTable,
  declarationsFiscalesTable,
  ecrituresComptablesTable,
  comptesMobilesMarchandsTable,
  mouvementsMobileMarchandTable,
  comptesBancairesTable,
  mouvementsBanqueTable,
  caissesTable,
  sessionsCaisseTable,
  mouvementsCaisseTable,
  bulletinsPaieTable,
  lignesBulletinTable,
  personnelTable,
  configPaieTable,
  chargesDiversesTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, or, inArray } from "drizzle-orm";
import { assignerNumeroPiece } from "../lib/numeroPiece.js";
import { logger } from "../lib/logger.js";
import PDFDocument from "pdfkit";
import { drawHeader, drawFooter } from "./pdfHeaderService.js";


// ─── Comptes OHADA par type de taxe ───────────────────────────────────────────
const COMPTE_DEBIT: Record<string, string> = {
  cnps:               "431",
  its:                "444",
  tva:                "4431",
  impot_societes:     "441",
  taxe_apprentissage: "447",
  fpc:                "447",
  autre:              "447",
  ppsi:               "447",
};

type ModePaiementFiscal = "especes" | "mobile_marchand" | "virement" | "cheque";

function nomMois(m: number): string {
  return ["Janvier","Février","Mars","Avril","Mai","Juin",
          "Juillet","Août","Septembre","Octobre","Novembre","Décembre"][m - 1]!;
}

function dateEcheanceMensuelle(mois: number, annee: number, jour: number): string {
  // Échéance le `jour` du mois suivant
  let m = mois + 1; let a = annee;
  if (m > 12) { m = 1; a++; }
  return `${a}-${String(m).padStart(2,"0")}-${String(jour).padStart(2,"0")}`;
}

function dateEcheanceAnnuelle(annee: number, jourEcheance: number, typeTaxe: string): string {
  // TA/FPC : 31/03 de l'année suivante
  // IS     : 30/04 de l'année suivante
  if (typeTaxe === "impot_societes") return `${annee + 1}-04-30`;
  return `${annee + 1}-03-31`;
}

// ─── Obligations ──────────────────────────────────────────────────────────────

export async function listObligations(cooperativeId: number) {
  return db.select().from(obligationsFiscalesTable)
    .where(and(eq(obligationsFiscalesTable.cooperativeId, cooperativeId),
               eq(obligationsFiscalesTable.actif, true)));
}

export async function listObligationsAll(cooperativeId: number) {
  const result = await db.execute<{
    id: number; cooperative_id: number; type_taxe: string; libelle: string;
    base_calcul: string | null; taux_pct: string | null; taux_modifie_annee: number | null; periodicite: string;
    jour_echeance: number | null; actif: boolean; created_at: string;
  }>(sql`
     SELECT id, cooperative_id, type_taxe, libelle, base_calcul, taux_pct::text,
            taux_modifie_annee, periodicite, jour_echeance, actif, created_at::text
    FROM obligations_fiscales
    WHERE cooperative_id = ${cooperativeId}
    ORDER BY periodicite, type_taxe, id
  `);
  return result.rows;
}
const OBLIGATIONS_CI = [
  { typeTaxe: "cnps",              libelle: "CNPS — Part salariale",              periodicite: "mensuel", jourEcheance: 15, tauxPct: "3.20", baseCalcul: "Salaire brut plafonné" },
  { typeTaxe: "cnps",              libelle: "CNPS — Part patronale",              periodicite: "mensuel", jourEcheance: 15, tauxPct: "7.70", baseCalcul: "Salaire brut plafonné" },
  { typeTaxe: "its",               libelle: "ITS — Impôt sur traitements et salaires", periodicite: "mensuel", jourEcheance: 15, tauxPct: null,   baseCalcul: "Barème progressif DGI" },
  { typeTaxe: "taxe_apprentissage",libelle: "Taxe d'Apprentissage (TA)",          periodicite: "annuel",  jourEcheance: 30, tauxPct: "0.50", baseCalcul: "Masse salariale annuelle brute" },
  { typeTaxe: "fpc",               libelle: "Formation Professionnelle Continue (FPC)", periodicite: "annuel", jourEcheance: 31, tauxPct: "0.60", baseCalcul: "Masse salariale annuelle brute" },
  { typeTaxe: "impot_societes",    libelle: "Impôt sur les Sociétés (IS)",        periodicite: "annuel",  jourEcheance: 30, tauxPct: "25.00", baseCalcul: "Bénéfice net imposable" },
  { typeTaxe: "tse",               libelle: "TSE — Taxe Spéciale d'Équipement",   periodicite: "mensuel", jourEcheance: 20, tauxPct: "0.10", baseCalcul: "Chiffre d'affaires mensuel" },
  { typeTaxe: "ppsi",              libelle: "PPSI — Retenue sur prestations du secteur informel", periodicite: "mensuel", jourEcheance: 20, tauxPct: "2.00", baseCalcul: "Montant brut des prestations informelles validées" },
] as const;

/** Taux courant de retenue PPSI, configuré par coopérative (défaut légal 2%). */
export async function getTauxPpsi(cooperativeId: number): Promise<number> {
  const [obligation] = await db.select({ tauxPct: obligationsFiscalesTable.tauxPct })
    .from(obligationsFiscalesTable)
    .where(and(
      eq(obligationsFiscalesTable.cooperativeId, cooperativeId),
      eq(obligationsFiscalesTable.typeTaxe, "ppsi"),
      eq(obligationsFiscalesTable.actif, true),
    ))
    .limit(1);
  const taux = obligation?.tauxPct == null ? 2 : parseFloat(obligation.tauxPct);
  return Number.isFinite(taux) && taux >= 0 && taux <= 100 ? taux : 2;
}

/** Retenue PPSI bornée au brut, y compris pour une configuration historique. */
export function calculerRetenuePpsi(brutInput: number, tauxPctInput: number): number {
  const brut = Number.isFinite(brutInput) ? Math.max(0, Math.round(brutInput)) : 0;
  const taux = Number.isFinite(tauxPctInput) ? Math.min(100, Math.max(0, tauxPctInput)) : 0;
  return Math.min(brut, Math.max(0, Math.round(brut * taux / 100)));
}
export async function initObligationsCI(cooperativeId: number): Promise<{ creees: number; dejaPresentes: number }> {
  const existantes = await db.select({ typeTaxe: obligationsFiscalesTable.typeTaxe, libelle: obligationsFiscalesTable.libelle })
    .from(obligationsFiscalesTable)
    .where(eq(obligationsFiscalesTable.cooperativeId, cooperativeId));

  const cles = new Set(existantes.map(o => `${o.typeTaxe}|${o.libelle}`));
  let creees = 0;

  for (const obl of OBLIGATIONS_CI) {
    const cle = `${obl.typeTaxe}|${obl.libelle}`;
    if (cles.has(cle)) continue;
    await db.insert(obligationsFiscalesTable).values({
      cooperativeId,
      typeTaxe:     obl.typeTaxe,
      libelle:      obl.libelle,
      periodicite:  obl.periodicite,
      jourEcheance: obl.jourEcheance,
      tauxPct:      obl.tauxPct ?? undefined,
      baseCalcul:   obl.baseCalcul,
      actif:        true,
    });
    creees++;
  }

  return { creees, dejaPresentes: OBLIGATIONS_CI.length - creees };
}

// ─── Calcul base depuis bulletins ─────────────────────────────────────────────

async function getBasesCnpsIts(cooperativeId: number, mois: number, annee: number) {
  const ZERO = { totalBrut: 0, totalCnpsPatr: 0, totalTa: 0, totalFpc: 0, totalIts: 0 };
  try {
    const bulletins = await db.select({
      id: bulletinsPaieTable.id,
      salaireBrut: bulletinsPaieTable.salaireBrutFcfa,
      cnpsPatronale: bulletinsPaieTable.chargesCnpsPatronaleFcfa,
      taCharge: bulletinsPaieTable.chargesTaxeApprentissageFcfa,
      fpcCharge: bulletinsPaieTable.chargesFpcFcfa,
    }).from(bulletinsPaieTable)
      .where(and(
        eq(bulletinsPaieTable.cooperativeId, cooperativeId),
        eq(bulletinsPaieTable.mois, mois),
        eq(bulletinsPaieTable.annee, annee),
        eq(bulletinsPaieTable.statut, "paye"),
      ));

    const totalBrut     = bulletins.reduce((s, b) => s + (b.salaireBrut ?? 0), 0);
    const totalCnpsPatr = bulletins.reduce((s, b) => s + (b.cnpsPatronale ?? 0), 0);
    const totalTa       = bulletins.reduce((s, b) => s + (b.taCharge ?? 0), 0);
    const totalFpc      = bulletins.reduce((s, b) => s + (b.fpcCharge ?? 0), 0);

    // ITS : somme des lignes retenues libellées ITS
    let totalIts = 0;
    if (bulletins.length > 0) {
      const ids = bulletins.map(b => b.id);
      const lignesIts = await db.select({ montant: lignesBulletinTable.montantFcfa })
        .from(lignesBulletinTable)
        .where(and(
          inArray(lignesBulletinTable.bulletinId, ids),
          eq(lignesBulletinTable.type, "retenue"),
          sql`LOWER(${lignesBulletinTable.libelle}) LIKE '%its%'`
        ));
      totalIts = lignesIts.reduce((s, l) => s + Math.abs(l.montant ?? 0), 0);
    }

    return { totalBrut, totalCnpsPatr, totalTa, totalFpc, totalIts };
  } catch (err) {
    // Table salaires pas encore migrée → bases nulles (déclarations exonérées)
    logger.warn({ err }, "bulletins_paie non disponible — bases CNPS/ITS à zéro");
    return ZERO;
  }
}

async function getBasesAnnuelles(cooperativeId: number, annee: number) {
  const ZERO = { totalBrut: 0, totalCnpsPatr: 0, totalTa: 0, totalFpc: 0 };
  try {
    const result = await db.execute<{
      total_brut: string; total_cnps_patr: string; total_ta: string; total_fpc: string;
    }>(sql`
      SELECT
        COALESCE(SUM(salaire_brut_fcfa), 0)::text            AS total_brut,
        COALESCE(SUM(charges_cnps_patronale_fcfa), 0)::text  AS total_cnps_patr,
        COALESCE(SUM(charges_taxe_apprentissage_fcfa), 0)::text AS total_ta,
        COALESCE(SUM(charges_fpc_fcfa), 0)::text             AS total_fpc
      FROM bulletins_paie
      WHERE cooperative_id = ${cooperativeId}
        AND annee = ${annee}
        AND statut = 'paye'
    `);
    const r = result.rows[0] ?? { total_brut: "0", total_cnps_patr: "0", total_ta: "0", total_fpc: "0" };
    return {
      totalBrut:     parseFloat(r.total_brut),
      totalCnpsPatr: parseFloat(r.total_cnps_patr),
      totalTa:       parseFloat(r.total_ta),
      totalFpc:      parseFloat(r.total_fpc),
    };
  } catch (err) {
    logger.warn({ err }, "bulletins_paie non disponible — bases annuelles à zéro");
    return ZERO;
  }
}

async function getChiffreAffairesAnnuel(cooperativeId: number, annee: number): Promise<number> {
  const result = await db.execute<{ chiffre_affaires: string }>(sql`
    SELECT COALESCE(SUM(montant_fcfa), 0)::text AS chiffre_affaires
    FROM ecritures_comptables
    WHERE cooperative_id = ${cooperativeId}
      AND exercice = ${annee}
      AND compte_credit = '701'
  `);
  return parseFloat(result.rows[0]?.chiffre_affaires ?? "0") || 0;
}

async function getChiffreAffairesMensuel(cooperativeId: number, mois: number, annee: number): Promise<number> {
  const result = await db.execute<{ chiffre_affaires: string }>(sql`
    SELECT COALESCE(SUM(montant_fcfa), 0)::text AS chiffre_affaires
    FROM ecritures_comptables
    WHERE cooperative_id = ${cooperativeId}
      AND date_ecriture >= make_date(${annee}, ${mois}, 1)
      AND date_ecriture < (make_date(${annee}, ${mois}, 1) + INTERVAL '1 month')::date
      AND compte_credit = '701'
  `);
  return parseFloat(result.rows[0]?.chiffre_affaires ?? "0") || 0;
}

async function getPrestationsPpsiMensuelles(cooperativeId: number, mois: number, annee: number): Promise<number> {
  const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const finDate = new Date(annee, mois, 1);
  const fin = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, "0")}-01`;
  const [row] = await db.select({ total: sql<string>`COALESCE(SUM(${chargesDiversesTable.montantFcfa}), 0)` })
    .from(chargesDiversesTable)
    .where(and(
      eq(chargesDiversesTable.cooperativeId, cooperativeId),
      eq(chargesDiversesTable.categorie, "ppsi"),
      eq(chargesDiversesTable.statut, "valide"),
      gte(chargesDiversesTable.dateCharge, debut),
      sql`${chargesDiversesTable.dateCharge} < ${fin}`,
    ));
  return parseFloat(String(row?.total ?? "0")) || 0;
}

// ─── Génération déclarations mensuelles ───────────────────────────────────────

export async function genererDeclarationsMensuelles(cooperativeId: number, mois: number, annee: number) {
  const periode = `${nomMois(mois)} ${annee}`;
  const obligations = await listObligations(cooperativeId);
  const mensuelles = obligations.filter(o => o.periodicite === "mensuel");

  if (mensuelles.length === 0) {
    return { creees: 0, misesAJour: 0, ignorees: 0, aucuneObligation: true };
  }

  const bases = await getBasesCnpsIts(cooperativeId, mois, annee);
  let creees = 0, misesAJour = 0, ignorees = 0;

  for (const obl of mensuelles) {
    let baseImposable = 0;
    let montantCalcule = 0;

    const libelleLC = obl.libelle.toLowerCase();
    if (obl.typeTaxe === "cnps" && (libelleLC.includes("salarial") && !libelleLC.includes("patronal"))) {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.032;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "cnps" && libelleLC.includes("patronal")) {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.077;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "cnps") {
      // CNPS générique sans précision salarial/patronal : on applique le taux configuré sur le brut
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.032;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "its") {
      baseImposable  = bases.totalBrut;
      montantCalcule = bases.totalIts;
    } else if (obl.typeTaxe === "tse") {
      const chiffreAffaires = await getChiffreAffairesMensuel(cooperativeId, mois, annee);
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.001;
      baseImposable  = chiffreAffaires;
      montantCalcule = Math.round(chiffreAffaires * taux);
    } else if (obl.typeTaxe === "ppsi") {
      const brut = await getPrestationsPpsiMensuelles(cooperativeId, mois, annee);
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.02;
      baseImposable = brut;
      montantCalcule = calculerRetenuePpsi(brut, taux * 100);
    }

    const echeance = dateEcheanceMensuelle(mois, annee, obl.jourEcheance ?? 15);

    // Vérifie si une déclaration existe déjà pour cette obligation/période
    const existing = await db.select({
      id: declarationsFiscalesTable.id,
      statut: declarationsFiscalesTable.statut,
    }).from(declarationsFiscalesTable)
      .where(and(
        eq(declarationsFiscalesTable.cooperativeId, cooperativeId),
        eq(declarationsFiscalesTable.obligationId, obl.id),
        eq(declarationsFiscalesTable.periode, periode),
      )).limit(1);

    if (existing.length > 0) {
      const ex = existing[0]!;
      // Si elle était "exonere" (base 0) et que maintenant on a une base, on met à jour
      if (ex.statut === "exonere" && montantCalcule > 0) {
        await db.update(declarationsFiscalesTable)
          .set({
            baseImposableFcfa:  baseImposable.toString(),
            montantCalculeFcfa: montantCalcule.toString(),
            statut:             "a_payer",
          })
          .where(eq(declarationsFiscalesTable.id, ex.id));
        misesAJour++;
      } else {
        ignorees++;
      }
      continue;
    }

    // Nouvelle déclaration
    await db.insert(declarationsFiscalesTable).values({
      cooperativeId:      cooperativeId,
      obligationId:       obl.id,
      periode,
      baseImposableFcfa:  baseImposable.toString(),
      montantCalculeFcfa: montantCalcule.toString(),
      dateEcheance:       echeance,
      statut:             montantCalcule === 0 ? "exonere" : "a_payer",
    });
    creees++;
  }

  return { creees, misesAJour, ignorees, aucuneObligation: false };
}

// ─── Génération déclarations annuelles ────────────────────────────────────────

export async function genererDeclarationsAnnuelles(cooperativeId: number, annee: number) {
  const obligations = await listObligations(cooperativeId);
  const annuelles = obligations.filter(o => o.periodicite === "annuel");
  const bases = await getBasesAnnuelles(cooperativeId, annee);
  const generees: typeof declarationsFiscalesTable.$inferSelect[] = [];

  for (const obl of annuelles) {
    const periode = `${annee}`;
    const existing = await db.select({ id: declarationsFiscalesTable.id })
      .from(declarationsFiscalesTable)
      .where(and(
        eq(declarationsFiscalesTable.cooperativeId, cooperativeId),
        eq(declarationsFiscalesTable.obligationId, obl.id),
        eq(declarationsFiscalesTable.periode, periode),
      )).limit(1);
    if (existing.length > 0) continue;

    let baseImposable = 0;
    let montantCalcule = 0;

    if (obl.typeTaxe === "taxe_apprentissage") {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.005;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "fpc") {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.012;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "impot_societes") {
      baseImposable  = 0;
      montantCalcule = 0; // calculé manuellement par le comptable
    }

    const echeance = dateEcheanceAnnuelle(annee, obl.jourEcheance ?? 31, obl.typeTaxe);

    const [decl] = await db.insert(declarationsFiscalesTable).values({
      cooperativeId:      cooperativeId,
      obligationId:       obl.id,
      periode,
      baseImposableFcfa:  baseImposable.toString(),
      montantCalculeFcfa: montantCalcule.toString(),
      dateEcheance:       echeance,
      statut:             "a_payer",
    }).returning();

    if (decl) generees.push(decl);
  }

  return generees;
}

// ─── Supprimer déclaration ────────────────────────────────────────────────────

export async function supprimerDeclaration(cooperativeId: number, id: number): Promise<void> {
  const [decl] = await db.select({ id: declarationsFiscalesTable.id, statut: declarationsFiscalesTable.statut })
    .from(declarationsFiscalesTable)
    .where(and(
      eq(declarationsFiscalesTable.id, id),
      eq(declarationsFiscalesTable.cooperativeId, cooperativeId),
    )).limit(1);

  if (!decl) throw new Error("Déclaration introuvable");
  if (decl.statut === "paye") throw new Error("Impossible de supprimer une déclaration déjà payée");

  await db.delete(declarationsFiscalesTable)
    .where(and(
      eq(declarationsFiscalesTable.id, id),
      eq(declarationsFiscalesTable.cooperativeId, cooperativeId),
    ));
}

// ─── Recalculer déclaration ───────────────────────────────────────────────────

const MOIS_PARSE: Record<string, number> = {
  "Janvier": 1, "Février": 2, "Mars": 3, "Avril": 4,
  "Mai": 5, "Juin": 6, "Juillet": 7, "Août": 8,
  "Septembre": 9, "Octobre": 10, "Novembre": 11, "Décembre": 12,
};

export async function recalculerDeclaration(cooperativeId: number, id: number): Promise<void> {
  const [decl] = await db.select()
    .from(declarationsFiscalesTable)
    .where(and(
      eq(declarationsFiscalesTable.id, id),
      eq(declarationsFiscalesTable.cooperativeId, cooperativeId),
    )).limit(1);

  if (!decl) throw new Error("Déclaration introuvable");
  if (decl.statut === "paye") throw new Error("Impossible de recalculer une déclaration déjà payée");

  const [obl] = await db.select()
    .from(obligationsFiscalesTable)
    .where(eq(obligationsFiscalesTable.id, decl.obligationId))
    .limit(1);
  if (!obl) throw new Error("Obligation introuvable");

  let baseImposable = 0;
  let montantCalcule = 0;

  if (obl.periodicite === "mensuel") {
    // Période format: "Août 2026"
    const parts = decl.periode.split(" ");
    const mois  = MOIS_PARSE[parts[0]!] ?? 0;
    const annee = parseInt(parts[1] ?? "0", 10);
    if (!mois || !annee) throw new Error(`Période non parseable : ${decl.periode}`);

    const bases = await getBasesCnpsIts(cooperativeId, mois, annee);

    const libelleLC = obl.libelle.toLowerCase();
    if (obl.typeTaxe === "cnps" && (libelleLC.includes("salarial") && !libelleLC.includes("patronal"))) {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.032;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "cnps" && libelleLC.includes("patronal")) {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.077;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "cnps") {
      // CNPS générique : on applique le taux configuré
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.032;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "its") {
      baseImposable  = bases.totalBrut;
      montantCalcule = bases.totalIts;
    } else if (obl.typeTaxe === "tse") {
      const chiffreAffaires = await getChiffreAffairesMensuel(cooperativeId, mois, annee);
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.001;
      baseImposable  = chiffreAffaires;
      montantCalcule = Math.round(chiffreAffaires * taux);
    } else if (obl.typeTaxe === "ppsi") {
      throw new Error("La PPSI est une obligation mensuelle");
    }
  } else {
    // Période annuelle : "2026"
    const annee = parseInt(decl.periode, 10);
    if (!annee) throw new Error(`Période annuelle non parseable : ${decl.periode}`);

    const bases = await getBasesAnnuelles(cooperativeId, annee);

    if (obl.typeTaxe === "taxe_apprentissage") {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.005;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "fpc") {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.012;
      baseImposable  = bases.totalBrut;
      montantCalcule = Math.round(bases.totalBrut * taux);
    } else if (obl.typeTaxe === "tse") {
      const taux = obl.tauxPct != null ? parseFloat(obl.tauxPct) / 100 : 0.001;
      const chiffreAffaires = await getChiffreAffairesAnnuel(cooperativeId, annee);
      baseImposable  = chiffreAffaires;
      montantCalcule = Math.round(chiffreAffaires * taux);
    }
    // IS : montant à renseigner manuellement, on ne touche pas
  }

  await db.update(declarationsFiscalesTable)
    .set({
      baseImposableFcfa:  baseImposable.toString(),
      montantCalculeFcfa: montantCalcule.toString(),
      statut: montantCalcule === 0 ? "exonere" : "a_payer",
      updatedAt: new Date(),
    })
    .where(and(
      eq(declarationsFiscalesTable.id, id),
      eq(declarationsFiscalesTable.cooperativeId, cooperativeId),
    ));
}

// ─── Liste déclarations ───────────────────────────────────────────────────────

export async function listDeclarations(cooperativeId: number, opts?: {
  statut?: string; typeTaxe?: string; periode?: string;
}) {
  const result = await db.execute<{
    id: number; cooperative_id: number; obligation_id: number; periode: string;
    base_imposable_fcfa: string | null; montant_calcule_fcfa: string;
    montant_paye_fcfa: string; date_echeance: string | null;
    date_paiement: string | null; reference_paiement: string | null;
    statut: string; penalite_retard_fcfa: string; document_url: string | null;
    created_at: string; updated_at: string;
    type_taxe: string; libelle: string; periodicite: string;
    jours_retard: number | null;
  }>(sql`
    SELECT
      d.*,
      d.date_echeance::text, d.date_paiement::text,
      d.created_at::text, d.updated_at::text,
      o.type_taxe, o.libelle, o.periodicite,
      CASE WHEN d.statut IN ('a_payer','en_retard') AND d.date_echeance < CURRENT_DATE
        THEN (CURRENT_DATE - d.date_echeance)::integer ELSE NULL END AS jours_retard
    FROM declarations_fiscales d
    JOIN obligations_fiscales o ON o.id = d.obligation_id
    WHERE d.cooperative_id = ${cooperativeId}
      ${opts?.statut   ? sql`AND d.statut = ${opts.statut}`          : sql``}
      ${opts?.typeTaxe ? sql`AND o.type_taxe = ${opts.typeTaxe}`     : sql``}
      ${opts?.periode  ? sql`AND d.periode = ${opts.periode}`        : sql``}
    ORDER BY d.date_echeance DESC NULLS LAST
  `);
  return result.rows;
}

export async function exporterPpsi(cooperativeId: number, mois: number, annee: number): Promise<string> {
  const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const finDate = new Date(annee, mois, 1);
  const fin = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, "0")}-01`;
  const rows = await db.select({
    date: chargesDiversesTable.dateCharge,
    prestataire: chargesDiversesTable.tiers,
    brut: chargesDiversesTable.montantFcfa,
    reference: chargesDiversesTable.referencePiece,
  }).from(chargesDiversesTable)
    .where(and(
      eq(chargesDiversesTable.cooperativeId, cooperativeId),
      eq(chargesDiversesTable.categorie, "ppsi"),
      eq(chargesDiversesTable.statut, "valide"),
      gte(chargesDiversesTable.dateCharge, debut),
      sql`${chargesDiversesTable.dateCharge} < ${fin}`,
    ))
    .orderBy(chargesDiversesTable.dateCharge);

  const taux = await getTauxPpsi(cooperativeId);
  const tauxLibelle = taux.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const csvCell = (value: string | number | null | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [
    ["Période", "Date prestation", "Prestataire", "Montant brut (FCFA)", `Retenue PPSSI (${tauxLibelle} %) (FCFA)`, "Net prestataire (FCFA)", "Référence"].map(csvCell).join(";"),
    ...rows.map(row => {
      const brut = parseFloat(String(row.brut ?? 0)) || 0;
      const retenue = calculerRetenuePpsi(brut, taux);
      return [
        `${nomMois(mois)} ${annee}`, row.date, row.prestataire, Math.round(brut), retenue, Math.round(brut - retenue), row.reference,
      ].map(csvCell).join(";");
    }),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export async function genererPpsiPdf(cooperativeId: number, mois: number, annee: number): Promise<Buffer> {
  const debut = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const finDate = new Date(annee, mois, 1);
  const fin = `${finDate.getFullYear()}-${String(finDate.getMonth() + 1).padStart(2, "0")}-01`;
  const rows = await db.select({
    date: chargesDiversesTable.dateCharge, prestataire: chargesDiversesTable.tiers,
    brut: chargesDiversesTable.montantFcfa, reference: chargesDiversesTable.referencePiece,
  }).from(chargesDiversesTable).where(and(
    eq(chargesDiversesTable.cooperativeId, cooperativeId),
    eq(chargesDiversesTable.categorie, "ppsi"),
    eq(chargesDiversesTable.statut, "valide"),
    gte(chargesDiversesTable.dateCharge, debut),
    sql`${chargesDiversesTable.dateCharge} < ${fin}`,
  )).orderBy(chargesDiversesTable.dateCharge);

  const taux = await getTauxPpsi(cooperativeId);
  const tauxLibelle = taux.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const chunks: Buffer[] = [];
  const fmtFcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;
  const doc = new PDFDocument({ size: "A4", margin: 45 });
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  await drawHeader(doc, cooperativeId, {
    titre_document: "État récapitulatif PPSSI",
    reference: `PPSI-${annee}-${String(mois).padStart(2, "0")}`,
  });
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#1a4731")
    .text(`Retenue PPSSI — ${nomMois(mois)} ${annee}`);
  doc.moveDown(0.4).font("Helvetica").fontSize(9).fillColor("#555")
    .text(`Prestations du secteur informel validées — taux de retenue : ${tauxLibelle} %`);
  let y = doc.y + 18;
  const cols = [45, 112, 270, 385, 475];
  const heads = ["Date", "Prestataire", "Montant brut", `Retenue ${tauxLibelle} %`, "Net"];
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#166534");
  heads.forEach((h, i) => doc.text(h, cols[i]!, y, { width: (cols[i + 1] ?? 550) - cols[i]! - 5 }));
  y += 16;
  let totalBrut = 0, totalRetenue = 0, totalNet = 0;
  doc.font("Helvetica").fontSize(8).fillColor("#222");
  for (const row of rows) {
    const brut = Math.round(parseFloat(String(row.brut ?? 0)) || 0);
    const retenue = calculerRetenuePpsi(brut, taux);
    const net = brut - retenue;
    totalBrut += brut; totalRetenue += retenue; totalNet += net;
    [String(row.date ?? ""), String(row.prestataire ?? "—"), fmtFcfa(brut), fmtFcfa(retenue), fmtFcfa(net)]
      .forEach((v, i) => doc.text(v, cols[i]!, y, { width: (cols[i + 1] ?? 550) - cols[i]! - 5 }));
    y += 16;
    if (y > 750) { doc.addPage(); y = 55; }
  }
  doc.moveTo(45, y).lineTo(550, y).strokeColor("#d1d5db").stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#166534");
  [["TOTAL", 45, 225], [fmtFcfa(totalBrut), 270, 110], [fmtFcfa(totalRetenue), 385, 90], [fmtFcfa(totalNet), 475, 75]]
    .forEach(([v, x, w]) => doc.text(String(v), Number(x), y + 8, { width: Number(w) }));
  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#777")
    .text("Document préparatoire à la déclaration PPSSI sur e-impôts (formulaire unique G n°50).", 45, 780, { width: 505 });
  doc.end();
  return new Promise(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));
}

// ─── Enregistrer paiement ─────────────────────────────────────────────────────

export async function enregistrerPaiement(cooperativeId: number, id: number, data: {
  montantPaye: number;
  reference?: string;
  datePaiement?: string;
  modePaiement: ModePaiementFiscal;
  caisseId?: number;
  mobileCompteId?: number;
  userId?: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [decl] = await db.select().from(declarationsFiscalesTable)
    .where(and(eq(declarationsFiscalesTable.id, id),
               eq(declarationsFiscalesTable.cooperativeId, cooperativeId))).limit(1);
  if (!decl) throw new Error("Déclaration introuvable");

  const oblResult = await db.select().from(obligationsFiscalesTable)
    .where(eq(obligationsFiscalesTable.id, decl.obligationId)).limit(1);
  const obl = oblResult[0];
  const montantTotal = parseFloat(decl.montantCalculeFcfa as string) + parseFloat(decl.penaliteRetardFcfa as string);
  const statut = data.montantPaye >= montantTotal ? "paye" : "a_payer";
  const montant = Math.round(data.montantPaye);
  if (!obl) throw new Error("Obligation introuvable");
    if (!["especes", "mobile_marchand", "virement", "cheque"].includes(data.modePaiement)) {
    throw new Error("Mode de paiement invalide");
  }

  const result = await db.transaction(async (tx) => {
    const dateOperation = data.datePaiement ?? today;
    let compteCredit = "571";

    if (data.modePaiement === "especes") {
      if (!data.caisseId) throw new Error("Une caisse est requise pour un paiement en espèces");
      const [caisse] = await tx.select().from(caissesTable)
        .where(and(eq(caissesTable.id, data.caisseId), eq(caissesTable.cooperativeId, cooperativeId)))
        .for("update").limit(1);
      if (!caisse) throw new Error("Caisse introuvable");
      const [session] = await tx.select({ id: sessionsCaisseTable.id }).from(sessionsCaisseTable)
        .where(and(eq(sessionsCaisseTable.caisseId, caisse.id), eq(sessionsCaisseTable.dateSession, new Date().toISOString().slice(0, 10)), eq(sessionsCaisseTable.statut, "ouverte")))
        .limit(1);
      if (!session) throw new Error(`Aucune session ouverte sur la caisse "${caisse.nom}"`);
      const solde = parseFloat(String(caisse.soldeActuelFcfa));
      if (solde < montant) throw new Error(`Solde insuffisant en caisse (${solde.toLocaleString("fr-FR")} FCFA disponible)`);
      const nouveauSolde = solde - montant;
      await tx.insert(mouvementsCaisseTable).values({
        caisseId: caisse.id, sessionId: session.id, cooperativeId,
        type: "sortie", motif: "paiement_fiscal",
        montantFcfa: montant.toString(), libelle: `Paiement ${obl.libelle} — ${decl.periode}`,
        referenceOperation: data.reference ?? `FISC-${id}`,
        soldeApresFcfa: nouveauSolde.toString(), enregistrePar: data.userId ?? null,
      });
      await tx.update(caissesTable).set({ soldeActuelFcfa: nouveauSolde.toString() }).where(eq(caissesTable.id, caisse.id));
    } else if (data.modePaiement === "mobile_marchand") {
      if (!data.mobileCompteId) throw new Error("Un compte Mobile Marchand est requis");
      const [mobile] = await tx.select().from(comptesMobilesMarchandsTable)
        .where(and(eq(comptesMobilesMarchandsTable.id, data.mobileCompteId), eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId), eq(comptesMobilesMarchandsTable.actif, true)))
        .for("update").limit(1);
      if (!mobile) throw new Error("Compte Mobile Marchand introuvable ou inactif");
      const solde = parseFloat(String(mobile.soldeActuelFcfa));
      if (solde < montant) throw new Error(`Solde Mobile Marchand insuffisant (${solde.toLocaleString("fr-FR")} FCFA disponible)`);
      const nouveauSolde = solde - montant;
      await tx.insert(mouvementsMobileMarchandTable).values({
        compteId: mobile.id, cooperativeId, type: "debit", motif: "paiement_fiscal",
        montantFcfa: montant.toString(), libelle: `Paiement ${obl.libelle} — ${decl.periode}`,
        reference: data.reference ?? `FISC-${id}`, dateOperation,
        soldeApresFcfa: nouveauSolde.toString(), enregistrePar: data.userId ?? null,
      });
      await tx.update(comptesMobilesMarchandsTable).set({ soldeActuelFcfa: nouveauSolde.toString() }).where(eq(comptesMobilesMarchandsTable.id, mobile.id));
      compteCredit = "552";
    } else {
      if (!data.mobileCompteId) throw new Error("Un compte bancaire est requis");
      const [banque] = await tx.select().from(comptesBancairesTable)
        .where(and(eq(comptesBancairesTable.id, data.mobileCompteId), eq(comptesBancairesTable.cooperativeId, cooperativeId), eq(comptesBancairesTable.actif, true)))
        .for("update").limit(1);
      if (!banque) throw new Error("Compte bancaire introuvable ou inactif");
      const solde = parseFloat(String(banque.soldeActuelFcfa));
      if (solde < montant) throw new Error(`Solde bancaire insuffisant (${solde.toLocaleString("fr-FR")} FCFA disponible)`);
      const nouveauSolde = solde - montant;
      await tx.insert(mouvementsBanqueTable).values({
        compteId: banque.id, cooperativeId, type: "debit", motif: "paiement_fiscal",
        montantFcfa: montant.toString(), libelle: `Paiement ${obl.libelle} — ${decl.periode}`,
        reference: data.reference ?? `FISC-${id}`, dateOperation,
        dateValeur: null, soldeApresFcfa: nouveauSolde.toString(), enregistrePar: data.userId ?? null,
      });
      await tx.update(comptesBancairesTable).set({ soldeActuelFcfa: nouveauSolde.toString() }).where(eq(comptesBancairesTable.id, banque.id));
      compteCredit = "521";
    }

    const exo = new Date(dateOperation).getFullYear();
    const [ecriture] = await tx.insert(ecrituresComptablesTable).values({
      cooperativeId, dateEcriture: dateOperation,
      libelle: `Paiement ${obl.libelle} — ${decl.periode}`,
      compteDebit: COMPTE_DEBIT[obl.typeTaxe] ?? "447",
      compteCredit,
      montantFcfa: montant,
      source: "manuel" as "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock",
      sourceId: id, exercice: exo,
    }).returning({ id: ecrituresComptablesTable.id });
    const [updated] = await tx.update(declarationsFiscalesTable).set({
      montantPayeFcfa: montant.toString(), referencePaiement: data.reference ?? null,
      datePaiement: dateOperation, statut, updatedAt: new Date(),
    }).where(eq(declarationsFiscalesTable.id, id)).returning();
    return { updated, ecritureId: ecriture?.id, exercice: exo };
  });
  if (result.ecritureId) {
    await assignerNumeroPiece(result.ecritureId, "manuel", result.exercice, cooperativeId);
  }
  return result.updated;
}

// ─── Calendrier 3 mois ────────────────────────────────────────────────────────

export async function getCalendrier(cooperativeId: number) {
  const today = new Date();
  const fin   = new Date(today);
  fin.setMonth(fin.getMonth() + 3);

  const result = await db.execute<{
    id: number; periode: string; montant_calcule_fcfa: string;
    date_echeance: string; statut: string; penalite_retard_fcfa: string;
    type_taxe: string; libelle: string; periodicite: string;
    jours_restants: number | null;
  }>(sql`
    SELECT
      d.id, d.periode, d.montant_calcule_fcfa,
      d.date_echeance::text, d.statut, d.penalite_retard_fcfa,
      o.type_taxe, o.libelle, o.periodicite,
      (d.date_echeance - CURRENT_DATE)::integer AS jours_restants
    FROM declarations_fiscales d
    JOIN obligations_fiscales o ON o.id = d.obligation_id
    WHERE d.cooperative_id = ${cooperativeId}
      AND d.date_echeance BETWEEN CURRENT_DATE - 7 AND CURRENT_DATE + 90
      AND d.statut NOT IN ('paye','exonere')
    ORDER BY d.date_echeance
  `);
  return result.rows;
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

export async function getAlertes(cooperativeId: number) {
  const result = await db.execute<{
    id: number; periode: string; montant_calcule_fcfa: string;
    date_echeance: string; statut: string; penalite_retard_fcfa: string;
    type_taxe: string; libelle: string; jours_restants: number;
  }>(sql`
    SELECT
      d.id, d.periode, d.montant_calcule_fcfa,
      d.date_echeance::text, d.statut, d.penalite_retard_fcfa,
      o.type_taxe, o.libelle,
      (d.date_echeance - CURRENT_DATE)::integer AS jours_restants
    FROM declarations_fiscales d
    JOIN obligations_fiscales o ON o.id = d.obligation_id
    WHERE d.cooperative_id = ${cooperativeId}
      AND d.statut NOT IN ('paye','exonere')
      AND d.date_echeance <= CURRENT_DATE + 15
    ORDER BY d.date_echeance
  `);
  return result.rows;
}

// ─── Calcul pénalité de retard ────────────────────────────────────────────────

export async function calculerPenaliteRetard(cooperativeId: number, id: number) {
  const [decl] = await db.select().from(declarationsFiscalesTable)
    .where(and(eq(declarationsFiscalesTable.id, id),
               eq(declarationsFiscalesTable.cooperativeId, cooperativeId))).limit(1);
  if (!decl || !decl.dateEcheance) return null;

  const echeance   = new Date(decl.dateEcheance);
  const today      = new Date();
  const joursRetard = Math.max(0, Math.floor((today.getTime() - echeance.getTime()) / 86400000));
  if (joursRetard <= 0) return null;

  const montant       = parseFloat(decl.montantCalculeFcfa as string);
  const moisRetard    = Math.ceil(joursRetard / 30);
  const tauxPenalite  = 0.10 + Math.max(0, moisRetard - 1) * 0.01;
  const penalite      = Math.round(montant * tauxPenalite);

  await db.update(declarationsFiscalesTable).set({
    penaliteRetardFcfa: penalite.toString(),
    statut:             "en_retard",
    updatedAt:          new Date(),
  }).where(eq(declarationsFiscalesTable.id, id));

  return { joursRetard, moisRetard, tauxPenalite, penalite };
}

// ─── Check échéances (CRON) ───────────────────────────────────────────────────

export async function checkEcheancesFiscales(cooperativeId: number) {
  const result = await db.execute<{
    id: number; libelle: string; periode: string; date_echeance: string;
    statut: string; montant_calcule_fcfa: string;
    jours: number;
  }>(sql`
    SELECT
      d.id, o.libelle, d.periode, d.date_echeance::text, d.statut,
      d.montant_calcule_fcfa,
      (d.date_echeance - CURRENT_DATE)::integer AS jours
    FROM declarations_fiscales d
    JOIN obligations_fiscales o ON o.id = d.obligation_id
    WHERE d.cooperative_id = ${cooperativeId}
      AND d.statut NOT IN ('paye','exonere')
      AND d.date_echeance BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 15
  `);

  for (const d of result.rows) {
    if (d.jours < 0) {
      // En retard → calculer pénalité + marquer en_retard
      await calculerPenaliteRetard(cooperativeId, d.id);
      logger.warn({ id: d.id, libelle: d.libelle }, `Déclaration fiscale EN RETARD`);
    } else if (d.jours === 0) {
      logger.warn({ id: d.id }, `DÉCLARATION ${d.libelle} DUE AUJOURD'HUI`);
    } else if (d.jours <= 7) {
      logger.warn({ id: d.id, jours: d.jours }, `⚠️ Déclaration ${d.libelle} dans ${d.jours} jours`);
    } else if (d.jours <= 15) {
      logger.info({ id: d.id, jours: d.jours }, `Déclaration ${d.libelle} dans ${d.jours} jours`);
    }
  }

  return result.rows.length;
}

// ─── Rapport annuel ───────────────────────────────────────────────────────────

export async function getRapportAnnuel(cooperativeId: number, annee: number) {
  const declarations = await db.execute<{
    type_taxe: string; libelle: string; periodicite: string;
    nb_declarations: string; montant_calcule_total: string;
    montant_paye_total: string; penalite_total: string;
    nb_retard: string;
  }>(sql`
    SELECT
      o.type_taxe, o.libelle, o.periodicite,
      COUNT(d.id)::text                                   AS nb_declarations,
      COALESCE(SUM(d.montant_calcule_fcfa), 0)::text      AS montant_calcule_total,
      COALESCE(SUM(d.montant_paye_fcfa), 0)::text         AS montant_paye_total,
      COALESCE(SUM(d.penalite_retard_fcfa), 0)::text      AS penalite_total,
      COUNT(d.id) FILTER (WHERE d.statut = 'en_retard')::text AS nb_retard
    FROM obligations_fiscales o
    LEFT JOIN declarations_fiscales d
      ON d.obligation_id = o.id
      AND d.cooperative_id = ${cooperativeId}
      AND (d.periode LIKE ${`%${annee}%`})
    WHERE o.cooperative_id = ${cooperativeId} AND o.actif = true
    GROUP BY o.id, o.type_taxe, o.libelle, o.periodicite
    ORDER BY o.periodicite, o.type_taxe
  `);

  const lignes = declarations.rows;
  const totalCalcule = lignes.reduce((s, l) => s + parseFloat(l.montant_calcule_total), 0);
  const totalPaye    = lignes.reduce((s, l) => s + parseFloat(l.montant_paye_total), 0);
  const totalPenalite = lignes.reduce((s, l) => s + parseFloat(l.penalite_total), 0);

  return { annee, lignes, totalCalcule, totalPaye, totalPenalite };
}

// ─── Rapport PDF annuel ────────────────────────────────────────────────────────

export async function genererRapportPdf(cooperativeId: number, annee: number): Promise<Buffer> {
  const rapport = await getRapportAnnuel(cooperativeId, annee);
  const coopNom = await db.execute<{ nom: string }>(sql`SELECT nom FROM cooperatives WHERE id = ${cooperativeId} LIMIT 1`)
    .then(r => r.rows[0]?.nom ?? "CoopDigital");

  const FCFA = (n: number | string) =>
    new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

  const doc  = new PDFDocument({ margin: 45, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  await drawHeader(doc, cooperativeId, {
    titre_document: "RAPPORT FISCAL ANNUEL",
    reference:      `Exercice ${annee}`,
    hauteur_reservee: 90,
  });

  const margin = 45;
  const pageW  = doc.page.width;
  const cW     = pageW - margin * 2;

  doc.moveDown(0.4)
    .font("Helvetica-Bold").fontSize(11).fillColor("#1a4731")
    .text(`Rapport fiscal — Exercice ${annee}`, margin, doc.y, { width: cW });
  doc.font("Helvetica").fontSize(8).fillColor("#666666")
    .text(`Généré le ${new Date().toLocaleDateString("fr-FR")} — Document à remettre à l'expert-comptable.`, margin, doc.y, { width: cW });
  doc.moveDown(0.5);

  // Résumé global
  const resY = doc.y;
  const col3 = cW / 3;
  [
    { label: "Total déclaré", val: FCFA(rapport.totalCalcule), color: "#1a4731" },
    { label: "Total payé",    val: FCFA(rapport.totalPaye),    color: "#166534" },
    { label: "Pénalités",     val: FCFA(rapport.totalPenalite), color: rapport.totalPenalite > 0 ? "#991b1b" : "#374151" },
  ].forEach(({ label, val, color }, i) => {
    const x = margin + i * col3;
    doc.save().rect(x, resY, col3 - 4, 36).fillColor(color).fill().restore();
    doc.font("Helvetica").fontSize(7).fillColor("#ffffff")
      .text(label, x + 4, resY + 5, { width: col3 - 12, align: "center", lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
      .text(val, x + 4, resY + 17, { width: col3 - 12, align: "center", lineBreak: false });
  });
  doc.y = resY + 44;
  doc.moveDown(0.8);

  // Tableau détail par taxe
  const headers = ["Type de taxe", "Périodicité", "Déclarations", "Montant déclaré", "Montant payé", "Pénalités"];
  const colW    = [110, 70, 60, 90, 90, 70];
  let tableY = doc.y;

  doc.save().rect(margin, tableY, cW, 16).fillColor("#1a4731").fill().restore();
  let cx = margin + 3;
  headers.forEach((h, i) => {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
      .text(h, cx, tableY + 4, { width: colW[i]! - 4, lineBreak: false });
    cx += colW[i]!;
  });
  tableY += 16;

  rapport.lignes.forEach((l, idx) => {
    const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
    doc.save().rect(margin, tableY, cW, 14).fillColor(bg).fill().restore();
    const penalite = parseFloat(l.penalite_total);
    const cols = [
      l.libelle, l.periodicite, l.nb_declarations,
      FCFA(l.montant_calcule_total), FCFA(l.montant_paye_total),
      penalite > 0 ? FCFA(penalite) : "—",
    ];
    cx = margin + 3;
    cols.forEach((v, i) => {
      const color = i === 5 && penalite > 0 ? "#991b1b" : "#222222";
      doc.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(7).fillColor(color)
        .text(String(v), cx, tableY + 3, { width: colW[i]! - 4, lineBreak: false });
      cx += colW[i]!;
    });
    doc.moveTo(margin, tableY + 14).lineTo(margin + cW, tableY + 14)
      .strokeColor("#e5e7eb").lineWidth(0.4).stroke();
    tableY += 14;
  });

  // Ligne totaux
  tableY += 4;
  doc.save().rect(margin, tableY, cW, 16).fillColor("#f0fdf4").fill().restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#166534")
    .text("TOTAL", margin + 3, tableY + 4, { width: colW[0]! - 4, lineBreak: false });
  let tx = margin + 3;
  [0,1,2].forEach(i => { tx += colW[i]!; });
  doc.text(FCFA(rapport.totalCalcule), tx, tableY + 4, { width: colW[3]! - 4, lineBreak: false });
  tx += colW[3]!;
  doc.text(FCFA(rapport.totalPaye), tx, tableY + 4, { width: colW[4]! - 4, lineBreak: false });
  tx += colW[4]!;
  doc.fillColor(rapport.totalPenalite > 0 ? "#991b1b" : "#166534")
    .text(rapport.totalPenalite > 0 ? FCFA(rapport.totalPenalite) : "—", tx, tableY + 4, { width: colW[5]! - 4, lineBreak: false });

  doc.y = tableY + 24;
  doc.moveDown(1);
  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#888888")
    .text("Ce document a été généré automatiquement par le système CoopDigital. Il doit être vérifié et validé par l'expert-comptable avant transmission à l'administration fiscale ivoirienne.", margin, doc.y, { width: cW });

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    await drawFooter(doc, cooperativeId, i + 1, range.count);
  }
  doc.flushPages();

  doc.end();
  return new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
}

// ─── Bordereau CNPS mensuel ───────────────────────────────────────────────────

export async function genererBordereauCnpsPdf(
  cooperativeId: number,
  mois: number,
  annee: number,
): Promise<Buffer> {
  // 1. Config paie
  const [cfg] = await db
    .select()
    .from(configPaieTable)
    .where(eq(configPaieTable.cooperativeId, cooperativeId))
    .limit(1);

  const txSal      = cfg?.cnpsSalarialeTaux  ?? 630;
  const txRetraite = cfg?.cnpsPatronaleTaux  ?? 770;
  const txPf       = cfg?.cnpsPfTaux         ?? 575;
  const txAt       = cfg?.cnpsAtmpTaux       ?? 200;
  const plafAnnuel = cfg?.cnpsPlafondAnnuel  ?? 1_647_315;
  const plafMensuel = Math.floor(plafAnnuel / 12);

  const fmtTaux = (t: number) =>
    `${(t / 100).toFixed(2).replace(".", ",")} %`;

  // 2. Bulletins valides/payés de la période
  const bulletins = await db
    .select({
      nom:        personnelTable.nom,
      prenoms:    personnelTable.prenoms,
      numeroCnps: personnelTable.numeroCnps,
      salaireBrut: bulletinsPaieTable.salaireBrutFcfa,
    })
    .from(bulletinsPaieTable)
    .innerJoin(personnelTable, eq(personnelTable.id, bulletinsPaieTable.personnelId))
    .where(and(
      eq(bulletinsPaieTable.cooperativeId, cooperativeId),
      eq(bulletinsPaieTable.mois, mois),
      eq(bulletinsPaieTable.annee, annee),
      or(eq(bulletinsPaieTable.statut, "valide"), eq(bulletinsPaieTable.statut, "paye")),
    ))
    .orderBy(personnelTable.nom, personnelTable.prenoms);

  // 3. Calcul CNPS par salarié
  const lignes = bulletins.map(b => {
    const brut      = b.salaireBrut ?? 0;
    const brutPlafo = Math.min(brut, plafMensuel);
    const partSal   = Math.round(brutPlafo * txSal      / 10000);
    const retraite  = Math.round(brutPlafo * txRetraite / 10000);
    const pf        = Math.round(brutPlafo * txPf       / 10000);
    const at        = Math.round(brutPlafo * txAt       / 10000);
    const totalPat  = retraite + pf + at;
    const totalCnps = partSal + totalPat;
    return {
      nom: b.nom ?? "—", prenoms: b.prenoms ?? "",
      numeroCnps: b.numeroCnps ?? "—",
      brutPlafo, partSal, retraite, pf, at, totalPat, totalCnps,
    };
  });

  const totBrut = lignes.reduce((s, l) => s + l.brutPlafo,  0);
  const totSal  = lignes.reduce((s, l) => s + l.partSal,    0);
  const totPat  = lignes.reduce((s, l) => s + l.totalPat,   0);
  const totCnps = lignes.reduce((s, l) => s + l.totalCnps,  0);

  // 4. Nom coopérative
  const coopNom = await db
    .execute<{ nom: string }>(sql`SELECT nom FROM cooperatives WHERE id = ${cooperativeId} LIMIT 1`)
    .then(r => r.rows[0]?.nom ?? "CoopDigital");

  // 5. PDF
  const F    = (n: number) => new Intl.NumberFormat("fr-FR").format(n).replace(/\u202f|\u00a0/g, " ");
  const VERT = "#1a4731";
  const M    = 45;

  const doc    = new PDFDocument({ margin: M, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const pageW = doc.page.width;
  const cW    = pageW - M * 2;

  await drawHeader(doc, cooperativeId, {
    titre_document:   "BORDEREAU DES COTISATIONS CNPS",
    reference:        `${nomMois(mois)} ${annee}`,
    hauteur_reservee: 90,
  });

  // ── Bloc info (gauche) + résumé (droite) ────────────────────────────────────
  let y     = doc.y + 8;
  const infoW = cW * 0.52;
  const boxW  = cW * 0.44;
  const boxX  = M + infoW + cW * 0.04;
  const boxH  = 68;

  // Résumé vert
  doc.save().rect(boxX, y, boxW, boxH).fillColor(VERT).fill().restore();
  doc.font("Helvetica").fontSize(7).fillColor("#a7f3d0")
    .text("Montant total à reverser à la CNPS", boxX + 6, y + 7,
      { width: boxW - 12, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#ffffff")
    .text(`${F(totCnps)} FCFA`, boxX + 4, y + 18,
      { width: boxW - 8, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(7).fillColor("#d1fae5")
    .text(`Part salariale : ${F(totSal)} FCFA`,  boxX + 8, y + 36, { width: boxW - 16, lineBreak: false });
  doc.text(`Part patronale : ${F(totPat)} FCFA`,  boxX + 8, y + 47, { width: boxW - 16, lineBreak: false });
  doc.fillColor("#bbf7d0")
    .text(`Effectif déclaré : ${lignes.length} salarié(s)`, boxX + 8, y + 57,
      { width: boxW - 16, lineBreak: false });

  // Info texte gauche
  doc.font("Helvetica").fontSize(8.5).fillColor("#6b7280")
    .text("Entreprise :", M, y + 4);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(VERT)
    .text(coopNom, M, y + 15);
  doc.font("Helvetica").fontSize(8.5).fillColor("#6b7280")
    .text("Période de déclaration :", M, y + 30);
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#222222")
    .text(`${nomMois(mois)} ${annee}`, M, y + 41);
  doc.font("Helvetica").fontSize(8.5).fillColor("#6b7280")
    .text("Devise : Francs CFA (XOF)", M, y + 55);

  y += boxH + 14;

  // ── Tableau ──────────────────────────────────────────────────────────────────
  const cols: Array<{ label: string; w: number; align: "left" | "right" }> = [
    { label: "N°",                            w: 22,  align: "left"  },
    { label: "Nom & Prénom",                   w: 95,  align: "left"  },
    { label: "N° CNPS",                        w: 58,  align: "left"  },
    { label: "Brut plafonné",                  w: 56,  align: "right" },
    { label: `Part sal.\n${fmtTaux(txSal)}`,   w: 50,  align: "right" },
    { label: `Retraite\n${fmtTaux(txRetraite)}`, w: 46, align: "right" },
    { label: `PF\n${fmtTaux(txPf)}`,           w: 40,  align: "right" },
    { label: `AT\n${fmtTaux(txAt)}`,           w: 40,  align: "right" },
    { label: "Total pat.",                      w: 48,  align: "right" },
    { label: "TOTAL CNPS",                     w: 50,  align: "right" },
  ];

  const hdrH = 26;
  doc.save().rect(M, y, cW, hdrH).fillColor(VERT).fill().restore();
  let cx = M + 2;
  cols.forEach(col => {
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#ffffff")
      .text(col.label, cx, y + 2, { width: col.w - 3, align: col.align, lineBreak: true, height: hdrH - 4 });
    cx += col.w;
  });
  y += hdrH;

  const rowH = 16;
  lignes.forEach((l, idx) => {
    const bg = idx % 2 === 0 ? "#ffffff" : "#f0fdf4";
    doc.save().rect(M, y, cW, rowH).fillColor(bg).fill().restore();
    cx = M + 2;
    const vals = [
      String(idx + 1),
      `${l.prenoms} ${l.nom}`.trim(),
      l.numeroCnps,
      F(l.brutPlafo),
      F(l.partSal),
      F(l.retraite),
      F(l.pf),
      F(l.at),
      F(l.totalPat),
      F(l.totalCnps),
    ];
    vals.forEach((v, i) => {
      doc.font(i === 9 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7).fillColor("#1f2937")
        .text(v, cx, y + 4, { width: cols[i]!.w - 3, align: cols[i]!.align, lineBreak: false });
      cx += cols[i]!.w;
    });
    doc.moveTo(M, y + rowH).lineTo(M + cW, y + rowH)
      .strokeColor("#e5e7eb").lineWidth(0.3).stroke();
    y += rowH;
  });

  // Ligne total
  doc.save().rect(M, y, cW, rowH + 2).fillColor("#dcfce7").fill().restore();
  cx = M + 2;
  const totVals = ["", "TOTAL GÉNÉRAL", "", F(totBrut), F(totSal), "", "", "", F(totPat), F(totCnps)];
  totVals.forEach((v, i) => {
    doc.font("Helvetica-Bold").fontSize(7).fillColor(VERT)
      .text(v, cx, y + 5, { width: cols[i]!.w - 3, align: cols[i]!.align, lineBreak: false });
    cx += cols[i]!.w;
  });
  y += rowH + 2;

  // ── Signatures ───────────────────────────────────────────────────────────────
  y += 28;
  const sigW = (cW - 20) / 2;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#374151")
    .text("Établi par (Employeur) :", M, y);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#374151")
    .text("Reçu par la CNPS :", M + sigW + 20, y);
  y += 12;
  doc.font("Helvetica").fontSize(7.5).fillColor("#9ca3af")
    .text("Signature — Cachet — Date", M, y);
  doc.font("Helvetica").fontSize(7.5).fillColor("#9ca3af")
    .text("Cachet — Date de réception", M + sigW + 20, y);
  y += 42;
  doc.moveTo(M,               y).lineTo(M + sigW,    y).strokeColor("#9ca3af").lineWidth(0.5).stroke();
  doc.moveTo(M + sigW + 20, y).lineTo(M + cW,      y).strokeColor("#9ca3af").lineWidth(0.5).stroke();

  // ── Footer ───────────────────────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    await drawFooter(doc, cooperativeId, i + 1, range.count);
  }
  doc.flushPages();
  doc.end();
  return new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));
}

export async function updateObligation(cooperativeId: number, id: number, data: {
  libelle?: string;
  typeTaxe?: string;
  periodicite?: string;
  jourEcheance?: number | null;
  tauxPct?: string | null;
  baseCalcul?: string | null;
}) {
  const [existing] = await db.select().from(obligationsFiscalesTable)
    .where(and(eq(obligationsFiscalesTable.id, id), eq(obligationsFiscalesTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!existing) throw new Error("Obligation introuvable");

  const tauxChange = data.tauxPct !== undefined && String(data.tauxPct ?? "") !== String(existing.tauxPct ?? "");
  if (existing.typeTaxe === "ppsi" && tauxChange) {
    const anneeCourante = new Date().getFullYear();
    if (existing.tauxModifieAnnee === anneeCourante) {
      throw new Error(`Le taux PPSSI a déjà été modifié en ${anneeCourante}. Il pourra être modifié à nouveau l'année prochaine.`);
    }
  }

  const [updated] = await db.update(obligationsFiscalesTable).set({
    ...(data.libelle     !== undefined && { libelle:      data.libelle }),
    ...(data.typeTaxe    !== undefined && { typeTaxe:     data.typeTaxe }),
    ...(data.periodicite !== undefined && { periodicite:  data.periodicite }),
    ...(data.jourEcheance !== undefined && { jourEcheance: data.jourEcheance }),
    ...(data.tauxPct     !== undefined && { tauxPct:      data.tauxPct }),
    ...(tauxChange && existing.typeTaxe === "ppsi" && { tauxModifieAnnee: new Date().getFullYear() }),
    ...(data.baseCalcul  !== undefined && { baseCalcul:   data.baseCalcul }),
  }).where(eq(obligationsFiscalesTable.id, id)).returning();
  return updated;
}

export async function createObligation(cooperativeId: number, data: {
  libelle: string;
  typeTaxe: string;
  periodicite: string;
  jourEcheance?: number;
  tauxPct?: string;
  baseCalcul?: string;
}) {
  const [created] = await db.insert(obligationsFiscalesTable).values({
    cooperativeId,
    typeTaxe:     data.typeTaxe,
    libelle:      data.libelle,
    periodicite:  data.periodicite,
    jourEcheance: data.jourEcheance ?? null,
    tauxPct:      data.tauxPct ?? null,
    baseCalcul:   data.baseCalcul ?? null,
    actif:        true,
  }).returning();
  return created;
}

export async function countDeclarationsEnAttente(cooperativeId: number, obligationId: number): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM declarations_fiscales
    WHERE cooperative_id = ${cooperativeId}
      AND obligation_id  = ${obligationId}
      AND statut IN ('a_payer', 'en_retard')
  `);
  return parseInt(result.rows[0]?.count ?? "0", 10);
}

export async function toggleObligation(cooperativeId: number, id: number) {
  const [existing] = await db.select().from(obligationsFiscalesTable)
    .where(and(eq(obligationsFiscalesTable.id, id), eq(obligationsFiscalesTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!existing) throw new Error("Obligation introuvable");

  const [updated] = await db.update(obligationsFiscalesTable)
    .set({ actif: !existing.actif })
    .where(eq(obligationsFiscalesTable.id, id)).returning();
  return updated;
}
