import { db, comptesBancairesTable, mouvementsBanqueTable, ecrituresComptablesTable } from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

// ─── Mapping motif → comptes OHADA ────────────────────────────────────────────
// Crédit banque (argent entrant) : Débit 521 / Crédit [compte source]
// Débit banque  (argent sortant) : Débit [compte destination] / Crédit 521

function comptesForMouvement(type: string, motif: string): { debit: string; credit: string } {
  if (type === "credit") {
    const credits: Record<string, string> = {
      virement_entrant:   "471",  // Créditeurs divers
      depot_especes:      "571",  // Caisse
      remboursement_recu: "162",  // Emprunts établissements de crédit
      autre_credit:       "471",
    };
    return { debit: "521", credit: credits[motif] ?? "471" };
  }
  // debit
  const debits: Record<string, string> = {
    virement_sortant:     "401",  // Fournisseurs
    retrait_especes:      "571",  // Caisse
    frais_bancaires:      "638",  // Autres charges externes
    remboursement_emprunt:"162",  // Emprunts
    autre_debit:          "628",  // Frais divers
  };
  return { debit: debits[motif] ?? "628", credit: "521" };
}

function today(): string { return new Date().toISOString().slice(0, 10); }

async function getCompte(id: number) {
  const rows = await db.select().from(comptesBancairesTable).where(eq(comptesBancairesTable.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─── CRUD Comptes ──────────────────────────────────────────────────────────────

export async function listComptes(cooperativeId: number) {
  return db
    .select()
    .from(comptesBancairesTable)
    .where(and(eq(comptesBancairesTable.cooperativeId, cooperativeId), eq(comptesBancairesTable.actif, true)))
    .orderBy(comptesBancairesTable.nom);
}

export async function creerCompte(
  cooperativeId: number,
  data: {
    nom: string;
    banque: string;
    numeroCompte?: string;
    iban?: string;
    soldeInitial?: number;
    soldeMiniAlerte?: number;
  }
) {
  const [compte] = await db
    .insert(comptesBancairesTable)
    .values({
      cooperativeId,
      nom:                 data.nom,
      banque:              data.banque,
      numeroCompte:        data.numeroCompte ?? null,
      iban:                data.iban ?? null,
      soldeActuelFcfa:     (data.soldeInitial ?? 0).toString(),
      soldeMiniAlerteFcfa: (data.soldeMiniAlerte ?? 0).toString(),
    })
    .returning();
  return compte!;
}

export async function updateCompte(
  id: number,
  cooperativeId: number,
  data: Partial<{
    nom: string;
    banque: string;
    numeroCompte: string;
    iban: string;
    soldeMiniAlerte: number;
    actif: boolean;
  }>
) {
  const set: Record<string, unknown> = {};
  if (data.nom            !== undefined) set["nom"]                   = data.nom;
  if (data.banque         !== undefined) set["banque"]                = data.banque;
  if (data.numeroCompte   !== undefined) set["numeroCompte"]          = data.numeroCompte;
  if (data.iban           !== undefined) set["iban"]                  = data.iban;
  if (data.soldeMiniAlerte !== undefined) set["soldeMiniAlerteFcfa"]  = data.soldeMiniAlerte.toString();
  if (data.actif          !== undefined) set["actif"]                 = data.actif;

  const [row] = await db
    .update(comptesBancairesTable)
    .set(set)
    .where(and(eq(comptesBancairesTable.id, id), eq(comptesBancairesTable.cooperativeId, cooperativeId)))
    .returning();
  return row ?? null;
}

// ─── Mouvements ───────────────────────────────────────────────────────────────

export async function enregistrerMouvement(
  compteId: number,
  cooperativeId: number,
  data: {
    type: "credit" | "debit";
    motif: string;
    montantFcfa: number;
    libelle?: string;
    reference?: string;
    dateOperation?: string;
    dateValeur?: string;
    userId?: number;
  }
) {
  const compte = await getCompte(compteId);
  if (!compte) throw new Error("Compte bancaire introuvable");
  if (compte.cooperativeId !== cooperativeId) throw new Error("Accès refusé");

  const montant    = Math.abs(data.montantFcfa);
  const soldeActuel = parseFloat(compte.soldeActuelFcfa as string);
  const nouveauSolde = data.type === "credit"
    ? soldeActuel + montant
    : soldeActuel - montant;

  const dateOp = data.dateOperation ?? today();

  const [mouvement] = await db
    .insert(mouvementsBanqueTable)
    .values({
      compteId,
      cooperativeId,
      type:           data.type,
      motif:          data.motif,
      montantFcfa:    montant.toString(),
      libelle:        data.libelle ?? null,
      reference:      data.reference ?? null,
      dateOperation:  dateOp,
      dateValeur:     data.dateValeur ?? null,
      soldeApresFcfa: nouveauSolde.toString(),
      enregistrePar:  data.userId ?? null,
    })
    .returning();

  await db
    .update(comptesBancairesTable)
    .set({ soldeActuelFcfa: nouveauSolde.toString() })
    .where(eq(comptesBancairesTable.id, compteId));

  // Écriture comptable OHADA 521
  try {
    const comptes  = comptesForMouvement(data.type, data.motif);
    const exercice = new Date().getFullYear();
    await db.insert(ecrituresComptablesTable).values({
      cooperativeId,
      dateEcriture: dateOp,
      libelle:      data.libelle ?? `Banque — ${data.motif}`,
      compteDebit:  comptes.debit,
      compteCredit: comptes.credit,
      montantFcfa:  montant,
      source:       "manuel" as "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock",
      sourceId:     mouvement?.id ?? null,
      exercice,
    });
  } catch (err) {
    logger.warn({ err }, "Écriture comptable banque non enregistrée");
  }

  const soldeMini = parseFloat(compte.soldeMiniAlerteFcfa as string);
  let alerte: string | undefined;
  if (soldeMini > 0 && nouveauSolde < soldeMini) {
    alerte = `⚠️ Solde banque sous le seuil d'alerte (${soldeMini.toLocaleString("fr-FR")} FCFA)`;
    logger.warn({ compteId, nouveauSolde, soldeMini }, "Compte bancaire sous seuil minimum");
  }

  return { mouvement: mouvement!, alerte, soldeActuel: nouveauSolde };
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export async function getJournal(
  compteId: number,
  cooperativeId: number,
  opts?: { dateDebut?: string; dateFin?: string; type?: string; nonRapproché?: boolean }
) {
  const result = await db.execute<{
    id: number;
    type: string;
    motif: string;
    montant_fcfa: string;
    libelle: string | null;
    reference: string | null;
    date_operation: string;
    date_valeur: string | null;
    solde_apres_fcfa: string | null;
    rapproche: boolean;
    enregistre_par_nom: string | null;
    created_at: string;
  }>(sql`
    SELECT
      m.id, m.type, m.motif, m.montant_fcfa, m.libelle, m.reference,
      m.date_operation::text, m.date_valeur::text,
      m.solde_apres_fcfa, m.rapproche,
      u.nom AS enregistre_par_nom,
      m.created_at::text
    FROM mouvements_banque m
    LEFT JOIN users u ON u.id = m.enregistre_par
    WHERE m.compte_id = ${compteId}
      AND m.cooperative_id = ${cooperativeId}
      ${opts?.dateDebut   ? sql`AND m.date_operation >= ${opts.dateDebut}` : sql``}
      ${opts?.dateFin     ? sql`AND m.date_operation <= ${opts.dateFin}`   : sql``}
      ${opts?.type && opts.type !== "tous" ? sql`AND m.type = ${opts.type}` : sql``}
      ${opts?.nonRapproché ? sql`AND m.rapproche = false` : sql``}
    ORDER BY m.date_operation DESC, m.created_at DESC
  `);
  return result.rows;
}

// ─── Rapprochement ────────────────────────────────────────────────────────────

export async function rapprocherMouvements(
  compteId: number,
  cooperativeId: number,
  mouvementIds: number[]
) {
  if (mouvementIds.length === 0) return { count: 0 };

  const result = await db.execute<{ count: string }>(sql`
    UPDATE mouvements_banque
    SET rapproche = true
    WHERE id = ANY(${sql.raw(`ARRAY[${mouvementIds.join(",")}]::int[]`)}::int[])
      AND compte_id = ${compteId}
      AND cooperative_id = ${cooperativeId}
  `);

  return { count: result.rowCount ?? mouvementIds.length };
}

// ─── Alertes solde ────────────────────────────────────────────────────────────

export async function getAlertes(cooperativeId: number) {
  const result = await db.execute<{ id: number; nom: string; banque: string; solde_actuel_fcfa: string; solde_mini_alerte_fcfa: string }>(sql`
    SELECT id, nom, banque, solde_actuel_fcfa, solde_mini_alerte_fcfa
    FROM comptes_bancaires
    WHERE cooperative_id = ${cooperativeId}
      AND actif = true
      AND solde_mini_alerte_fcfa > 0
      AND solde_actuel_fcfa < solde_mini_alerte_fcfa
    ORDER BY nom
  `);
  return result.rows;
}
