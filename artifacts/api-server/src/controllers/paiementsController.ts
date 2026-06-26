import { type Request, type Response } from "express";
import { db, paiementsTable, membresTable, livraisonsTable, fournisseursTable, usersTable, comptesMobilesMarchandsTable, mouvementsMobileMarchandTable, caissesTable } from "@workspace/db";
import { eq, desc, and, or, sql, gte, lt, lte, inArray, type SQL } from "drizzle-orm";
import { envoyerPushGroupePortail, envoyerPushGroupe } from "../services/pushService";
import { proposerEcriture } from "../services/comptabiliteService.js";
import { verifierCaisseEspeces, debiterCaisseParResponsable, enregistrerMouvement, getSessionActive } from "../services/caisseService.js";
import { notifierParRole } from "../services/notificationService.js";
import { logger } from "../lib/logger.js";

// ─── Helper ─────────────────────────────────────────────────────────────────

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
      motif: "paiement_producteur",
      montantFcfa,
      libelle: `Paiement producteur — règlement #${paiementId}`,
      userId: userId ?? undefined,
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

const SELECT_FIELDS = {
  id: paiementsTable.id,
  livraisonId: paiementsTable.livraisonId,
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
  agentId: livraisonsTable.agentId,
};

async function fetchEnrichedPaiement(id: number) {
  const [row] = await db
    .select(SELECT_FIELDS)
    .from(paiementsTable)
    .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
    .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
    .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
    .where(eq(paiementsTable.id, id))
    .limit(1);
  return row ?? null;
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
    )!;
    const conditions: SQL<unknown>[] = [coopFilter];
    if (statut) conditions.push(eq(paiementsTable.statut, statut as "en_attente" | "confirme" | "echec" | "rejete" | "en_cours" | "effectue"));
    if (membreId) conditions.push(eq(paiementsTable.membreId, membreId));
    // Un délégué ne voit que les règlements des membres qui lui sont rattachés
    if (req.user?.role === "delegue" && req.user?.id) {
      conditions.push(eq(membresTable.delegueId, req.user.id));
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
      .where(and(...conditions))
      .orderBy(desc(paiementsTable.createdAt))
      .limit(limit);

    res.json(paiements);
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
    )!;
    const statsConditions: SQL<unknown>[] = [statsCoopFilter];
    // Un délégué ne voit que les stats des membres qui lui sont rattachés
    if (req.user?.role === "delegue" && req.user?.id) {
      statsConditions.push(eq(membresTable.delegueId, req.user.id));
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

  const body = (req.body ?? {}) as { referenceTransaction?: string | null; telephone?: string | null };

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
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId && row.fournisseurCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce paiement n'appartient pas à votre coopérative" });
      return;
    }
    if (row.paiement.statut !== "en_attente") {
      res.status(409).json({ erreur: `Statut actuel : ${row.paiement.statut}. Seuls les paiements en_attente peuvent être validés.` });
      return;
    }

    const mode = row.paiement.modePaiement;
    const isMobileMarchand = mode === "orange_money" || mode === "mtn_momo" || mode === "wave";

    // Un délégué ne peut valider que les paiements en espèces
    if (req.user?.role === "delegue" && isMobileMarchand) {
      res.status(403).json({
        erreur: "Accès refusé",
        message: "Les paiements via compte Mobile Marchand ne peuvent être validés que par un Directeur, Comptable ou PCA.",
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
      const [compteMobile] = await db
        .select({
          id:             comptesMobilesMarchandsTable.id,
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
        res.status(422).json({ erreur: "Aucun compte valide n'a été trouvé pour ce mode de paiement." });
        return;
      }
      if (parseFloat(String(compteMobile.soldeActuelFcfa)) < row.paiement.montantFcfa) {
        res.status(422).json({ erreur: "Fonds insuffisants sur le compte pour effectuer ce paiement." });
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
      // 2. Mettre à jour le paiement
      await tx
        .update(paiementsTable)
        .set({
          statut: nouveauStatut as "effectue" | "confirme",
          validePar: userId ?? null,
          dateValidation: new Date(),
          referenceTransaction: body.referenceTransaction ?? row.paiement.referenceTransaction,
        })
        .where(eq(paiementsTable.id, id));

      // 3. Mettre à jour le statut paiement de la livraison
      await tx
        .update(livraisonsTable)
        .set({ statutPaiement: "PAYÉ" })
        .where(eq(livraisonsTable.id, row.paiement.livraisonId));
    });

    // 4. Débiter la caisse principale du délégué si paiement espèces
    //    (hors tx DB car enregistrerMouvement gère sa propre cohérence interne)
    if (isDelegueEspeces && userId && cooperativeId) {
      await debiterCaisseParResponsable(
        userId,
        cooperativeId,
        row.paiement.montantFcfa,
        id,
        row.paiement.livraisonId,
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
    //    pour un membre rattaché à la base centrale (delegueId IS NULL)
    if (isNonDelegueEspeces && isMembreBaseCentrale && cooperativeId) {
      await debiterCaisseCentralePaiement(
        cooperativeId,
        row.paiement.montantFcfa,
        id,
        userId,
      );
    }

    // 7. Écriture comptable décaissement pour modes non-espèces
    //    (espèces : enregistrerMouvement crée 401/571 via source "caisse")
    if (mode !== "especes" && cooperativeId) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const producteurNom = `${row.nom ?? ""} ${row.prenoms ?? ""}`.trim() || `PAI-${id}`;
      void proposerEcriture(cooperativeId, {
        source: "paiement",
        sourceId: id,
        libelle: `Paiement producteur – ${producteurNom}`,
        compteDebit: "401",
        compteCredit: "521",
        montantFcfa: row.paiement.montantFcfa,
        date: dateStr,
        numeroPiece: `PAI-${id}`,
      });
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
      })
      .from(paiementsTable)
      .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
      .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .where(eq(paiementsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Paiement introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId && row.fournisseurCoopId !== cooperativeId) {
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

      // 2. Remettre la livraison en EN_ATTENTE
      await tx
        .update(livraisonsTable)
        .set({ statutPaiement: "EN_ATTENTE" })
        .where(eq(livraisonsTable.id, row.paiement.livraisonId));
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
