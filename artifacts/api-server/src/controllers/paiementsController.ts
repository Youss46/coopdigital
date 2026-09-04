import { type Request, type Response } from "express";
import { db, paiementsTable, paiementLignesTable, membresTable, livraisonsTable, fournisseursTable, usersTable, comptesMobilesMarchandsTable, mouvementsMobileMarchandTable, caissesTable, chequesEmisTable, bonsCarburantTable, campagnesTable } from "@workspace/db";
import { eq, desc, and, or, sql, gte, lt, lte, inArray, isNull, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { envoyerPushGroupePortail, envoyerPushGroupe } from "../services/pushService";
import { proposerEcrituresDansTransaction, resolveCompteDetteProducteur } from "../services/comptabiliteService.js";
import { verifierCaisseEspeces, debiterCaisseParResponsable, getSessionActive, enregistrerMouvement } from "../services/caisseService.js";
import { notifierParRole } from "../services/notificationService.js";
import { logger } from "../lib/logger.js";
import type { ComptabiliteTransaction } from "../services/comptabiliteService.js";
import { genererNumeroRecu } from "../services/recuService.js";

// ─── Helper ─────────────────────────────────────────────────────────────────

class PaiementDejaTraiteError extends Error {
  readonly status = 409;
  constructor() {
    super("Ce paiement a déjà été traité. Aucune écriture supplémentaire n'a été créée.");
    this.name = "PaiementDejaTraiteError";
  }
}

class PaiementMontantInvalideError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "PaiementMontantInvalideError";
  }
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
  livraisonStatutPaiement: livraisonsTable.statutPaiement,
  livraisonMontantRestant: sql<number>`coalesce(${livraisonsTable.montantRestant}, '0')::integer`,
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
  await enregistrerMouvement(caisse.id, {
    type: "sortie",
    motif: "paiement_producteur",
    montantFcfa,
    libelle: `Paiement producteur — règlement #${paiementId}`,
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
    montantReglementFcfa?: number | null;
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
        livraisonStatutPaiement: livraisonsTable.statutPaiement,
        livraisonMontantNetFcfa: livraisonsTable.montantNetFcfa,
        livraisonMontantRestant: sql<number>`coalesce(${livraisonsTable.montantRestant}, '0')::integer`,
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
    const beneficiairePaiement = (
      `${row.nom ?? ""} ${row.prenoms ?? ""}`.trim()
      || `${row.fournisseurNom ?? ""} ${row.fournisseurPrenoms ?? ""}`.trim()
      || `PAI-${id}`
    );

    const livraisonAvecSolde = !!row.paiement.livraisonId && estLivraisonAvecSolde(row.livraisonStatutPaiement);
    const montantRestantActuel = livraisonAvecSolde
      ? Math.max(0, Math.round(Number(row.livraisonMontantRestant ?? row.livraisonMontantNetFcfa ?? row.paiement.montantFcfa)))
      : row.paiement.montantFcfa;
    const montantDemande = body.montantReglementFcfa == null
      ? row.paiement.montantFcfa
      : Number(body.montantReglementFcfa);

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
      if (totalVentile !== montantDemande) {
        res.status(400).json({
          erreur: `Le total ventilé (${totalVentile.toLocaleString("fr-FR")} FCFA) doit être égal au montant du versement (${montantDemande.toLocaleString("fr-FR")} FCFA).`,
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
      const lignesEspeces = lignes.filter((ligne) => ligne.modePaiement === "especes");
      const lignesMobiles = lignes.filter((ligne) =>
        ligne.modePaiement === "orange_money" || ligne.modePaiement === "mtn_momo" || ligne.modePaiement === "wave",
      );
      const nouveauStatut = lignes.every((ligne) => ligne.modePaiement === "especes") ? "effectue" : "confirme";

      let soldeApresLivraison: number | null = null;
      try {
        await db.transaction(async (tx) => {
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
              montantFcfa: montantDemande,
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

          if (livraisonAvecSolde && row.paiement.livraisonId && (soldeApresLivraison ?? 0) > 0) {
            await tx.insert(paiementsTable).values({
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
            ecrituresVentilation.push({
              source: "paiement",
              sourceId: id,
              libelle: isBonCarburant
                ? `Carburant – Bon PAI-${id} (${ligne.modePaiement})`
                : `Paiement producteur – ${beneficiairePaiement} (${ligne.modePaiement})`,
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
        body: `${new Intl.NumberFormat("fr-FR").format(row.paiement.montantFcfa)} FCFA — règlement ventilé`,
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
        await verifierCaisseEspeces(userId, cooperativeId, montantDemande);
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
      if (soldeMobile < montantDemande) {
        res.status(422).json({
          erreur: `Solde ${label} insuffisant (compte « ${compteMobile.nom} »). Disponible : ${soldeMobile.toLocaleString("fr-FR")} FCFA, requis : ${montantDemande.toLocaleString("fr-FR")} FCFA.`,
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

      if (parseFloat(String(caisseCentrale.soldeActuelFcfa)) < montantDemande) {
        res.status(422).json({ erreur: "Fonds insuffisants sur le compte pour effectuer ce paiement." });
        return;
      }
    }

    let soldeApresLivraison: number | null = null;
    await db.transaction(async (tx) => {
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
          montantFcfa: montantDemande,
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

      if (livraisonAvecSolde && row.paiement.livraisonId && (soldeApresLivraison ?? 0) > 0) {
        await tx.insert(paiementsTable).values({
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
      const isMobile = mode === "orange_money" || mode === "mtn_momo" || mode === "wave";
      const compteDebitPaiement = isBonCarburant
        ? "6042"
        : await resolveCompteDetteProducteur(cooperativeId, row.compteDetteProducteur);

      if (mode === "especes" && cooperativeId) {
        if (isDelegueEspeces) {
          await debiterCaisseDansTransaction(tx, cooperativeId, userId, montantDemande, id);
        } else {
          await debiterCaisseDansTransaction(tx, cooperativeId, userId, montantDemande, id);
        }
      }

      if (isMobile) {
        await debiterMobileDansTransaction(
          tx,
          cooperativeId,
          mode,
          montantDemande,
          id,
          userId,
          body.referenceTransaction ?? row.paiement.referenceTransaction,
        );
      }

      const [ligneInseree] = await tx.insert(paiementLignesTable).values({
        paiementId: id,
        modePaiement: mode as "especes" | "cheque" | "virement" | "orange_money" | "mtn_momo" | "wave",
        montantFcfa: montantDemande,
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
          montantFcfa: montantDemande,
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

      await proposerEcrituresDansTransaction(tx, cooperativeId, [{
        source: "paiement",
        sourceId: id,
        libelle: isBonCarburant
          ? `Carburant – Bon PAI-${id}`
          : `Paiement producteur – ${beneficiairePaiement}`,
        compteDebit: compteDebitPaiement,
        compteCredit: isMobile ? "552" : mode === "especes" ? "571" : "521",
        montantFcfa: montantDemande,
        date: new Date().toISOString().slice(0, 10),
        numeroPiece: `PAI-${id}`,
        tiersId: isBonCarburant ? undefined : (row.paiement.membreId ?? undefined),
        tiersType: isBonCarburant ? undefined : "membre",
      }]);
    });

    // Notifier le producteur (best-effort)
    if (row.paiement.membreId) void envoyerPushGroupePortail([row.paiement.membreId], {
      title: "✅ Paiement validé",
      body: `${new Intl.NumberFormat("fr-FR").format(montantDemande)} FCFA — ${mode === "orange_money" ? "Orange Money" : mode === "mtn_momo" ? "MTN MoMo" : mode === "wave" ? "Wave" : mode === "cheque" ? "Chèque" : "Espèces"}`,
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
        livraisonStatutPaiement: livraisonsTable.statutPaiement,
        livraisonMontantNetFcfa: livraisonsTable.montantNetFcfa,
        livraisonMontantRestant: sql<number>`coalesce(${livraisonsTable.montantRestant}, '0')::integer`,
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
