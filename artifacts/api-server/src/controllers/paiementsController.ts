import { type Request, type Response } from "express";
import { db, paiementsTable, paiementLignesTable, membresTable, livraisonsTable, fournisseursTable, usersTable, comptesMobilesMarchandsTable, mouvementsMobileMarchandTable, caissesTable, chequesEmisTable, bonsCarburantTable, campagnesTable, sessionsPeseeTable, commissionsMembresDelaguesTable, depensesVehiculeTable } from "@workspace/db";
import { eq, desc, and, or, sql, gte, lt, lte, inArray, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { envoyerPushGroupePortail, envoyerPushGroupe } from "../services/pushService";
import { proposerEcrituresDansTransaction, resolveCompteDetteProducteur, resolveCompteDebit } from "../services/comptabiliteService.js";
import { verifierCaisseEspeces, debiterCaisseParResponsable, getSessionActive, enregistrerMouvement } from "../services/caisseService.js";
import { enregistrerMouvement as enregistrerMouvementBanque } from "../services/banqueService.js";
import { notifierParRole } from "../services/notificationService.js";
import { logger } from "../lib/logger.js";
import type { ComptabiliteTransaction } from "../services/comptabiliteService.js";
import { genererNumeroRecu } from "../services/recuService.js";
import {
  appliquerRetenueAvanceSurCommissionDansTransaction,
  getRetenueAvanceCommissionPreview,
} from "../services/commissionMembreDelegueService.js";

// ─── Helper ─────────────────────────────────────────────────────────────────

class PaiementDejaTraiteError extends Error {
  readonly status = 409;
  constructor() {
    super("Ce paiement a déjà été traité. Aucune écriture supplémentaire n'a été créée.");
    this.name = "PaiementDejaTraiteError";
  }
}

async function verrouillerPaiementPourValidation(
  tx: ComptabiliteTransaction,
  paiementId: number,
): Promise<void> {
  const [paiement] = await tx
    .select({ statut: paiementsTable.statut })
    .from(paiementsTable)
    .where(eq(paiementsTable.id, paiementId))
    .for("update")
    .limit(1);

  if (!paiement || paiement.statut !== "en_attente") {
    throw new PaiementDejaTraiteError();
  }
}

class PaiementMontantInvalideError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "PaiementMontantInvalideError";
  }
}

export function getPaiementTresorerieDescriptor(
  paiementId: number,
  bonCarburantNumero?: string | null,
  numeroRecu?: string | null,
): { motif: "carburant" | "paiement_producteur"; libelle: string } {
  if (bonCarburantNumero) {
    return {
      motif: "carburant",
      libelle: `Carburant — Bon ${bonCarburantNumero}`,
    };
  }
  const referenceReglement = numeroRecu?.trim() || `PAI-${paiementId}`;
  return {
    motif: "paiement_producteur",
    libelle: `Paiement producteur — règlement ${referenceReglement}`,
  };
}

async function debiterCaissePourLotCarburant(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  userId: number | undefined,
  montantFcfa: number,
  responsableId?: number,
  referenceOperation?: string,
) {
  const [caisse] = await tx
    .select()
    .from(caissesTable)
    .where(and(
      eq(caissesTable.cooperativeId, cooperativeId),
      eq(caissesTable.actif, true),
      responsableId ? eq(caissesTable.responsableId, responsableId) : eq(caissesTable.typeCaisse, "centrale"),
    ))
    .limit(1);
  if (!caisse) {
    throw new Error(responsableId
      ? "Aucune caisse ne vous est assignée. Contactez votre administrateur."
      : "Aucune caisse centrale n'est configurée pour cette coopérative.");
  }
  await enregistrerMouvement(caisse.id, {
    type: "sortie",
    motif: "carburant",
    montantFcfa,
    libelle: `Règlement groupé carburant — ${montantFcfa.toLocaleString("fr-FR")} FCFA`,
    referenceOperation: referenceOperation ?? `CARB-LOT-${Date.now()}`,
    userId,
    cooperativeId,
    skipAccounting: true,
  }, tx);
}

async function debiterMobilePourLotCarburant(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  mode: "orange_money" | "mtn_momo" | "wave",
  montantFcfa: number,
  userId: number | undefined,
  referenceTransaction: string,
) {
  const [compte] = await tx
    .select()
    .from(comptesMobilesMarchandsTable)
    .where(and(
      eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
      eq(comptesMobilesMarchandsTable.operateur, mode),
      eq(comptesMobilesMarchandsTable.actif, true),
    ))
    .for("update")
    .limit(1);
  if (!compte) throw new Error(`Aucun compte Mobile Marchand ${mode} actif n'est configuré.`);

  const solde = parseFloat(String(compte.soldeActuelFcfa));
  const montant = Math.round(montantFcfa);
  if (solde < montant) {
    throw new Error(`Solde Mobile Money insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA, requis : ${montant.toLocaleString("fr-FR")} FCFA.`);
  }
  const nouveauSolde = solde - montant;
  await tx.insert(mouvementsMobileMarchandTable).values({
    compteId: compte.id,
    cooperativeId,
    type: "debit",
    motif: "carburant",
    montantFcfa: montant.toString(),
    libelle: `Règlement groupé carburant — ${montant.toLocaleString("fr-FR")} FCFA`,
    reference: referenceTransaction,
    dateOperation: new Date().toISOString().slice(0, 10),
    soldeApresFcfa: nouveauSolde.toString(),
    enregistrePar: userId ?? null,
  });
  await tx.update(comptesMobilesMarchandsTable)
    .set({ soldeActuelFcfa: nouveauSolde.toString() })
    .where(eq(comptesMobilesMarchandsTable.id, compte.id));
}

function estLivraisonAvecSolde(statut: string | null | undefined): boolean {
  const normalise = String(statut ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
  return ["EN_ATTENTE", "PARTIEL", "DIFFERE", "IMPAYE", "EN_RETARD"].includes(normalise);
}

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

// ─── Helper : débit automatique compte Mobile Marchand ──────────────────────

async function debiterCompteMobileMarchandPaiement(
  cooperativeId: number,
  operateur: string,
  montantFcfa: number,
  paiementId: number,
  validePar: number | null | undefined,
  referenceTransaction: string | null | undefined,
  numeroRecu?: string | null,
): Promise<void> {
  try {
    const [compte] = await db
      .select()
      .from(comptesMobilesMarchandsTable)
      .where(
        and(
          eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
          eq(comptesMobilesMarchandsTable.operateur, operateur as "wave" | "orange_money" | "mtn_momo"),
          eq(comptesMobilesMarchandsTable.actif, true),
        ),
      )
      .limit(1);

    if (!compte) {
      logger.warn({ cooperativeId, operateur, paiementId }, "Aucun compte Mobile Marchand actif trouvé pour débit automatique");
      return;
    }

    const soldeActuel = parseFloat(compte.soldeActuelFcfa);
    if (soldeActuel < montantFcfa) {
      logger.warn({ cooperativeId, operateur, paiementId, soldeActuel, montantFcfa }, "Solde Mobile Marchand insuffisant pour débit automatique — débit quand même enregistré");
    }

    const newSolde = soldeActuel - montantFcfa;
    const today = new Date().toISOString().slice(0, 10);

    await db.transaction(async (tx) => {
      await tx.insert(mouvementsMobileMarchandTable).values({
        compteId:       compte.id,
        cooperativeId,
        type:           "debit",
        motif:          "paiement_producteur",
        montantFcfa:    montantFcfa.toString(),
        libelle:        `Paiement producteur — règlement ${numeroRecu?.trim() || `PAI-${paiementId}`}`,
        reference:      referenceTransaction ?? null,
        dateOperation:  today,
        soldeApresFcfa: newSolde.toString(),
        enregistrePar:  validePar ?? null,
      });
      await tx
        .update(comptesMobilesMarchandsTable)
        .set({ soldeActuelFcfa: newSolde.toString() })
        .where(eq(comptesMobilesMarchandsTable.id, compte.id));
    });

    // Notifier si le solde passe sous le seuil minimum configuré (soldeMiniAlerteFcfa > 0)
    const seuilMini = parseFloat(compte.soldeMiniAlerteFcfa as string);
    if (seuilMini > 0 && newSolde < seuilMini) {
      void notifierCompteMobileSousSeuil(
        cooperativeId,
        compte.id,
        compte.nom,
        operateur,
        newSolde,
        paiementId,
      );
    }
  } catch (err) {
    logger.warn({ err, paiementId }, "Débit automatique compte Mobile Marchand non effectué");
  }
}

// ─── Helper : notification compte Mobile Marchand sous seuil ────────────────

const OPERATEUR_LABEL: Record<string, string> = {
  orange_money: "Orange Money",
  mtn_momo:     "MTN MoMo",
  wave:         "Wave",
};

async function notifierCompteMobileSousSeuil(
  cooperativeId: number,
  compteId: number,
  compteNom: string,
  operateur: string,
  soldeActuel: number,
  paiementId: number,
): Promise<void> {
  const soldeFormate   = new Intl.NumberFormat("fr-FR").format(soldeActuel);
  const operateurLabel = OPERATEUR_LABEL[operateur] ?? operateur;
  try {
    // In-app : Directeur + PCA
    await notifierParRole(cooperativeId, ["directeur", "pca"], {
      type:         "anomalie_critique",
      titre:        `⚠️ Compte ${operateurLabel} sous le seuil minimum`,
      message:      `Le solde du compte ${compteNom} (${operateurLabel}) est tombé à ${soldeFormate} FCFA suite au paiement #${paiementId}. Pensez à recharger le compte.`,
      gravite:      "critique",
      sourceModule: "caisse",
      sourceId:     compteId,
    });
    // Push : mêmes rôles
    const destinataires = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.cooperativeId, cooperativeId),
          eq(usersTable.actif, true),
          inArray(usersTable.role, ["directeur", "pca"] as any[]),
        ),
      );
    if (destinataires.length > 0) {
      void envoyerPushGroupe(destinataires.map((u) => u.id), {
        title: `⚠️ ${operateurLabel} — seuil minimum atteint`,
        body:  `Solde : ${soldeFormate} FCFA — ${compteNom}`,
        url:   "/caisse",
      });
    }
  } catch (err) {
    logger.warn({ err, cooperativeId, compteId }, "Notification solde Mobile Marchand non envoyée");
  }
}

// ─── Helper : notification solde Caisse Centrale sous seuil ─────────────────

async function notifierCaisseCentraleSousSeuil(
  cooperativeId: number,
  caisseId: number,
  caisseNom: string,
  soldeActuel: number,
  paiementId: number,
): Promise<void> {
  const soldeFormate = new Intl.NumberFormat("fr-FR").format(soldeActuel);
  try {
    // In-app : Directeur + PCA
    await notifierParRole(cooperativeId, ["directeur", "pca"], {
      type:         "anomalie_critique",
      titre:        "⚠️ Caisse Centrale sous le seuil minimum",
      message:      `Le solde de la ${caisseNom} est tombé à ${soldeFormate} FCFA suite au paiement #${paiementId}. Pensez à approvisionner la caisse.`,
      gravite:      "critique",
      sourceModule: "caisse",
      sourceId:     caisseId,
    });
    // Push : mêmes rôles
    const destinataires = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.cooperativeId, cooperativeId),
          eq(usersTable.actif, true),
          inArray(usersTable.role, ["directeur", "pca"] as any[]),
        ),
      );
    if (destinataires.length > 0) {
      void envoyerPushGroupe(destinataires.map((u) => u.id), {
        title: "⚠️ Caisse Centrale — seuil minimum atteint",
        body:  `Solde : ${soldeFormate} FCFA — ${caisseNom}`,
        url:   "/caisse",
      });
    }
  } catch (err) {
    logger.warn({ err, cooperativeId, caisseId }, "Notification solde Caisse Centrale non envoyée");
  }
}

// ─── Sélection enrichie partagée ────────────────────────────────────────────

const agentAlias = usersTable;
// Alias SQL pour joindre la table users sur livraisons.agent_id (séparation délégué / base centrale)
const agentUserAlias = alias(usersTable, "agent_user");
// Alias SQL pour joindre la table users sur paiements.agent_saisiseur_id (mode proxy gérant)
const saisiseurUserAlias = alias(usersTable, "saisiseur_user");

function dateEffectivePaiementSql() {
  return sql`coalesce(${paiementsTable.dateValidation}, ${paiementsTable.createdAt})`;
}
const SELECT_FIELDS = {
  id: paiementsTable.id,
  numeroRecu: paiementsTable.numeroRecu,
  livraisonId: paiementsTable.livraisonId,
  bonCarburantId: paiementsTable.bonCarburantId,
  bonCarburantNumero: bonsCarburantTable.numero,
  depenseVehiculeId: paiementsTable.depenseVehiculeId,
  depenseVehiculeLibelle: depensesVehiculeTable.libelle,
  depenseVehiculeFournisseur: depensesVehiculeTable.fournisseur,
  membreId: paiementsTable.membreId,
  montantFcfa: paiementsTable.montantFcfa,
  modePaiement: paiementsTable.modePaiement,
  referenceTransaction: paiementsTable.referenceTransaction,
  statut: paiementsTable.statut,
  createdAt: paiementsTable.createdAt,
  motifRejet: paiementsTable.motifRejet,
  dateValidation: paiementsTable.dateValidation,
  // Membre
  membreNom: membresTable.nom,
  membrePrenoms: membresTable.prenoms,
  telephone: membresTable.telephone,
  // Fournisseur externe (pisteur)
  fournisseurNom: fournisseursTable.nom,
  fournisseurPrenoms: fournisseursTable.prenoms,
  fournisseurTelephone: fournisseursTable.telephone,
  // Livraison
  dateLivraison: livraisonsTable.dateLivraison,
  poidsNetKg: livraisonsTable.poidsNetKg,
  poidsKg: livraisonsTable.poidsKg,
  montantBrutFcfa: livraisonsTable.montantBrutFcfa,
  avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
  intrantsDeduitsFcfa: livraisonsTable.intrantsDeduitsFcfa,
  fraisCarburantDeduitsFcfa: livraisonsTable.fraisCarburantDeduitsFcfa,
  autresChargesDeduitesFcfa: livraisonsTable.autresChargesDeduitesFcfa,
  montantNetFcfa: livraisonsTable.montantNetFcfa,
  livraisonStatutPaiement: livraisonsTable.statutPaiement,
  livraisonMontantRestant: sql<number>`coalesce(${livraisonsTable.montantRestant}, '0')::integer`,
  compteDetteProducteur: livraisonsTable.compteDetteProducteur,
  agentId: livraisonsTable.agentId,
  // Attribution proxy gérant
  agentSaisiseurId: paiementsTable.agentSaisiseurId,
  agentSaisiseurNom: saisiseurUserAlias.nom,
  commissionCollecteId: commissionsMembresDelaguesTable.id,
  commissionCollecteFcfa: sql<number | null>`round(${commissionsMembresDelaguesTable.montantFcfa})::integer`,
  commissionCollecteStatut: commissionsMembresDelaguesTable.statut,
  commissionCollecteRetenueAvancesFcfa: commissionsMembresDelaguesTable.retenueAvancesFcfa,
  commissionCollecteMembreId: commissionsMembresDelaguesTable.membreDelegueId,
  commissionCollecteFrequencePaiement: commissionsMembresDelaguesTable.frequencePaiement,
  commissionCollecteAvanceDisponibleFcfa: sql<number | null>`
    CASE WHEN ${commissionsMembresDelaguesTable.id} IS NULL THEN NULL
    ELSE LEAST(
      round(${commissionsMembresDelaguesTable.montantFcfa})::integer,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN a.plan_type = 'partiel' AND a.montant_partiel_fcfa IS NOT NULL
              THEN LEAST(a.montant_partiel_fcfa, a.solde_restant_fcfa)
            ELSE a.solde_restant_fcfa
          END
        )
        FROM avances a
        WHERE a.membre_id = ${commissionsMembresDelaguesTable.membreDelegueId}
          AND a.statut IN ('en_cours', 'en_retard')
          AND a.deduction_source = 'commission'
          AND (
            a.plan_type <> 'reporte'
            OR (a.report_date IS NOT NULL AND a.report_date <= CURRENT_DATE)
          )
      ), 0)
    )::integer END`,
};

async function attachPaiementLignes<T extends { id: number }>(rows: T[]) {
  if (rows.length === 0) return rows.map((row) => ({ ...row, lignes: [] as typeof paiementLignesTable.$inferSelect[] }));
  const lignes = await db
    .select()
    .from(paiementLignesTable)
    .where(inArray(paiementLignesTable.paiementId, rows.map((row) => row.id)));
  return rows.map((row) => ({
    ...row,
    lignes: lignes.filter((ligne) => ligne.paiementId === row.id),
  }));
}

async function fetchEnrichedPaiement(id: number) {
  const rows = await db
    .select(SELECT_FIELDS)
    .from(paiementsTable)
    .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
    .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
    .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
    .leftJoin(sessionsPeseeTable, eq(sessionsPeseeTable.livraisonId, livraisonsTable.id))
    .leftJoin(commissionsMembresDelaguesTable, eq(commissionsMembresDelaguesTable.sessionPeseeId, sessionsPeseeTable.id))
    .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
    .leftJoin(depensesVehiculeTable, eq(paiementsTable.depenseVehiculeId, depensesVehiculeTable.id))
    .leftJoin(saisiseurUserAlias, eq(paiementsTable.agentSaisiseurId, saisiseurUserAlias.id))
    .where(eq(paiementsTable.id, id))
    .limit(1);
  return (await attachPaiementLignes(rows))[0] ?? null;
}

// ─── GET /paiements ──────────────────────────────────────────────────────────

export async function listPaiements(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const statut = req.query["statut"] as string | undefined;
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;
    const periode = req.query["periode"] as string | undefined;
    const dateDebut = typeof req.query["date_debut"] === "string" ? req.query["date_debut"] : undefined;
    const dateFin = typeof req.query["date_fin"] === "string" ? req.query["date_fin"] : undefined;
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "100")));
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if ((dateDebut && !datePattern.test(dateDebut)) || (dateFin && !datePattern.test(dateFin))) {
      res.status(400).json({ erreur: "Les dates doivent être au format AAAA-MM-JJ" });
      return;
    }
    if (dateDebut && dateFin && dateDebut > dateFin) {
      res.status(400).json({ erreur: "La date de début doit précéder la date de fin" });
      return;
    }

    const coopFilter = or(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(fournisseursTable.cooperativeId, cooperativeId),
      eq(bonsCarburantTable.cooperativeId, cooperativeId),
      eq(depensesVehiculeTable.cooperativeId, cooperativeId),
    )!;
    const conditions: SQL<unknown>[] = [coopFilter];
    if (statut) conditions.push(eq(paiementsTable.statut, statut as "en_attente" | "confirme" | "echec" | "rejete" | "en_cours" | "effectue"));
    if (membreId) conditions.push(eq(paiementsTable.membreId, membreId));
    // Un délégué ne voit que les règlements des membres/fournisseurs qui lui sont rattachés
    if (req.user?.role === "delegue" && req.user?.id) {
      conditions.push(
        or(
          eq(membresTable.delegueId, req.user.id),
          eq(fournisseursTable.creeParDelegueId, req.user.id),
        )!,
      );
    } else {
      // Base centrale : masquer les règlements en espèces enregistrés par un délégué
      // (ces règlements sont gérés dans la page Caisse du délégué concerné)
      // Les paiements sans mode pré-sélectionné (pesée groupée) sont toujours visibles.
      conditions.push(
        or(
          isNull(paiementsTable.modePaiement),
          sql`${paiementsTable.modePaiement} != 'especes'`,
          isNull(livraisonsTable.agentId),
          sql`${agentUserAlias.role} != 'delegue'`,
        )!,
      );
    }

    const now = new Date();
    const dateEffective = dateEffectivePaiementSql();
    if (dateDebut || dateFin) {
      if (dateDebut) {
        conditions.push(gte(dateEffective, new Date(`${dateDebut}T00:00:00.000Z`)));
      }
      if (dateFin) {
        conditions.push(lte(dateEffective, new Date(`${dateFin}T23:59:59.999Z`)));
      }
    } else if (periode === "today") {
      conditions.push(gte(dateEffective, startOfDay(now)));
    } else if (periode === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      conditions.push(gte(dateEffective, weekAgo));
    } else if (periode === "month") {
      conditions.push(gte(dateEffective, startOfMonth(now)));
    } else if (periode === "previous_month") {
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      conditions.push(gte(dateEffective, startOfMonth(previousMonth)));
      conditions.push(lte(dateEffective, endOfMonth(previousMonth)));
    } else if (periode === "campaign") {
      const [campagneActive] = await db
        .select({
          dateOuverture: campagnesTable.dateOuverture,
          dateFermeture: campagnesTable.dateFermeture,
        })
        .from(campagnesTable)
        .where(and(
          eq(campagnesTable.cooperativeId, cooperativeId),
          eq(campagnesTable.statut, "ouverte"),
        ))
        .orderBy(desc(campagnesTable.dateOuverture))
        .limit(1);
      if (campagneActive) {
        conditions.push(gte(dateEffective, new Date(`${campagneActive.dateOuverture}T00:00:00.000Z`)));
        const campagneFin = campagneActive.dateFermeture ?? now.toISOString().split("T")[0]!;
        conditions.push(lte(dateEffective, new Date(`${campagneFin}T23:59:59.999Z`)));
      }
    }

    const paiements = await db
      .select(SELECT_FIELDS)
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(sessionsPeseeTable, eq(sessionsPeseeTable.livraisonId, livraisonsTable.id))
      .leftJoin(commissionsMembresDelaguesTable, eq(commissionsMembresDelaguesTable.sessionPeseeId, sessionsPeseeTable.id))
      .leftJoin(agentUserAlias, eq(livraisonsTable.agentId, agentUserAlias.id))
      .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
      .leftJoin(depensesVehiculeTable, eq(paiementsTable.depenseVehiculeId, depensesVehiculeTable.id))
      .leftJoin(saisiseurUserAlias, eq(paiementsTable.agentSaisiseurId, saisiseurUserAlias.id))
      .where(and(...conditions))
      .orderBy(desc(paiementsTable.createdAt))
      .limit(limit);

    res.json(await attachPaiementLignes(paiements));
  } catch (err) {
    req.log.error({ err }, "Erreur listPaiements");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /paiements/stats ────────────────────────────────────────────────────

export async function statsPaiements(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const periode = req.query["periode"] as string | undefined;
    const dateDebut = typeof req.query["date_debut"] === "string" ? req.query["date_debut"] : undefined;
    const dateFin = typeof req.query["date_fin"] === "string" ? req.query["date_fin"] : undefined;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if ((dateDebut && !datePattern.test(dateDebut)) || (dateFin && !datePattern.test(dateFin))) {
      res.status(400).json({ erreur: "Les dates doivent être au format AAAA-MM-JJ" });
      return;
    }
    if (dateDebut && dateFin && dateDebut > dateFin) {
      res.status(400).json({ erreur: "La date de début doit précéder la date de fin" });
      return;
    }

    let periodeStart: Date | null = dateDebut
      ? new Date(`${dateDebut}T00:00:00.000Z`)
      : null;
    let periodeEnd: Date | null = dateFin
      ? new Date(`${dateFin}T23:59:59.999Z`)
      : null;
    if (!dateDebut && !dateFin) {
      if (periode === "today") {
        periodeStart = todayStart;
        periodeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (periode === "week") {
        periodeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        periodeEnd = now;
      } else if (periode === "month") {
        periodeStart = monthStart;
        periodeEnd = monthEnd;
      } else if (periode === "previous_month") {
        const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        periodeStart = startOfMonth(previousMonth);
        periodeEnd = endOfMonth(previousMonth);
      } else if (periode === "campaign") {
        const [campagneActive] = await db
          .select({
            dateOuverture: campagnesTable.dateOuverture,
            dateFermeture: campagnesTable.dateFermeture,
          })
          .from(campagnesTable)
          .where(and(
            eq(campagnesTable.cooperativeId, cooperativeId),
            eq(campagnesTable.statut, "ouverte"),
          ))
          .orderBy(desc(campagnesTable.dateOuverture))
          .limit(1);
        if (campagneActive) {
          periodeStart = new Date(`${campagneActive.dateOuverture}T00:00:00.000Z`);
          const campagneFin = campagneActive.dateFermeture ?? now.toISOString().split("T")[0]!;
          periodeEnd = new Date(`${campagneFin}T23:59:59.999Z`);
        }
      }
    }

    const statsCoopFilter = or(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(fournisseursTable.cooperativeId, cooperativeId),
      eq(bonsCarburantTable.cooperativeId, cooperativeId),
      eq(depensesVehiculeTable.cooperativeId, cooperativeId),
    )!;
    const statsConditions: SQL<unknown>[] = [statsCoopFilter];
    // Un délégué ne voit que les stats des membres/fournisseurs qui lui sont rattachés
    if (req.user?.role === "delegue" && req.user?.id) {
      statsConditions.push(
        or(
          eq(membresTable.delegueId, req.user.id),
          eq(fournisseursTable.creeParDelegueId, req.user.id),
        )!,
      );
    } else {
      // Base centrale : exclure les règlements espèces des délégués des stats
      // Les paiements sans mode (pesée groupée) sont toujours inclus.
      statsConditions.push(
        or(
          isNull(paiementsTable.modePaiement),
          sql`${paiementsTable.modePaiement} != 'especes'`,
          isNull(livraisonsTable.agentId),
          sql`${agentUserAlias.role} != 'delegue'`,
        )!,
      );
    }

    const rows = await db
      .select({
        id: paiementsTable.id,
        statut: paiementsTable.statut,
        montantFcfa: paiementsTable.montantFcfa,
        dateValidation: paiementsTable.dateValidation,
        createdAt: paiementsTable.createdAt,
        chequeId: chequesEmisTable.id,
        chequeMontantFcfa: chequesEmisTable.montantFcfa,
        chequeStatut: chequesEmisTable.statut,
        chequeDateEncaissement: chequesEmisTable.dateEncaissement,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(agentUserAlias, eq(livraisonsTable.agentId, agentUserAlias.id))
      .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
      .leftJoin(depensesVehiculeTable, eq(paiementsTable.depenseVehiculeId, depensesVehiculeTable.id))
      .leftJoin(chequesEmisTable, eq(chequesEmisTable.paiementId, paiementsTable.id))
      .where(and(...statsConditions));

    let enAttente = { count: 0, montant_total: 0 };
    let valideAujourdhui = { count: 0, montant_total: 0 };
    let rejete = { count: 0 };
    let effectueCeMois = { montant_total: 0 };
    let effectuePeriode = { count: 0, montant_total: 0 };

    const paiements = new Map<number, {
      id: number;
      statut: typeof paiementsTable.$inferSelect.statut;
      montantFcfa: number;
      dateValidation: Date | null;
      createdAt: Date;
      cheques: Map<number, {
        montantFcfa: number;
        statut: typeof chequesEmisTable.$inferSelect.statut;
        dateEncaissement: string | null;
      }>;
    }>();
    for (const row of rows) {
      let paiement = paiements.get(row.id);
      if (!paiement) {
        paiement = {
          id: row.id,
          statut: row.statut,
          montantFcfa: row.montantFcfa,
          dateValidation: row.dateValidation,
          createdAt: row.createdAt,
          cheques: new Map(),
        };
        paiements.set(row.id, paiement);
      }
      if (row.chequeId != null) {
        paiement.cheques.set(row.chequeId, {
          montantFcfa: row.chequeMontantFcfa ?? 0,
          statut: row.chequeStatut ?? "emis",
          dateEncaissement: row.chequeDateEncaissement,
        });
      }
    }

    const montantRegleDansPeriode = (
      paiement: (typeof paiements extends Map<number, infer P> ? P : never),
      debut: Date | null,
      fin: Date | null,
    ) => {
      const dansPeriode = (date: Date) => (!debut || date >= debut) && (!fin || date <= fin);
      const datePaiement = new Date(paiement.dateValidation ?? paiement.createdAt);
      const totalCheques = [...paiement.cheques.values()]
        .reduce((total, cheque) => total + cheque.montantFcfa, 0);
      let montant = dansPeriode(datePaiement)
        ? Math.max(0, paiement.montantFcfa - totalCheques)
        : 0;
      for (const cheque of paiement.cheques.values()) {
        if (cheque.statut !== "encaisse" || !cheque.dateEncaissement) continue;
        const dateEncaissement = new Date(`${cheque.dateEncaissement}T12:00:00.000Z`);
        if (dansPeriode(dateEncaissement)) montant += cheque.montantFcfa;
      }
      return montant;
    };

    for (const r of paiements.values()) {
      if (r.statut === "en_attente") {
        enAttente.count++;
        enAttente.montant_total += r.montantFcfa;
      }
      if (r.statut === "confirme" || r.statut === "effectue" || r.statut === "en_cours") {
        const montantAujourdhui = montantRegleDansPeriode(r, todayStart, now);
        if (montantAujourdhui > 0) {
          valideAujourdhui.count++;
          valideAujourdhui.montant_total += montantAujourdhui;
        }
      }
      if (r.statut === "rejete") {
        rejete.count++;
      }
      if (r.statut === "effectue" || r.statut === "confirme" || r.statut === "en_cours") {
        effectueCeMois.montant_total += montantRegleDansPeriode(r, monthStart, monthEnd);
        const montantPeriode = montantRegleDansPeriode(r, periodeStart, periodeEnd);
        if (montantPeriode > 0) {
          effectuePeriode.count++;
          effectuePeriode.montant_total += montantPeriode;
        }
      }
    }

    res.json({
      en_attente: enAttente,
      valide_aujourd_hui: valideAujourdhui,
      rejete,
      effectue_ce_mois: effectueCeMois,
      effectue_periode: effectuePeriode,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur statsPaiements");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── PATCH /paiements/:id/valider ────────────────────────────────────────────

export async function validerPaiement(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) {
    res.status(400).json({ erreur: "ID invalide" });
    return;
  }

  const MODES_VALIDES = ["especes", "cheque", "virement", "orange_money", "mtn_momo", "wave"] as const;

type VentilationPaiement = {
  modePaiement: typeof MODES_VALIDES[number];
  montantFcfa: number;
  referenceTransaction?: string | null;
  telephone?: string | null;
  numeroCheque?: string | null;
  banque?: string | null;
  dateEcheance?: string | null;
};

async function debiterCaisseDansTransaction(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  userId: number | undefined,
  montantFcfa: number,
  paiementId: number,
  responsableId?: number,
  bonCarburantNumero?: string | null,
  numeroRecu?: string | null,
) {
  const [caisse] = await tx
    .select()
    .from(caissesTable)
    .where(and(
      eq(caissesTable.cooperativeId, cooperativeId),
      eq(caissesTable.actif, true),
      responsableId ? eq(caissesTable.responsableId, responsableId) : eq(caissesTable.typeCaisse, "centrale"),
    ))
    .limit(1);
  if (!caisse) {
    throw new Error(responsableId
      ? "Aucune caisse ne vous est assignée. Contactez votre administrateur."
      : "Aucune caisse centrale n'est configurée pour cette coopérative.");
  }

  // Utiliser le même service que les autres sorties de caisse garantit que le
  // mouvement, la session et le solde sont écrits ensemble. Le paiement crée
  // déjà sa propre écriture OHADA plus bas : on ne la duplique pas ici.
  const descriptor = getPaiementTresorerieDescriptor(paiementId, bonCarburantNumero, numeroRecu);
  await enregistrerMouvement(caisse.id, {
    type: "sortie",
    motif: descriptor.motif,
    montantFcfa,
    libelle: descriptor.libelle,
    referenceOperation: `PAI-${paiementId}`,
    userId,
    cooperativeId,
    skipAccounting: true,
  }, tx);
}

async function debiterMobileDansTransaction(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  mode: string,
  montantFcfa: number,
  paiementId: number,
  userId: number | undefined,
  referenceTransaction?: string | null,
  bonCarburantNumero?: string | null,
  numeroRecu?: string | null,
) {
  const [compte] = await tx
    .select()
    .from(comptesMobilesMarchandsTable)
    .where(and(
      eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
      eq(comptesMobilesMarchandsTable.operateur, mode as "wave" | "orange_money" | "mtn_momo"),
      eq(comptesMobilesMarchandsTable.actif, true),
    ))
    .limit(1);
  if (!compte) throw new Error(`Aucun compte Mobile Marchand ${mode} actif n'est configuré.`);
  const solde = parseFloat(String(compte.soldeActuelFcfa));
  const montant = Math.round(montantFcfa);
  if (solde < montant) {
    throw new Error(`Solde Mobile Money insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA, requis : ${montant.toLocaleString("fr-FR")} FCFA.`);
  }
  const nouveauSolde = solde - montant;
  const descriptor = getPaiementTresorerieDescriptor(paiementId, bonCarburantNumero, numeroRecu);
  await tx.insert(mouvementsMobileMarchandTable).values({
    compteId: compte.id,
    cooperativeId,
    type: "debit",
    motif: descriptor.motif,
    montantFcfa: montant.toString(),
    libelle: descriptor.libelle,
    reference: referenceTransaction ?? null,
    dateOperation: new Date().toISOString().slice(0, 10),
    soldeApresFcfa: nouveauSolde.toString(),
    enregistrePar: userId ?? null,
  });
  await tx.update(comptesMobilesMarchandsTable)
    .set({ soldeActuelFcfa: nouveauSolde.toString() })
    .where(eq(comptesMobilesMarchandsTable.id, compte.id));
}
  const body = (req.body ?? {}) as {
    referenceTransaction?: string | null;
    telephone?: string | null;
    montantReglementFcfa?: number | null;
    inclureFraisCollecte?: boolean;
    numeroCheque?: string | null;
    banque?: string | null;
    dateEcheance?: string | null;
    modePaiement?: string | null;
    ventilations?: Array<{
      modePaiement?: string;
      montantFcfa?: number;
      referenceTransaction?: string | null;
      telephone?: string | null;
      numeroCheque?: string | null;
      banque?: string | null;
      dateEcheance?: string | null;
    }>;
  };

  try {
    // Vérification appartenance + statut
    const [row] = await db
      .select({
        paiement: paiementsTable,
        membreCoopId: membresTable.cooperativeId,
        telephone: membresTable.telephone,
        nom: membresTable.nom,
        prenoms: membresTable.prenoms,
        fournisseurNom: fournisseursTable.nom,
        fournisseurPrenoms: fournisseursTable.prenoms,
        membreDelegueId: membresTable.delegueId,
        fournisseurCoopId: fournisseursTable.cooperativeId,
        bonCarburantCoopId: bonsCarburantTable.cooperativeId,
        depenseVehiculeCoopId: depensesVehiculeTable.cooperativeId,
        depenseVehiculeLibelle: depensesVehiculeTable.libelle,
        depenseVehiculeFournisseur: depensesVehiculeTable.fournisseur,
        livraisonStatutPaiement: livraisonsTable.statutPaiement,
        livraisonMontantNetFcfa: livraisonsTable.montantNetFcfa,
        bonCarburantNumero: bonsCarburantTable.numero,
        livraisonMontantRestant: sql<number>`coalesce(${livraisonsTable.montantRestant}, '0')::integer`,
        compteDetteProducteur: livraisonsTable.compteDetteProducteur,
        commissionCollecteId: commissionsMembresDelaguesTable.id,
        commissionCollecteFcfa: sql<number | null>`round(${commissionsMembresDelaguesTable.montantFcfa})::integer`,
        commissionCollecteStatut: commissionsMembresDelaguesTable.statut,
        commissionCollecteMembreId: commissionsMembresDelaguesTable.membreDelegueId,
         commissionCollecteFrequencePaiement: commissionsMembresDelaguesTable.frequencePaiement,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(sessionsPeseeTable, eq(sessionsPeseeTable.livraisonId, livraisonsTable.id))
      .leftJoin(commissionsMembresDelaguesTable, eq(commissionsMembresDelaguesTable.sessionPeseeId, sessionsPeseeTable.id))
      .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
       .leftJoin(depensesVehiculeTable, eq(paiementsTable.depenseVehiculeId, depensesVehiculeTable.id))
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId && row.fournisseurCoopId !== cooperativeId && row.bonCarburantCoopId !== cooperativeId && row.depenseVehiculeCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce paiement n'appartient pas à votre coopérative" });
      return;
    }
    if (row.paiement.statut !== "en_attente") {
      res.status(409).json({ erreur: `Statut actuel : ${row.paiement.statut}. Seuls les paiements en_attente peuvent être validés.` });
      return;
    }
    const beneficiairePaiement = (
      `${row.nom ?? ""} ${row.prenoms ?? ""}`.trim()
      || `${row.fournisseurNom ?? ""} ${row.fournisseurPrenoms ?? ""}`.trim()
      || row.depenseVehiculeFournisseur?.trim()
      || row.depenseVehiculeLibelle?.trim()
      || `PAI-${id}`
    );

    const livraisonAvecSolde = !!row.paiement.livraisonId && estLivraisonAvecSolde(row.livraisonStatutPaiement);
    const montantRestantActuel = livraisonAvecSolde
      ? Math.max(0, Math.round(Number(row.livraisonMontantRestant ?? row.livraisonMontantNetFcfa ?? row.paiement.montantFcfa)))
      : row.paiement.montantFcfa;
    const montantDemande = body.montantReglementFcfa == null
      ? row.paiement.montantFcfa
      : Number(body.montantReglementFcfa);
    const commissionCollecteMontant = Math.max(0, Math.round(Number(row.commissionCollecteFcfa ?? 0)));
    const commissionCollecteDisponible = row.commissionCollecteId != null
      && row.commissionCollecteStatut === "en_attente"
      && row.commissionCollecteMembreId === row.paiement.membreId
      && commissionCollecteMontant > 0;
    const inclureFraisCollecte = body.inclureFraisCollecte === true;
    if (inclureFraisCollecte && !commissionCollecteDisponible) {
      res.status(400).json({ erreur: "Aucun frais de collecte en attente n'est rattaché à ce règlement." });
      return;
    }
    if (commissionCollecteDisponible
      && row.commissionCollecteFrequencePaiement === "chaque_paiement"
      && !inclureFraisCollecte) {
      res.status(400).json({
        erreur: "La commission de collecte configurée « au fur et à mesure » doit être réglée avec le paiement du cacao.",
      });
      return;
    }
    if (inclureFraisCollecte && (!livraisonAvecSolde || montantDemande !== montantRestantActuel)) {
      res.status(400).json({
        erreur: "Pour payer les frais de collecte, le montant net du règlement doit être payé intégralement.",
      });
      return;
    }
    const retenueAvancePreview = inclureFraisCollecte
      && row.commissionCollecteId != null
      && row.commissionCollecteMembreId != null
      ? await getRetenueAvanceCommissionPreview(
          row.commissionCollecteId,
          row.commissionCollecteMembreId,
        )
      : 0;
    let montantTotalPaiement = montantDemande + (
      inclureFraisCollecte
        ? Math.max(0, commissionCollecteMontant - retenueAvancePreview)
        : 0
    );

    if (body.montantReglementFcfa != null) {
      if (!Number.isSafeInteger(montantDemande) || montantDemande <= 0) {
        res.status(400).json({ erreur: "Le montant du versement doit être un entier strictement positif." });
        return;
      }
      if (!livraisonAvecSolde) {
        res.status(400).json({ erreur: "Le montant partiel est disponible uniquement pour une livraison à régler." });
        return;
      }
    }
    if (livraisonAvecSolde && (!Number.isSafeInteger(montantDemande) || montantDemande <= 0 || montantDemande > montantRestantActuel)) {
      res.status(422).json({
        erreur: `Le versement doit être compris entre 1 et ${montantRestantActuel.toLocaleString("fr-FR")} FCFA.`,
      });
      return;
    }
    if (!livraisonAvecSolde && montantDemande !== row.paiement.montantFcfa) {
      res.status(400).json({ erreur: "Le montant ne peut pas être modifié pour ce règlement." });
      return;
    }
    const numeroRecuReste = livraisonAvecSolde && montantDemande < montantRestantActuel
      ? await genererNumeroRecu(cooperativeId)
      : null;

    // Le mode peut être fourni si : (a) bon carburant, (b) paiement sans mode
    // pré-sélectionné, ou (c) versement d'une livraison différée.
    const isBonCarburantPaiement = !!row.paiement.bonCarburantId;
    const hasNoMode = row.paiement.modePaiement === null;
    if (body.ventilations !== undefined) {
      if (!Array.isArray(body.ventilations) || body.ventilations.length === 0) {
        res.status(400).json({ erreur: "Ajoutez au moins un moyen de règlement." });
        return;
      }
      if (body.modePaiement) {
        res.status(400).json({ erreur: "Utilisez soit modePaiement, soit ventilations, pas les deux." });
        return;
      }

      const lignes: VentilationPaiement[] = [];
      for (const ligne of body.ventilations) {
        const modeLigne = ligne.modePaiement;
        const montant = Number(ligne.montantFcfa);
        if (!modeLigne || !MODES_VALIDES.includes(modeLigne as typeof MODES_VALIDES[number])) {
          res.status(400).json({ erreur: `Mode de paiement invalide. Valeurs acceptées : ${MODES_VALIDES.join(", ")}.` });
          return;
        }
        if (!Number.isSafeInteger(montant) || montant <= 0) {
          res.status(400).json({ erreur: "Chaque montant de ventilation doit être un entier strictement positif." });
          return;
        }
        if (
          (modeLigne === "orange_money" || modeLigne === "mtn_momo" || modeLigne === "wave")
          && !ligne.referenceTransaction?.trim()
        ) {
          res.status(400).json({ erreur: "La référence de transaction est obligatoire pour chaque paiement mobile money." });
          return;
        }
        lignes.push({
          modePaiement: modeLigne as typeof MODES_VALIDES[number],
          montantFcfa: montant,
          referenceTransaction: ligne.referenceTransaction ?? null,
          telephone: ligne.telephone ?? null,
          numeroCheque: ligne.numeroCheque ?? null,
          banque: ligne.banque ?? null,
          dateEcheance: ligne.dateEcheance ?? null,
        });
      }

      const totalVentile = lignes.reduce((total, ligne) => total + ligne.montantFcfa, 0);
      if (totalVentile !== montantTotalPaiement) {
        res.status(400).json({
          erreur: `Le total ventilé (${totalVentile.toLocaleString("fr-FR")} FCFA) doit être égal au montant à décaisser (${montantTotalPaiement.toLocaleString("fr-FR")} FCFA).`,
        });
        return;
      }
      if (req.user?.role === "delegue" && lignes.some((ligne) => ligne.modePaiement !== "especes")) {
        res.status(403).json({
          erreur: "Un délégué ne peut valider que des paiements en espèces.",
          message: "Les chèques, virements et paiements mobile money doivent être validés par un Directeur, Comptable ou PCA.",
        });
        return;
      }

      const isBonCarburant = !!row.paiement.bonCarburantId;
      const isDepenseVehicule = !!row.paiement.depenseVehiculeId;
      const compteDebitPaiement = isBonCarburant
        ? "6042"
        : isDepenseVehicule
        ? "624"
        : await resolveCompteDetteProducteur(cooperativeId, row.compteDetteProducteur);
      const lignesEspeces = lignes.filter((ligne) => ligne.modePaiement === "especes");
      const lignesMobiles = lignes.filter((ligne) =>
        ligne.modePaiement === "orange_money" || ligne.modePaiement === "mtn_momo" || ligne.modePaiement === "wave",
      );
      const nouveauStatut = lignes.every((ligne) => ligne.modePaiement === "especes") ? "effectue" : "confirme";

      let soldeApresLivraison: number | null = null;
      try {
        await db.transaction(async (tx) => {
          await verrouillerPaiementPourValidation(tx, id);

           const retenueAvance = inclureFraisCollecte
             && row.commissionCollecteId != null
             && row.commissionCollecteMembreId != null
             ? await appliquerRetenueAvanceSurCommissionDansTransaction(
                 tx,
                 row.commissionCollecteId,
                 row.commissionCollecteMembreId,
               )
             : {
                 montantCommissionFcfa: commissionCollecteMontant,
                 retenueFcfa: 0,
                 montantNetFcfa: commissionCollecteMontant,
               };
           montantTotalPaiement = montantDemande + (
             inclureFraisCollecte ? retenueAvance.montantNetFcfa : 0
           );
           if (totalVentile !== montantTotalPaiement) {
             throw new PaiementMontantInvalideError(
               `Le total ventilé (${totalVentile.toLocaleString("fr-FR")} FCFA) ne correspond plus au montant à décaisser (${montantTotalPaiement.toLocaleString("fr-FR")} FCFA).`,
             );
           }

          if (livraisonAvecSolde && row.paiement.livraisonId) {
            const [livraisonVerrouillee] = await tx
              .select({
                montantNetFcfa: livraisonsTable.montantNetFcfa,
                montantRestant: livraisonsTable.montantRestant,
                statutPaiement: livraisonsTable.statutPaiement,
              })
              .from(livraisonsTable)
              .where(eq(livraisonsTable.id, row.paiement.livraisonId))
              .for("update")
              .limit(1);
            const reste = Math.max(0, Math.round(Number(
              livraisonVerrouillee?.montantRestant
              ?? livraisonVerrouillee?.montantNetFcfa
              ?? 0,
            )));
            if (!livraisonVerrouillee || montantDemande > reste) {
              throw new PaiementMontantInvalideError(
                `Le solde de cette livraison a changé. Le montant restant est de ${reste.toLocaleString("fr-FR")} FCFA.`,
              );
            }
            soldeApresLivraison = reste - montantDemande;
          }

          const [paiementMisAJour] = await tx
            .update(paiementsTable)
            .set({
              montantFcfa: montantTotalPaiement,
              statut: nouveauStatut,
              validePar: userId ?? null,
              dateValidation: new Date(),
              referenceTransaction: lignes.length === 1 ? lignes[0]?.referenceTransaction ?? null : null,
              modePaiement: lignes.length === 1 ? lignes[0]!.modePaiement : null,
            })
            .where(and(eq(paiementsTable.id, id), eq(paiementsTable.statut, "en_attente")))
            .returning({ id: paiementsTable.id });
          if (!paiementMisAJour) throw new PaiementDejaTraiteError();

          if (row.paiement.livraisonId) {
            await tx.update(livraisonsTable)
              .set(livraisonAvecSolde
                ? {
                    statutPaiement: soldeApresLivraison === 0 ? "PAYÉ" : "PARTIEL",
                    montantRestant: String(soldeApresLivraison),
                  }
                : { statutPaiement: "PAYÉ" })
              .where(eq(livraisonsTable.id, row.paiement.livraisonId));
          }

          if (inclureFraisCollecte && row.commissionCollecteId != null) {
            const [commissionPayee] = await tx
              .update(commissionsMembresDelaguesTable)
              .set({
                statut: "payé",
                datePaiement: new Date(),
                modePaiement: lignes.length === 1 ? lignes[0]!.modePaiement : "mixte",
                referencePaiement: lignes.length === 1 ? lignes[0]!.referenceTransaction ?? null : null,
                 retenueAvancesFcfa: retenueAvance.retenueFcfa,
              })
              .where(and(
                eq(commissionsMembresDelaguesTable.id, row.commissionCollecteId),
                eq(commissionsMembresDelaguesTable.statut, "en_attente"),
              ))
              .returning({ id: commissionsMembresDelaguesTable.id });
            if (!commissionPayee) throw new PaiementDejaTraiteError();
          }

          if (livraisonAvecSolde && row.paiement.livraisonId && (soldeApresLivraison ?? 0) > 0) {
            await tx.insert(paiementsTable).values({
              cooperativeId,
              livraisonId: row.paiement.livraisonId,
              membreId: row.paiement.membreId,
              campagneId: row.paiement.campagneId,
              montantFcfa: soldeApresLivraison!,
              modePaiement: null,
              statut: "en_attente",
              numeroRecu: numeroRecuReste,
            });
          }

          const lignesInserees = await tx.insert(paiementLignesTable).values(
            lignes.map((ligne) => ({
              paiementId: id,
              modePaiement: ligne.modePaiement,
              montantFcfa: ligne.montantFcfa,
              referenceTransaction: ligne.referenceTransaction ?? null,
              telephone: ligne.telephone ?? null,
              numeroCheque: ligne.numeroCheque ?? null,
              banque: ligne.banque ?? null,
              dateEcheance: ligne.dateEcheance ?? null,
            })),
          ).returning({ id: paiementLignesTable.id });

          if (lignesEspeces.length > 0) {
            const montantEspeces = lignesEspeces.reduce((total, ligne) => total + ligne.montantFcfa, 0);
            if (req.user?.role === "delegue") {
              await debiterCaisseDansTransaction(
                tx, cooperativeId, userId, montantEspeces, id, userId, row.bonCarburantNumero, row.paiement.numeroRecu,
              );
            } else {
              // Toute validation faite par l'administration débite la caisse
              // principale de la coopérative pour la part espèces.
              await debiterCaisseDansTransaction(
                tx, cooperativeId, userId, montantEspeces, id, undefined, row.bonCarburantNumero, row.paiement.numeroRecu,
              );
            }
          }

          for (const ligne of lignesMobiles) {
            await debiterMobileDansTransaction(
              tx,
              cooperativeId,
              ligne.modePaiement,
              ligne.montantFcfa,
              id,
              userId,
              ligne.referenceTransaction,
              row.bonCarburantNumero,
              row.paiement.numeroRecu,
            );
          }

          const ecrituresVentilation: Parameters<typeof proposerEcrituresDansTransaction>[2] = [];
           const montantCommissionNet = inclureFraisCollecte
             ? retenueAvance.montantNetFcfa
             : 0;
           const compteDebitCommission = montantCommissionNet > 0
            ? await resolveCompteDebit(cooperativeId, "commissions_delegues", "paiement_commission", "6322")
            : null;
          let producteurRestant = montantDemande;
           let commissionRestante = montantCommissionNet;
          for (let index = 0; index < lignes.length; index += 1) {
            const ligne = lignes[index]!;
            const ligneInseree = lignesInserees[index]!;
            if (ligne.modePaiement === "cheque") {
              await tx.insert(chequesEmisTable).values({
                cooperativeId,
                numeroCheque: ligne.numeroCheque ?? null,
                beneficiaire: beneficiairePaiement,
                montantFcfa: ligne.montantFcfa,
                paiementId: id,
                paiementLigneId: ligneInseree.id,
                membreId: row.paiement.membreId ?? null,
                livraisonId: row.paiement.livraisonId ?? null,
                dateEmission: new Date().toISOString().slice(0, 10),
                dateEcheance: ligne.dateEcheance ?? null,
                statut: "emis",
                createdBy: userId ?? null,
              });
            }

            const compteCredit = ligne.modePaiement === "especes"
              ? "571"
              : ligne.modePaiement === "orange_money" || ligne.modePaiement === "mtn_momo" || ligne.modePaiement === "wave"
              ? "552"
              : "521";
            const montantProducteur = Math.min(producteurRestant, ligne.montantFcfa);
            const montantCommission = Math.min(
              commissionRestante,
              Math.max(0, ligne.montantFcfa - montantProducteur),
            );
            if (montantProducteur > 0) {
              ecrituresVentilation.push({
                source: "paiement",
                sourceId: id,
                libelle: isBonCarburant
                  ? `Carburant – Bon PAI-${id} (${ligne.modePaiement})`
                  : isDepenseVehicule
                  ? `Pièce de rechange – ${beneficiairePaiement} (${ligne.modePaiement})`
                  : `Paiement producteur – ${beneficiairePaiement} (${ligne.modePaiement})`,
                compteDebit: compteDebitPaiement,
                compteCredit,
                montantFcfa: montantProducteur,
                date: new Date().toISOString().slice(0, 10),
                numeroPiece: `PAI-${id}`,
                tiersId: isBonCarburant || isDepenseVehicule ? undefined : (row.paiement.membreId ?? undefined),
                tiersType: isBonCarburant || isDepenseVehicule ? undefined : "membre",
              });
            }
            if (montantCommission > 0 && row.commissionCollecteMembreId != null) {
              ecrituresVentilation.push({
                source: "commission_delegue",
                sourceId: row.commissionCollecteMembreId,
                libelle: `Frais de collecte – ${beneficiairePaiement} (${ligne.modePaiement})`,
                compteDebit: compteDebitCommission!,
                compteCredit,
                montantFcfa: montantCommission,
                date: new Date().toISOString().slice(0, 10),
                numeroPiece: `COM-${row.commissionCollecteMembreId}-${new Date().toISOString().slice(0, 10)}`,
                tiersId: row.commissionCollecteMembreId,
                tiersType: "delegue",
              });
            }
            producteurRestant -= montantProducteur;
            commissionRestante -= montantCommission;
          }
           if (retenueAvance.retenueFcfa > 0 && row.commissionCollecteMembreId != null) {
             ecrituresVentilation.push({
               source: "avance",
               sourceId: row.commissionCollecteMembreId,
               libelle: `Retenue avance sur commission – ${beneficiairePaiement}`,
               compteDebit: "401",
               compteCredit: "4091",
               montantFcfa: retenueAvance.retenueFcfa,
               date: new Date().toISOString().slice(0, 10),
               numeroPiece: `AV-${row.commissionCollecteMembreId}-${new Date().toISOString().slice(0, 10)}`,
               tiersId: row.commissionCollecteMembreId,
               tiersType: "membre",
             });
           }
          await proposerEcrituresDansTransaction(tx, cooperativeId, ecrituresVentilation);
        });
      } catch (err) {
        if (err instanceof PaiementDejaTraiteError) {
          res.status(err.status).json({ erreur: err.message });
          return;
        }
        if (err instanceof PaiementMontantInvalideError) {
          res.status(err.status).json({ erreur: err.message });
          return;
        }
        const message = err instanceof Error ? err.message : "Impossible de valider le règlement";
        if (/insuffisant|Aucune caisse|session de caisse|Mobile Marchand/i.test(message)) {
          res.status(422).json({ erreur: message });
          return;
        }
        throw err;
      }

      if (row.paiement.membreId) void envoyerPushGroupePortail([row.paiement.membreId], {
        title: "✅ Paiement validé",
        body: `${new Intl.NumberFormat("fr-FR").format(montantTotalPaiement)} FCFA — règlement ventilé`,
        url: "/paiements",
      });
      const updated = await fetchEnrichedPaiement(id);
      res.json(updated);
      return;
    }
    if (body.modePaiement && !isBonCarburantPaiement && !hasNoMode && !livraisonAvecSolde) {
      res.status(400).json({
        erreur: "Le mode de paiement ne peut être modifié que pour les règlements sans mode pré-sélectionné ou pour les bons carburant.",
      });
      return;
    }
    if (hasNoMode && !body.modePaiement) {
      res.status(400).json({ erreur: "Veuillez choisir un mode de paiement pour valider ce règlement." });
      return;
    }
    if (body.modePaiement && !MODES_VALIDES.includes(body.modePaiement as typeof MODES_VALIDES[number])) {
      res.status(400).json({
        erreur: `Mode de paiement invalide. Valeurs acceptées : ${MODES_VALIDES.join(", ")}.`,
      });
      return;
    }
    const modeOverride = (isBonCarburantPaiement || hasNoMode || livraisonAvecSolde) && body.modePaiement
      ? (body.modePaiement as typeof MODES_VALIDES[number])
      : null;
    const mode = (modeOverride ?? row.paiement.modePaiement) as string;
    const isMobileMarchand = mode === "orange_money" || mode === "mtn_momo" || mode === "wave";

    // Un délégué ne peut valider que les paiements en espèces (toutes sources confondues)
    if (req.user?.role === "delegue" && mode !== "especes") {
      res.status(403).json({
        erreur: "Accès refusé",
        message: "Un délégué ne peut valider que des paiements en espèces. Les règlements par chèque, virement ou mobile money doivent être validés par un Directeur, Comptable ou PCA.",
      });
      return;
    }

    // Référence transaction obligatoire pour les paiements mobile marchand
    if (isMobileMarchand && !body.referenceTransaction?.trim()) {
      res.status(400).json({ erreur: "La référence de transaction est obligatoire pour un paiement mobile money." });
      return;
    }

    const nouveauStatut = mode === "especes" ? "effectue" : "confirme";
    const isDelegueEspeces = req.user?.role === "delegue" && mode === "especes";

    // 1. Pré-vérifier la caisse avant la transaction pour éviter un état incohérent
    //    (paiement marqué effectue mais caisse non débitée)
    if (isDelegueEspeces && userId && cooperativeId) {
      try {
        await verifierCaisseEspeces(userId, cooperativeId, montantTotalPaiement);
      } catch (err) {
        res.status(422).json({ erreur: (err as Error).message });
        return;
      }
    }

    // Pré-vérification compte Mobile Marchand (avant la transaction)
    if (isMobileMarchand && cooperativeId) {
      const operateurLabel: Record<string, string> = {
        orange_money: "Orange Money",
        mtn_momo:     "MTN MoMo",
        wave:         "Wave",
      };
      const label = operateurLabel[mode] ?? mode;

      const [compteMobile] = await db
        .select({
          id:              comptesMobilesMarchandsTable.id,
          nom:             comptesMobilesMarchandsTable.nom,
          soldeActuelFcfa: comptesMobilesMarchandsTable.soldeActuelFcfa,
        })
        .from(comptesMobilesMarchandsTable)
        .where(
          and(
            eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
            eq(comptesMobilesMarchandsTable.operateur, mode as "wave" | "orange_money" | "mtn_momo"),
            eq(comptesMobilesMarchandsTable.actif, true),
          ),
        )
        .limit(1);

      if (!compteMobile) {
        res.status(422).json({
          erreur: `Aucun compte Mobile Marchand ${label} actif n'est configuré. Créez un compte dans la page Caisse avant de valider des paiements ${label}.`,
        });
        return;
      }

      const soldeMobile = parseFloat(String(compteMobile.soldeActuelFcfa));
      if (soldeMobile < montantTotalPaiement) {
        res.status(422).json({
          erreur: `Solde ${label} insuffisant (compte « ${compteMobile.nom} »). Disponible : ${soldeMobile.toLocaleString("fr-FR")} FCFA, requis : ${montantTotalPaiement.toLocaleString("fr-FR")} FCFA.`,
        });
        return;
      }
    }

    // Pré-vérification Caisse Centrale pour espèces hors-délégué (membre base centrale)
    const isNonDelegueEspeces = req.user?.role !== "delegue" && mode === "especes";
    if (isNonDelegueEspeces && cooperativeId) {
      const [caisseCentrale] = await db
        .select({
          id:             caissesTable.id,
          soldeActuelFcfa: caissesTable.soldeActuelFcfa,
        })
        .from(caissesTable)
        .where(
          and(
            eq(caissesTable.cooperativeId, cooperativeId),
            eq(caissesTable.typeCaisse, "centrale"),
            eq(caissesTable.actif, true),
          ),
        )
        .limit(1);

      if (!caisseCentrale) {
        res.status(422).json({ erreur: "Aucun compte valide n'a été trouvé pour ce mode de paiement." });
        return;
      }

      // Vérifier qu'une session de caisse est ouverte aujourd'hui
      const sessionCentrale = await getSessionActive(caisseCentrale.id);
      if (!sessionCentrale) {
        res.status(422).json({
          erreur: "Aucune session de caisse ouverte. Ouvrez une session dans la page Caisse avant de valider des paiements en espèces.",
        });
        return;
      }

      if (parseFloat(String(caisseCentrale.soldeActuelFcfa)) < montantTotalPaiement) {
        res.status(422).json({ erreur: "Fonds insuffisants sur le compte pour effectuer ce paiement." });
        return;
      }
    }

    let soldeApresLivraison: number | null = null;
    await db.transaction(async (tx) => {
      await verrouillerPaiementPourValidation(tx, id);

      const retenueAvance = inclureFraisCollecte
        && row.commissionCollecteId != null
        && row.commissionCollecteMembreId != null
        ? await appliquerRetenueAvanceSurCommissionDansTransaction(
            tx,
            row.commissionCollecteId,
            row.commissionCollecteMembreId,
          )
        : {
            montantCommissionFcfa: commissionCollecteMontant,
            retenueFcfa: 0,
            montantNetFcfa: commissionCollecteMontant,
          };
      montantTotalPaiement = montantDemande + (
        inclureFraisCollecte ? retenueAvance.montantNetFcfa : 0
      );

      if (livraisonAvecSolde && row.paiement.livraisonId) {
        const [livraisonVerrouillee] = await tx
          .select({
            montantNetFcfa: livraisonsTable.montantNetFcfa,
            montantRestant: livraisonsTable.montantRestant,
          })
          .from(livraisonsTable)
          .where(eq(livraisonsTable.id, row.paiement.livraisonId))
          .for("update")
          .limit(1);
        const reste = Math.max(0, Math.round(Number(
          livraisonVerrouillee?.montantRestant
          ?? livraisonVerrouillee?.montantNetFcfa
          ?? 0,
        )));
        if (!livraisonVerrouillee || montantDemande > reste) {
          throw new PaiementMontantInvalideError(
            `Le solde de cette livraison a changé. Le montant restant est de ${reste.toLocaleString("fr-FR")} FCFA.`,
          );
        }
        soldeApresLivraison = reste - montantDemande;
      }

      // La condition sur le statut rend la validation idempotente.
      const [paiementMisAJour] = await tx
        .update(paiementsTable)
        .set({
          montantFcfa: montantTotalPaiement,
          statut: nouveauStatut as "effectue" | "confirme",
          validePar: userId ?? null,
          dateValidation: new Date(),
          referenceTransaction: body.referenceTransaction ?? row.paiement.referenceTransaction,
          ...(modeOverride ? { modePaiement: modeOverride } : {}),
        })
        .where(and(
          eq(paiementsTable.id, id),
          eq(paiementsTable.statut, "en_attente"),
        ))
        .returning({ id: paiementsTable.id });

      if (!paiementMisAJour) {
        throw new PaiementDejaTraiteError();
      }

      if (row.paiement.livraisonId) {
        await tx
          .update(livraisonsTable)
          .set(livraisonAvecSolde
            ? {
                statutPaiement: soldeApresLivraison === 0 ? "PAYÉ" : "PARTIEL",
                montantRestant: String(soldeApresLivraison),
              }
            : { statutPaiement: "PAYÉ" })
          .where(eq(livraisonsTable.id, row.paiement.livraisonId));
      }

      if (inclureFraisCollecte && row.commissionCollecteId != null) {
        const [commissionPayee] = await tx
          .update(commissionsMembresDelaguesTable)
          .set({
            statut: "payé",
            datePaiement: new Date(),
            modePaiement: mode,
            referencePaiement: body.referenceTransaction ?? null,
            retenueAvancesFcfa: retenueAvance.retenueFcfa,
          })
          .where(and(
            eq(commissionsMembresDelaguesTable.id, row.commissionCollecteId),
            eq(commissionsMembresDelaguesTable.statut, "en_attente"),
          ))
          .returning({ id: commissionsMembresDelaguesTable.id });
        if (!commissionPayee) throw new PaiementDejaTraiteError();
      }

      if (livraisonAvecSolde && row.paiement.livraisonId && (soldeApresLivraison ?? 0) > 0) {
        await tx.insert(paiementsTable).values({
          cooperativeId,
          livraisonId: row.paiement.livraisonId,
          membreId: row.paiement.membreId,
          campagneId: row.paiement.campagneId,
          montantFcfa: soldeApresLivraison!,
          modePaiement: null,
          statut: "en_attente",
          numeroRecu: numeroRecuReste,
        });
      }

      const isBonCarburant = !!row.paiement.bonCarburantId;
      const isDepenseVehicule = !!row.paiement.depenseVehiculeId;
      const isMobile = mode === "orange_money" || mode === "mtn_momo" || mode === "wave";
      const compteDebitPaiement = isBonCarburant
        ? "6042"
        : isDepenseVehicule
        ? "624"
        : await resolveCompteDetteProducteur(cooperativeId, row.compteDetteProducteur);

      if (mode === "especes" && cooperativeId) {
        if (isDelegueEspeces) {
          await debiterCaisseDansTransaction(
            tx, cooperativeId, userId, montantTotalPaiement, id, userId, row.bonCarburantNumero, row.paiement.numeroRecu,
          );
        } else {
          await debiterCaisseDansTransaction(
            tx, cooperativeId, userId, montantTotalPaiement, id, undefined, row.bonCarburantNumero, row.paiement.numeroRecu,
          );
        }
      }

      if (isMobile) {
        await debiterMobileDansTransaction(
          tx,
          cooperativeId,
          mode,
          montantTotalPaiement,
          id,
          userId,
          body.referenceTransaction ?? row.paiement.referenceTransaction,
          row.bonCarburantNumero,
          row.paiement.numeroRecu,
        );
      }

      const [ligneInseree] = await tx.insert(paiementLignesTable).values({
        paiementId: id,
        modePaiement: mode as "especes" | "cheque" | "virement" | "orange_money" | "mtn_momo" | "wave",
        montantFcfa: montantTotalPaiement,
        referenceTransaction: body.referenceTransaction ?? null,
        numeroCheque: mode === "cheque" ? body.numeroCheque ?? null : null,
        banque: mode === "cheque" ? body.banque ?? null : null,
        dateEcheance: mode === "cheque" ? body.dateEcheance ?? null : null,
      }).returning({ id: paiementLignesTable.id });

      if (mode === "cheque") {
        await tx.insert(chequesEmisTable).values({
          cooperativeId,
          numeroCheque: body.numeroCheque ?? null,
          beneficiaire: beneficiairePaiement,
          montantFcfa: montantTotalPaiement,
          paiementId: id,
          paiementLigneId: ligneInseree!.id,
          membreId: row.paiement.membreId ?? null,
          livraisonId: row.paiement.livraisonId ?? null,
          dateEmission: new Date().toISOString().slice(0, 10),
          dateEcheance: body.dateEcheance ?? null,
          statut: "emis",
          createdBy: userId ?? null,
        });
      }

      const ecrituresPaiement: Parameters<typeof proposerEcrituresDansTransaction>[2] = [{
        source: "paiement",
        sourceId: id,
        libelle: isBonCarburant
          ? `Carburant – Bon PAI-${id}`
          : isDepenseVehicule
          ? `Pièce de rechange – ${beneficiairePaiement}`
          : `Paiement producteur – ${beneficiairePaiement}`,
        compteDebit: compteDebitPaiement,
        compteCredit: isMobile ? "552" : mode === "especes" ? "571" : "521",
        montantFcfa: montantDemande,
        date: new Date().toISOString().slice(0, 10),
        numeroPiece: `PAI-${id}`,
        tiersId: isBonCarburant || isDepenseVehicule ? undefined : (row.paiement.membreId ?? undefined),
        tiersType: isBonCarburant || isDepenseVehicule ? undefined : "membre",
      }];
      if (inclureFraisCollecte && row.commissionCollecteMembreId != null && retenueAvance.montantNetFcfa > 0) {
        const compteDebitCommission = await resolveCompteDebit(
          cooperativeId,
          "commissions_delegues",
          "paiement_commission",
          "6322",
        );
        ecrituresPaiement.push({
          source: "commission_delegue",
          sourceId: row.commissionCollecteMembreId,
          libelle: `Frais de collecte – ${beneficiairePaiement}`,
          compteDebit: compteDebitCommission,
          compteCredit: isMobile ? "552" : mode === "especes" ? "571" : "521",
          montantFcfa: retenueAvance.montantNetFcfa,
          date: new Date().toISOString().slice(0, 10),
          numeroPiece: `COM-${row.commissionCollecteMembreId}-${new Date().toISOString().slice(0, 10)}`,
          tiersId: row.commissionCollecteMembreId,
          tiersType: "delegue",
        });
      }
      if (inclureFraisCollecte && row.commissionCollecteMembreId != null && retenueAvance.retenueFcfa > 0) {
        ecrituresPaiement.push({
          source: "avance",
          sourceId: row.commissionCollecteMembreId,
          libelle: `Retenue avance sur commission – ${beneficiairePaiement}`,
          compteDebit: "401",
          compteCredit: "4091",
          montantFcfa: retenueAvance.retenueFcfa,
          date: new Date().toISOString().slice(0, 10),
          numeroPiece: `AV-${row.commissionCollecteMembreId}-${new Date().toISOString().slice(0, 10)}`,
          tiersId: row.commissionCollecteMembreId,
          tiersType: "membre",
        });
      }
      await proposerEcrituresDansTransaction(tx, cooperativeId, ecrituresPaiement);
    });

    // Notifier le producteur (best-effort)
    if (row.paiement.membreId) void envoyerPushGroupePortail([row.paiement.membreId], {
      title: "✅ Paiement validé",
      body: `${new Intl.NumberFormat("fr-FR").format(montantTotalPaiement)} FCFA — ${mode === "orange_money" ? "Orange Money" : mode === "mtn_momo" ? "MTN MoMo" : mode === "wave" ? "Wave" : mode === "cheque" ? "Chèque" : "Espèces"}`,
      url: "/paiements",
    });

    const updated = await fetchEnrichedPaiement(id);
    res.json(updated);
  } catch (err) {
    if (err instanceof PaiementDejaTraiteError) {
      res.status(err.status).json({ erreur: err.message });
      return;
    }
    if (err instanceof PaiementMontantInvalideError) {
      res.status(err.status).json({ erreur: err.message });
      return;
    }
    req.log.error({ err }, "Erreur validerPaiement");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── POST /paiements/carburant/valider-lot ──────────────────────────────────

export async function validerLotPaiementsCarburant(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const body = (req.body ?? {}) as {
    paiementIds?: unknown;
    modePaiement?: string;
    referenceTransaction?: string | null;
    compteBancaireId?: number | null;
    dateReglement?: string | null;
  };
  const paiementIds = Array.isArray(body.paiementIds)
    ? [...new Set(body.paiementIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))]
        .sort((a, b) => a - b)
    : [];
  const modesLot = ["especes", "virement", "orange_money", "mtn_momo", "wave"] as const;
  const mode = body.modePaiement as typeof modesLot[number] | undefined;

  if (paiementIds.length === 0 || paiementIds.length > 200) {
    res.status(400).json({ erreur: "Sélectionnez entre 1 et 200 bons carburant." });
    return;
  }
  if (!mode || !modesLot.includes(mode)) {
    res.status(400).json({ erreur: "Le règlement groupé accepte les espèces, le virement et le mobile money." });
    return;
  }
  if ((mode === "orange_money" || mode === "mtn_momo" || mode === "wave") && !body.referenceTransaction?.trim()) {
    res.status(400).json({ erreur: "La référence de transaction est obligatoire pour un règlement mobile money." });
    return;
  }
  if (mode === "virement" && (!body.compteBancaireId || !Number.isInteger(Number(body.compteBancaireId)))) {
    res.status(400).json({ erreur: "Sélectionnez le compte bancaire à débiter." });
    return;
  }
  const dateReglement = body.dateReglement ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReglement)) {
    res.status(400).json({ erreur: "La date du règlement doit être au format AAAA-MM-JJ." });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: paiementsTable.id,
          montantFcfa: paiementsTable.montantFcfa,
          statut: paiementsTable.statut,
          bonCarburantId: paiementsTable.bonCarburantId,
          numeroBon: bonsCarburantTable.numero,
          cooperativeBonId: bonsCarburantTable.cooperativeId,
        })
        .from(paiementsTable)
        .innerJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
        .where(and(
          inArray(paiementsTable.id, paiementIds),
          eq(bonsCarburantTable.cooperativeId, cooperativeId),
        ))
        .for("update");

      if (rows.length !== paiementIds.length) {
        throw new PaiementMontantInvalideError("Un ou plusieurs paiements sélectionnés n'appartiennent pas à votre coopérative ou ne sont pas des bons carburant.");
      }
      const nonEligibles = rows.filter((row) => row.statut !== "en_attente");
      if (nonEligibles.length > 0) {
        throw new PaiementDejaTraiteError();
      }

      const montantTotal = rows.reduce((total, row) => total + Number(row.montantFcfa), 0);
      if (!Number.isSafeInteger(montantTotal) || montantTotal <= 0) {
        throw new PaiementMontantInvalideError("Le montant total des bons sélectionnés est invalide.");
      }

      const reference = body.referenceTransaction?.trim() || `CARB-${dateReglement}-${paiementIds[0]}`;
      const libelle = `Règlement groupé carburant — ${rows.length} bons`;
      const isMobile = mode === "orange_money" || mode === "mtn_momo" || mode === "wave";

      if (mode === "especes") {
        await debiterCaissePourLotCarburant(
          tx,
          cooperativeId,
          userId,
          montantTotal,
          req.user?.role === "delegue" ? userId : undefined,
          reference,
        );
      } else if (isMobile) {
        await debiterMobilePourLotCarburant(tx, cooperativeId, mode, montantTotal, userId, reference);
      } else {
        await enregistrerMouvementBanque(
          Number(body.compteBancaireId),
          cooperativeId,
          {
            type: "debit",
            motif: "carburant",
            montantFcfa: montantTotal,
            libelle,
            reference,
            dateOperation: dateReglement,
            userId,
            skipAccounting: true,
          },
          tx,
        );
      }

      const nouveauStatut = mode === "especes" ? "effectue" : "confirme";
      const compteCredit = isMobile ? "552" : mode === "especes" ? "571" : "521";
      const dateValidation = new Date(`${dateReglement}T12:00:00.000Z`);

      for (const row of rows) {
        const [updated] = await tx
          .update(paiementsTable)
          .set({
            statut: nouveauStatut,
            modePaiement: mode,
            referenceTransaction: reference,
            validePar: userId ?? null,
            dateValidation,
          })
          .where(and(
            eq(paiementsTable.id, row.id),
            eq(paiementsTable.statut, "en_attente"),
          ))
          .returning({ id: paiementsTable.id });
        if (!updated) throw new PaiementDejaTraiteError();

        await tx.insert(paiementLignesTable).values({
          paiementId: row.id,
          modePaiement: mode,
          montantFcfa: row.montantFcfa,
          referenceTransaction: reference,
        });

        await proposerEcrituresDansTransaction(tx, cooperativeId, [{
          source: "paiement",
          sourceId: row.id,
          libelle: `Carburant – Bon ${row.numeroBon ?? `PAI-${row.id}`}`,
          compteDebit: "6042",
          compteCredit,
          montantFcfa: row.montantFcfa,
          date: dateReglement,
          numeroPiece: `PAI-${row.id}`,
        }]);
      }

      return {
        reference,
        paiementIds: rows.map((row) => row.id),
        nombrePaiements: rows.length,
        montantTotal,
        statut: nouveauStatut,
      };
    });

    res.json(result);
  } catch (err) {
    if (err instanceof PaiementDejaTraiteError) {
      res.status(err.status).json({ erreur: "Un ou plusieurs bons sélectionnés ont déjà été réglés. Actualisez la liste avant de recommencer." });
      return;
    }
    if (err instanceof PaiementMontantInvalideError) {
      res.status(err.status).json({ erreur: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Impossible de régler les bons sélectionnés";
    if (/insuffisant|Aucune caisse|session de caisse|Mobile Marchand|Compte bancaire/i.test(message)) {
      res.status(422).json({ erreur: message });
      return;
    }
    req.log.error({ err }, "Erreur validerLotPaiementsCarburant");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── POST /paiements/:id/rejeter ─────────────────────────────────────────────

export async function rejeterPaiement(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) {
    res.status(400).json({ erreur: "ID invalide" });
    return;
  }

  const body = (req.body ?? {}) as { motifRejet: string };
  if (!body.motifRejet?.trim()) {
    res.status(400).json({ erreur: "Le motif de rejet est obligatoire" });
    return;
  }

  try {
    const [row] = await db
      .select({
        paiement: paiementsTable,
        membreCoopId: membresTable.cooperativeId,
        telephone: membresTable.telephone,
        nom: membresTable.nom,
        fournisseurCoopId: fournisseursTable.cooperativeId,
        bonCarburantCoopId: bonsCarburantTable.cooperativeId,
        depenseVehiculeCoopId: depensesVehiculeTable.cooperativeId,
        livraisonStatutPaiement: livraisonsTable.statutPaiement,
        livraisonMontantNetFcfa: livraisonsTable.montantNetFcfa,
        livraisonMontantRestant: sql<number>`coalesce(${livraisonsTable.montantRestant}, '0')::integer`,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
      .leftJoin(depensesVehiculeTable, eq(paiementsTable.depenseVehiculeId, depensesVehiculeTable.id))
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId && row.fournisseurCoopId !== cooperativeId && row.bonCarburantCoopId !== cooperativeId && row.depenseVehiculeCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce paiement n'appartient pas à votre coopérative" });
      return;
    }
    if (row.paiement.statut !== "en_attente") {
      res.status(409).json({ erreur: `Statut actuel : ${row.paiement.statut}. Seuls les paiements en_attente peuvent être rejetés.` });
      return;
    }

    const livraisonAvecSolde = !!row.paiement.livraisonId && estLivraisonAvecSolde(row.livraisonStatutPaiement);
    const numeroRecuRemplacement = livraisonAvecSolde ? await genererNumeroRecu(cooperativeId) : null;

    await db.transaction(async (tx) => {
      // 1. Rejeter le paiement
      const [paiementRejete] = await tx
        .update(paiementsTable)
        .set({
          statut: "rejete",
          validePar: userId ?? null,
          dateValidation: new Date(),
          motifRejet: body.motifRejet.trim(),
        })
        .where(and(eq(paiementsTable.id, id), eq(paiementsTable.statut, "en_attente")))
        .returning({ id: paiementsTable.id });
      if (!paiementRejete) throw new PaiementDejaTraiteError();

      // 2. Préserver le solde d'une livraison partiellement payée et recréer
      // un règlement actionnable après le rejet du versement courant.
      if (row.paiement.livraisonId) {
        let reste = 0;
        if (livraisonAvecSolde) {
          const [livraisonVerrouillee] = await tx
            .select({
              montantNetFcfa: livraisonsTable.montantNetFcfa,
              montantRestant: livraisonsTable.montantRestant,
            })
            .from(livraisonsTable)
            .where(eq(livraisonsTable.id, row.paiement.livraisonId))
            .for("update")
            .limit(1);
          reste = Math.max(0, Math.round(Number(
            livraisonVerrouillee?.montantRestant
            ?? livraisonVerrouillee?.montantNetFcfa
            ?? 0,
          )));
        }
        await tx
          .update(livraisonsTable)
          .set(livraisonAvecSolde
            ? {
                statutPaiement: reste < Math.round(Number(row.livraisonMontantNetFcfa ?? 0)) ? "PARTIEL" : "EN_ATTENTE",
                montantRestant: String(reste),
              }
            : { statutPaiement: "EN_ATTENTE" })
          .where(eq(livraisonsTable.id, row.paiement.livraisonId));

        if (livraisonAvecSolde && reste > 0) {
          await tx.insert(paiementsTable).values({
            cooperativeId,
            livraisonId: row.paiement.livraisonId,
            membreId: row.paiement.membreId,
            campagneId: row.paiement.campagneId,
            montantFcfa: reste,
            modePaiement: null,
            statut: "en_attente",
            numeroRecu: numeroRecuRemplacement,
          });
        }
      }
    });

    // 3. Notifier le producteur (best-effort)
    if (row.paiement.membreId) void envoyerPushGroupePortail([row.paiement.membreId], {
      title: "❌ Paiement rejeté",
      body: `Motif : ${body.motifRejet.trim().slice(0, 120)}`,
      url: "/paiements",
    });

    const updated = await fetchEnrichedPaiement(id);
    res.json(updated);
  } catch (err) {
    if (err instanceof PaiementDejaTraiteError) {
      res.status(err.status).json({ erreur: err.message });
      return;
    }
    req.log.error({ err }, "Erreur rejeterPaiement");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
