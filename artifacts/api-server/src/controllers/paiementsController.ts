import { type Request, type Response } from "express";
import { db, paiementsTable, paiementLignesTable, membresTable, livraisonsTable, fournisseursTable, usersTable, comptesMobilesMarchandsTable, mouvementsMobileMarchandTable, caissesTable, sessionsCaisseTable, mouvementsCaisseTable, chequesEmisTable, bonsCarburantTable } from "@workspace/db";
import { eq, desc, and, or, sql, gte, lt, lte, inArray, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { envoyerPushGroupePortail, envoyerPushGroupe } from "../services/pushService";
import { proposerEcrituresDansTransaction, resolveCompteDetteProducteur } from "../services/comptabiliteService.js";
import { verifierCaisseEspeces, debiterCaisseParResponsable, enregistrerMouvement, getSessionActive } from "../services/caisseService.js";
import { notifierParRole } from "../services/notificationService.js";
import { logger } from "../lib/logger.js";
import type { ComptabiliteTransaction } from "../services/comptabiliteService.js";

// ─── Helper ─────────────────────────────────────────────────────────────────

class PaiementDejaTraiteError extends Error {
  readonly status = 409;
  constructor() {
    super("Ce paiement a déjà été traité. Aucune écriture supplémentaire n'a été créée.");
    this.name = "PaiementDejaTraiteError";
  }
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
        libelle:        `Paiement producteur — règlement #${paiementId}`,
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

// ─── Helper : débit automatique Caisse Centrale ─────────────────────────────

async function debiterCaisseCentralePaiement(
  cooperativeId: number,
  montantFcfa: number,
  paiementId: number,
  userId: number | null | undefined,
  opts?: { compteDebitOverride?: string; libelle?: string; skipAccounting?: boolean },
): Promise<void> {
  try {
    const [caisse] = await db
      .select()
      .from(caissesTable)
      .where(
        and(
          eq(caissesTable.cooperativeId, cooperativeId),
          eq(caissesTable.typeCaisse, "centrale"),
          eq(caissesTable.actif, true),
        ),
      )
      .limit(1);

    if (!caisse) {
      logger.warn({ cooperativeId, paiementId }, "Aucune caisse centrale active trouvée pour débit automatique");
      return;
    }

    const result = await enregistrerMouvement(caisse.id, {
      type: "sortie",
      motif: opts?.compteDebitOverride === "6042" ? "carburant" : "paiement_producteur",
      montantFcfa,
      libelle: opts?.libelle ?? `Paiement producteur — règlement #${paiementId}`,
      userId: userId ?? undefined,
      compteDebitOverride: opts?.compteDebitOverride,
      skipAccounting: opts?.skipAccounting,
    });

    // Notifier si le solde passe sous le fond minimum configuré
    if (result.alerte) {
      void notifierCaisseCentraleSousSeuil(
        cooperativeId,
        caisse.id,
        caisse.nom,
        result.soldeActuel,
        paiementId,
      );
    }
  } catch (err) {
    logger.warn({ err, paiementId }, "Débit automatique caisse centrale non effectué — session peut-être fermée");
  }
}

// ─── Sélection enrichie partagée ────────────────────────────────────────────

const agentAlias = usersTable;
// Alias SQL pour joindre la table users sur livraisons.agent_id (séparation délégué / base centrale)
const agentUserAlias = alias(usersTable, "agent_user");
// Alias SQL pour joindre la table users sur paiements.agent_saisiseur_id (mode proxy gérant)
const saisiseurUserAlias = alias(usersTable, "saisiseur_user");

const SELECT_FIELDS = {
  id: paiementsTable.id,
  livraisonId: paiementsTable.livraisonId,
  bonCarburantId: paiementsTable.bonCarburantId,
  bonCarburantNumero: bonsCarburantTable.numero,
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
  montantNetFcfa: livraisonsTable.montantNetFcfa,
  compteDetteProducteur: livraisonsTable.compteDetteProducteur,
  agentId: livraisonsTable.agentId,
  // Attribution proxy gérant
  agentSaisiseurId: paiementsTable.agentSaisiseurId,
  agentSaisiseurNom: saisiseurUserAlias.nom,
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
    .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
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
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "100")));

    const coopFilter = or(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(fournisseursTable.cooperativeId, cooperativeId),
      eq(bonsCarburantTable.cooperativeId, cooperativeId),
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
    if (periode === "today") {
      conditions.push(gte(paiementsTable.createdAt, startOfDay(now)));
    } else if (periode === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      conditions.push(gte(paiementsTable.createdAt, weekAgo));
    } else if (periode === "month") {
      conditions.push(gte(paiementsTable.createdAt, startOfMonth(now)));
    }

    const paiements = await db
      .select(SELECT_FIELDS)
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(agentUserAlias, eq(livraisonsTable.agentId, agentUserAlias.id))
      .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
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

    const statsCoopFilter = or(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(fournisseursTable.cooperativeId, cooperativeId),
      eq(bonsCarburantTable.cooperativeId, cooperativeId),
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
        statut: paiementsTable.statut,
        montantFcfa: paiementsTable.montantFcfa,
        dateValidation: paiementsTable.dateValidation,
        createdAt: paiementsTable.createdAt,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(agentUserAlias, eq(livraisonsTable.agentId, agentUserAlias.id))
      .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
      .where(and(...statsConditions));

    let enAttente = { count: 0, montant_total: 0 };
    let valideAujourdhui = { count: 0, montant_total: 0 };
    let rejete = { count: 0 };
    let effectueCeMois = { montant_total: 0 };

    for (const r of rows) {
      if (r.statut === "en_attente") {
        enAttente.count++;
        enAttente.montant_total += r.montantFcfa;
      }
      if ((r.statut === "confirme" || r.statut === "effectue" || r.statut === "en_cours") && r.dateValidation) {
        const dv = new Date(r.dateValidation);
        if (dv >= todayStart) {
          valideAujourdhui.count++;
          valideAujourdhui.montant_total += r.montantFcfa;
        }
      }
      if (r.statut === "rejete") {
        rejete.count++;
      }
      if ((r.statut === "effectue" || r.statut === "confirme" || r.statut === "en_cours") && r.dateValidation) {
        const dv = new Date(r.dateValidation);
        if (dv >= monthStart && dv <= monthEnd) {
          effectueCeMois.montant_total += r.montantFcfa;
        }
      }
    }

    res.json({
      en_attente: enAttente,
      valide_aujourd_hui: valideAujourdhui,
      rejete,
      effectue_ce_mois: effectueCeMois,
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

  const [session] = await tx
    .select()
    .from(sessionsCaisseTable)
    .where(and(
      eq(sessionsCaisseTable.caisseId, caisse.id),
      eq(sessionsCaisseTable.statut, "ouverte"),
    ))
    .limit(1);
  if (!session) {
    throw new Error("Aucune session de caisse ouverte. Ouvrez une session dans la page Caisse avant de valider des paiements en espèces.");
  }

  const solde = parseFloat(String(caisse.soldeActuelFcfa));
  const montant = Math.round(montantFcfa);
  if (solde < montant) {
    throw new Error(`Solde caisse insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA, requis : ${montant.toLocaleString("fr-FR")} FCFA`);
  }
  const nouveauSolde = solde - montant;
  await tx.insert(mouvementsCaisseTable).values({
    caisseId: caisse.id,
    sessionId: session.id,
    cooperativeId,
    type: "sortie",
    motif: "paiement_producteur",
    montantFcfa: montant.toString(),
    libelle: `Paiement producteur — règlement #${paiementId}`,
    referenceOperation: `PAI-${paiementId}`,
    soldeApresFcfa: nouveauSolde.toString(),
    enregistrePar: userId ?? null,
  });
  await tx.update(caissesTable)
    .set({ soldeActuelFcfa: nouveauSolde.toString() })
    .where(eq(caissesTable.id, caisse.id));
}

async function debiterMobileDansTransaction(
  tx: ComptabiliteTransaction,
  cooperativeId: number,
  mode: string,
  montantFcfa: number,
  paiementId: number,
  userId: number | undefined,
  referenceTransaction?: string | null,
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
  await tx.insert(mouvementsMobileMarchandTable).values({
    compteId: compte.id,
    cooperativeId,
    type: "debit",
    motif: "paiement_producteur",
    montantFcfa: montant.toString(),
    libelle: `Paiement producteur — règlement #${paiementId}`,
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
        membreDelegueId: membresTable.delegueId,
        fournisseurCoopId: fournisseursTable.cooperativeId,
        bonCarburantCoopId: bonsCarburantTable.cooperativeId,
        compteDetteProducteur: livraisonsTable.compteDetteProducteur,
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId && row.fournisseurCoopId !== cooperativeId && row.bonCarburantCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce paiement n'appartient pas à votre coopérative" });
      return;
    }
    if (row.paiement.statut !== "en_attente") {
      res.status(409).json({ erreur: `Statut actuel : ${row.paiement.statut}. Seuls les paiements en_attente peuvent être validés.` });
      return;
    }

    // Le mode peut être fourni si : (a) bon carburant, ou (b) paiement sans mode pré-sélectionné (pesée groupée)
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
      if (totalVentile !== row.paiement.montantFcfa) {
        res.status(400).json({
          erreur: `Le total ventilé (${totalVentile.toLocaleString("fr-FR")} FCFA) doit être égal au montant à régler (${row.paiement.montantFcfa.toLocaleString("fr-FR")} FCFA).`,
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
      const compteDebitPaiement = isBonCarburant
        ? "6042"
        : await resolveCompteDetteProducteur(cooperativeId, row.compteDetteProducteur);
      const isMembreBaseCentrale = !row.membreDelegueId;
      const lignesEspeces = lignes.filter((ligne) => ligne.modePaiement === "especes");
      const lignesMobiles = lignes.filter((ligne) =>
        ligne.modePaiement === "orange_money" || ligne.modePaiement === "mtn_momo" || ligne.modePaiement === "wave",
      );
      const nouveauStatut = lignes.every((ligne) => ligne.modePaiement === "especes") ? "effectue" : "confirme";

      try {
        await db.transaction(async (tx) => {
          const [paiementMisAJour] = await tx
            .update(paiementsTable)
            .set({
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
              .set({ statutPaiement: "PAYÉ" })
              .where(eq(livraisonsTable.id, row.paiement.livraisonId));
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
              await debiterCaisseDansTransaction(tx, cooperativeId, userId, montantEspeces, id, userId);
            } else {
              // Toute validation faite par l'administration débite la caisse
              // principale de la coopérative pour la part espèces.
              await debiterCaisseDansTransaction(tx, cooperativeId, userId, montantEspeces, id);
            }
          }

          for (const ligne of lignesMobiles) {
            await debiterMobileDansTransaction(
              tx, cooperativeId, ligne.modePaiement, ligne.montantFcfa, id, userId, ligne.referenceTransaction,
            );
          }

          const ecrituresVentilation: Parameters<typeof proposerEcrituresDansTransaction>[2] = [];
          for (let index = 0; index < lignes.length; index += 1) {
            const ligne = lignes[index]!;
            const ligneInseree = lignesInserees[index]!;
            if (ligne.modePaiement === "cheque") {
              await tx.insert(chequesEmisTable).values({
                cooperativeId,
                numeroCheque: ligne.numeroCheque ?? null,
                beneficiaire: `${row.nom ?? ""} ${row.prenoms ?? ""}`.trim() || `PAI-${id}`,
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
            ecrituresVentilation.push({
              source: "paiement",
              sourceId: id,
              libelle: isBonCarburant
                ? `Carburant – Bon PAI-${id} (${ligne.modePaiement})`
                : `Paiement producteur – ${`${row.nom ?? ""} ${row.prenoms ?? ""}`.trim() || `PAI-${id}`} (${ligne.modePaiement})`,
              compteDebit: compteDebitPaiement,
              compteCredit,
              montantFcfa: ligne.montantFcfa,
              date: new Date().toISOString().slice(0, 10),
              numeroPiece: `PAI-${id}`,
              tiersId: isBonCarburant ? undefined : (row.paiement.membreId ?? undefined),
              tiersType: isBonCarburant ? undefined : "membre",
            });
          }
          await proposerEcrituresDansTransaction(tx, cooperativeId, ecrituresVentilation);
        });
      } catch (err) {
        if (err instanceof PaiementDejaTraiteError) {
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
        body: `${new Intl.NumberFormat("fr-FR").format(row.paiement.montantFcfa)} FCFA — règlement ventilé`,
        url: "/paiements",
      });
      const updated = await fetchEnrichedPaiement(id);
      res.json(updated);
      return;
    }
    if (body.modePaiement && !isBonCarburantPaiement && !hasNoMode) {
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
    const modeOverride = (isBonCarburantPaiement || hasNoMode) && body.modePaiement
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
        await verifierCaisseEspeces(userId, cooperativeId, row.paiement.montantFcfa);
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
      if (soldeMobile < row.paiement.montantFcfa) {
        res.status(422).json({
          erreur: `Solde ${label} insuffisant (compte « ${compteMobile.nom} »). Disponible : ${soldeMobile.toLocaleString("fr-FR")} FCFA, requis : ${row.paiement.montantFcfa.toLocaleString("fr-FR")} FCFA.`,
        });
        return;
      }
    }

    // Pré-vérification Caisse Centrale pour espèces hors-délégué (membre base centrale)
    const isNonDelegueEspeces = req.user?.role !== "delegue" && mode === "especes";
    const isMembreBaseCentrale = !row.membreDelegueId;
    if (isNonDelegueEspeces && isMembreBaseCentrale && cooperativeId) {
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

      if (parseFloat(String(caisseCentrale.soldeActuelFcfa)) < row.paiement.montantFcfa) {
        res.status(422).json({ erreur: "Fonds insuffisants sur le compte pour effectuer ce paiement." });
        return;
      }
    }

    await db.transaction(async (tx) => {
      // 2. Mettre à jour le paiement (le mode peut être corrigé au moment de la validation)
      const [paiementMisAJour] = await tx
        .update(paiementsTable)
        .set({
          statut: nouveauStatut as "effectue" | "confirme",
          validePar: userId ?? null,
          dateValidation: new Date(),
          referenceTransaction: body.referenceTransaction ?? row.paiement.referenceTransaction,
          ...(modeOverride ? { modePaiement: modeOverride } : {}),
        })
        // La condition sur le statut rend la validation idempotente :
        // deux requêtes concurrentes ne peuvent pas créer deux écritures
        // comptables pour le même règlement.
        .where(and(
          eq(paiementsTable.id, id),
          eq(paiementsTable.statut, "en_attente"),
        ))
        .returning({ id: paiementsTable.id });

      if (!paiementMisAJour) {
        throw new PaiementDejaTraiteError();
      }

      // 3. Mettre à jour le statut paiement de la livraison (si applicable)
      if (row.paiement.livraisonId) {
        await tx
          .update(livraisonsTable)
          .set({ statutPaiement: "PAYÉ" })
          .where(eq(livraisonsTable.id, row.paiement.livraisonId));

      }

      // L'écriture liée au paiement doit être créée avant le commit métier.
      // Une erreur ici rollbacke donc le statut du paiement et de la livraison.
      {
        const isBonCarburant = !!row.paiement.bonCarburantId;
        const isMobile = mode === "orange_money" || mode === "mtn_momo" || mode === "wave";
        const compteDebitPaiement = isBonCarburant
          ? "6042"
          : await resolveCompteDetteProducteur(cooperativeId, row.compteDetteProducteur);
        await proposerEcrituresDansTransaction(tx, cooperativeId, [{
          source: "paiement",
          sourceId: id,
          libelle: isBonCarburant
            ? `Carburant – Bon PAI-${id}`
            : `Paiement producteur – ${`${row.nom ?? ""} ${row.prenoms ?? ""}`.trim() || `PAI-${id}`}`,
          compteDebit: compteDebitPaiement,
          compteCredit: isMobile ? "552" : mode === "especes" ? "571" : "521",
          montantFcfa: row.paiement.montantFcfa,
          date: new Date().toISOString().slice(0, 10),
          numeroPiece: `PAI-${id}`,
          tiersId: isBonCarburant ? undefined : (row.paiement.membreId ?? undefined),
          tiersType: isBonCarburant ? undefined : "membre",
        }]);
      }
    });

    // 4–7. Déterminer si c'est un bon carburant (impacte les comptes OHADA)
    const isBonCarburant = !!row.paiement.bonCarburantId;
    const compteDebitPaiement = isBonCarburant
      ? "6042"
      : await resolveCompteDetteProducteur(cooperativeId, row.compteDetteProducteur);
    const caisseOpts = isBonCarburant
      ? { compteDebitOverride: "6042", libelle: `Carburant — règlement #${id}`, skipAccounting: true }
      : { compteDebitOverride: compteDebitPaiement, skipAccounting: true };

    // 4. Débiter la caisse principale du délégué si paiement espèces
    //    (hors tx DB car enregistrerMouvement gère sa propre cohérence interne)
    if (isDelegueEspeces && userId && cooperativeId) {
      await debiterCaisseParResponsable(
        userId,
        cooperativeId,
        row.paiement.montantFcfa,
        id,
        row.paiement.livraisonId,
        caisseOpts,
      );
    }

    // 5. Débiter automatiquement le compte Mobile Marchand si paiement mobile
    if (isMobileMarchand && cooperativeId) {
      await debiterCompteMobileMarchandPaiement(
        cooperativeId,
        mode,
        row.paiement.montantFcfa,
        id,
        userId,
        body.referenceTransaction ?? row.paiement.referenceTransaction,
      );
    }

    // 6. Débiter la Caisse Centrale si paiement espèces par un rôle non-délégué
    //    Pour les bons carburant : isMembreBaseCentrale = true (pas de membre → delegueId null)
    //    Le caisseOpts contient compteDebitOverride: "6042" si bon carburant
    if (isNonDelegueEspeces && isMembreBaseCentrale && cooperativeId) {
      await debiterCaisseCentralePaiement(
        cooperativeId,
        row.paiement.montantFcfa,
        id,
        userId,
        caisseOpts,
      );
    }

    // 8. Notifier le producteur (best-effort)
    if (row.paiement.membreId) void envoyerPushGroupePortail([row.paiement.membreId], {
      title: "✅ Paiement validé",
      body: `${new Intl.NumberFormat("fr-FR").format(row.paiement.montantFcfa)} FCFA — ${mode === "orange_money" ? "Orange Money" : mode === "mtn_momo" ? "MTN MoMo" : mode === "wave" ? "Wave" : mode === "cheque" ? "Chèque" : "Espèces"}`,
      url: "/paiements",
    });

    const updated = await fetchEnrichedPaiement(id);
    res.json(updated);
  } catch (err) {
    if (err instanceof PaiementDejaTraiteError) {
      res.status(err.status).json({ erreur: err.message });
      return;
    }
    req.log.error({ err }, "Erreur validerPaiement");
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
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(bonsCarburantTable, eq(paiementsTable.bonCarburantId, bonsCarburantTable.id))
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId && row.fournisseurCoopId !== cooperativeId && row.bonCarburantCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce paiement n'appartient pas à votre coopérative" });
      return;
    }
    if (row.paiement.statut !== "en_attente") {
      res.status(409).json({ erreur: `Statut actuel : ${row.paiement.statut}. Seuls les paiements en_attente peuvent être rejetés.` });
      return;
    }

    await db.transaction(async (tx) => {
      // 1. Rejeter le paiement
      await tx
        .update(paiementsTable)
        .set({
          statut: "rejete",
          validePar: userId ?? null,
          dateValidation: new Date(),
          motifRejet: body.motifRejet.trim(),
        })
        .where(eq(paiementsTable.id, id));

      // 2. Remettre la livraison en EN_ATTENTE (si applicable)
      if (row.paiement.livraisonId) {
        await tx
          .update(livraisonsTable)
          .set({ statutPaiement: "EN_ATTENTE" })
          .where(eq(livraisonsTable.id, row.paiement.livraisonId));
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
    req.log.error({ err }, "Erreur rejeterPaiement");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
