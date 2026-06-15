import { Request, Response } from "express";
import {
  db,
  comptesMobilesMarchandsTable, mouvementsMobileMarchandTable,
  comptesBancairesTable, mouvementsBanqueTable,
  caissesTable, sessionsCaisseTable, mouvementsCaisseTable,
} from "@workspace/db";
import { proposerEcriture } from "../services/comptabiliteService.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

function coopId(req: Request): number | null {
  return req.user?.cooperativeId ?? null;
}

// ─── Comptes ──────────────────────────────────────────────────────────────────

export async function getComptes(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const rows = await db
      .select()
      .from(comptesMobilesMarchandsTable)
      .where(and(eq(comptesMobilesMarchandsTable.cooperativeId, cid), eq(comptesMobilesMarchandsTable.actif, true)))
      .orderBy(comptesMobilesMarchandsTable.nom);
    res.json(rows.map(r => ({
      id:                    r.id,
      nom:                   r.nom,
      operateur:             r.operateur,
      numero_marchand:       r.numeroMarchand,
      solde_actuel_fcfa:     r.soldeActuelFcfa,
      solde_mini_alerte_fcfa:r.soldeMiniAlerteFcfa,
      actif:                 r.actif,
    })));
  } catch (err) {
    req.log.error({ err }, "getComptesMobile");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function postCompte(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const { nom, operateur, numeroMarchand, soldeInitial, soldeMiniAlerte } = req.body as {
    nom?: string; operateur?: string; numeroMarchand?: string;
    soldeInitial?: number; soldeMiniAlerte?: number;
  };
  if (!nom || !operateur) { res.status(400).json({ erreur: "nom et operateur requis" }); return; }
  try {
    const [compte] = await db
      .insert(comptesMobilesMarchandsTable)
      .values({
        cooperativeId:       cid,
        nom,
        operateur:           operateur as "wave" | "orange_money" | "mtn_momo",
        numeroMarchand:      numeroMarchand ?? null,
        soldeActuelFcfa:     (soldeInitial ?? 0).toString(),
        soldeMiniAlerteFcfa: (soldeMiniAlerte ?? 0).toString(),
      })
      .returning();
    res.status(201).json(compte);
  } catch (err) {
    req.log.error({ err }, "postCompteMobile");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function putCompte(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const id = parseInt(String(req.params["id"]), 10);
  const { nom, operateur, numeroMarchand, soldeMiniAlerte } = req.body as {
    nom?: string; operateur?: string; numeroMarchand?: string; soldeMiniAlerte?: number;
  };
  try {
    const [row] = await db
      .update(comptesMobilesMarchandsTable)
      .set({
        ...(nom && { nom }),
        ...(operateur && { operateur: operateur as "wave" | "orange_money" | "mtn_momo" }),
        ...(numeroMarchand !== undefined && { numeroMarchand }),
        ...(soldeMiniAlerte !== undefined && { soldeMiniAlerteFcfa: soldeMiniAlerte.toString() }),
      })
      .where(and(eq(comptesMobilesMarchandsTable.id, id), eq(comptesMobilesMarchandsTable.cooperativeId, cid)))
      .returning();
    if (!row) { res.status(404).json({ erreur: "Compte introuvable" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "putCompteMobile");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

// ─── Mouvements ───────────────────────────────────────────────────────────────

export async function postMouvement(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const compteId = parseInt(String(req.params["id"]), 10);
  const { type, motif, montantFcfa, libelle, reference, dateOperation } = req.body as {
    type?: "credit" | "debit"; motif?: string; montantFcfa?: number;
    libelle?: string; reference?: string; dateOperation?: string;
  };
  if (!type || !motif || !montantFcfa) {
    res.status(400).json({ erreur: "type, motif et montantFcfa requis" }); return;
  }
  try {
    const [compte] = await db
      .select()
      .from(comptesMobilesMarchandsTable)
      .where(and(eq(comptesMobilesMarchandsTable.id, compteId), eq(comptesMobilesMarchandsTable.cooperativeId, cid)))
      .limit(1);
    if (!compte) { res.status(404).json({ erreur: "Compte introuvable" }); return; }

    const soldeActuel = parseFloat(compte.soldeActuelFcfa);
    if (type === "debit" && soldeActuel < montantFcfa) {
      res.status(400).json({ erreur: `Solde insuffisant (${new Intl.NumberFormat("fr-FR").format(soldeActuel)} FCFA disponible)` }); return;
    }

    const newSolde = type === "credit" ? soldeActuel + montantFcfa : soldeActuel - montantFcfa;
    const today = new Date().toISOString().slice(0, 10);

    const [mouvement] = await db.transaction(async (tx) => {
      const [mvt] = await tx
        .insert(mouvementsMobileMarchandTable)
        .values({
          compteId,
          cooperativeId:  cid,
          type,
          motif,
          montantFcfa:    montantFcfa.toString(),
          libelle:        libelle ?? null,
          reference:      reference ?? null,
          dateOperation:  dateOperation ?? today,
          soldeApresFcfa: newSolde.toString(),
          enregistrePar:  req.user?.id ?? null,
        })
        .returning();
      await tx
        .update(comptesMobilesMarchandsTable)
        .set({ soldeActuelFcfa: newSolde.toString() })
        .where(eq(comptesMobilesMarchandsTable.id, compteId));
      return [mvt];
    });

    res.status(201).json(mouvement);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postMouvementMobile");
    res.status(400).json({ erreur: msg });
  }
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export async function getJournal(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const compteId = parseInt(String(req.params["id"]), 10);
  try {
    const rows = await db
      .select()
      .from(mouvementsMobileMarchandTable)
      .where(and(
        eq(mouvementsMobileMarchandTable.compteId, compteId),
        eq(mouvementsMobileMarchandTable.cooperativeId, cid),
      ))
      .orderBy(desc(mouvementsMobileMarchandTable.dateOperation), desc(mouvementsMobileMarchandTable.createdAt));
    res.json(rows.map(r => ({
      id:              r.id,
      type:            r.type,
      motif:           r.motif,
      montant_fcfa:    r.montantFcfa,
      libelle:         r.libelle,
      reference:       r.reference,
      date_operation:  r.dateOperation,
      solde_apres_fcfa:r.soldeApresFcfa,
      created_at:      r.createdAt,
    })));
  } catch (err) {
    req.log.error({ err }, "getJournalMobile");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

// ─── Comptes bancaires disponibles (pour le modal de virement) ────────────────

export async function getComptesBancaires(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const rows = await db
      .select()
      .from(comptesBancairesTable)
      .where(and(eq(comptesBancairesTable.cooperativeId, cid), eq(comptesBancairesTable.actif, true)))
      .orderBy(comptesBancairesTable.nom);
    res.json(rows.map(r => ({
      id:               r.id,
      nom:              r.nom,
      banque:           r.banque,
      solde_actuel_fcfa:r.soldeActuelFcfa,
    })));
  } catch (err) {
    req.log.error({ err }, "getComptesBancairesMobile");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

// ─── Virement banque ↔ mobile marchand ───────────────────────────────────────

export async function postVirementBanque(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  const compteId = parseInt(String(req.params["id"]), 10);
  const { compteBancaireId, sens, montantFcfa, libelle, reference, dateOperation } = req.body as {
    compteBancaireId?: number;
    sens?: "banque_vers_mobile" | "mobile_vers_banque";
    montantFcfa?: number;
    libelle?: string; reference?: string; dateOperation?: string;
  };

  const direction: "banque_vers_mobile" | "mobile_vers_banque" = sens ?? "banque_vers_mobile";

  if (!compteBancaireId || !montantFcfa || montantFcfa <= 0) {
    res.status(400).json({ erreur: "compteBancaireId et montantFcfa (> 0) requis" }); return;
  }
  if (direction !== "banque_vers_mobile" && direction !== "mobile_vers_banque") {
    res.status(400).json({ erreur: "sens invalide" }); return;
  }

  try {
    const [compteMobile] = await db
      .select().from(comptesMobilesMarchandsTable)
      .where(and(eq(comptesMobilesMarchandsTable.id, compteId), eq(comptesMobilesMarchandsTable.cooperativeId, cid)))
      .limit(1);
    if (!compteMobile) { res.status(404).json({ erreur: "Compte mobile introuvable" }); return; }

    const [compteBancaire] = await db
      .select().from(comptesBancairesTable)
      .where(and(eq(comptesBancairesTable.id, compteBancaireId), eq(comptesBancairesTable.cooperativeId, cid)))
      .limit(1);
    if (!compteBancaire) { res.status(404).json({ erreur: "Compte bancaire introuvable" }); return; }

    const soldeBanque  = parseFloat(String(compteBancaire.soldeActuelFcfa));
    const soldeMobile  = parseFloat(String(compteMobile.soldeActuelFcfa));

    if (direction === "banque_vers_mobile" && soldeBanque < montantFcfa) {
      res.status(400).json({ erreur: `Solde bancaire insuffisant (${new Intl.NumberFormat("fr-FR").format(soldeBanque)} FCFA disponible)` }); return;
    }
    if (direction === "mobile_vers_banque" && soldeMobile < montantFcfa) {
      res.status(400).json({ erreur: `Solde mobile insuffisant (${new Intl.NumberFormat("fr-FR").format(soldeMobile)} FCFA disponible)` }); return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const dateOp = dateOperation ?? today;
    const ref    = reference ?? `VIR-${Date.now()}`;
    const userId = req.user?.id ?? null;

    const nvSoldeBanque  = direction === "banque_vers_mobile" ? soldeBanque - montantFcfa : soldeBanque + montantFcfa;
    const nvSoldeMobile  = direction === "banque_vers_mobile" ? soldeMobile + montantFcfa : soldeMobile - montantFcfa;

    const typeBanque  = direction === "banque_vers_mobile" ? "debit"  : "credit";
    const typeMobile  = direction === "banque_vers_mobile" ? "credit" : "debit";
    const motifBanque = direction === "banque_vers_mobile" ? "virement_sortant" : "virement_entrant";
    const motifMobile = direction === "banque_vers_mobile" ? "virement_entrant" : "virement_sortant";
    const libBanque   = direction === "banque_vers_mobile"
      ? `Approvisionnement ${compteMobile.nom}${libelle ? ` — ${libelle}` : ""}`
      : `Reversement depuis ${compteMobile.nom}${libelle ? ` — ${libelle}` : ""}`;
    const libMobile   = direction === "banque_vers_mobile"
      ? `Virement depuis ${compteBancaire.nom}${libelle ? ` — ${libelle}` : ""}`
      : `Reversement vers ${compteBancaire.nom}${libelle ? ` — ${libelle}` : ""}`;

    const result = await db.transaction(async (tx) => {
      const [mvtBanque] = await tx
        .insert(mouvementsBanqueTable)
        .values({
          compteId:       compteBancaireId,
          cooperativeId:  cid,
          type:           typeBanque,
          motif:          motifBanque,
          montantFcfa:    montantFcfa.toString(),
          libelle:        libBanque,
          reference:      ref,
          dateOperation:  dateOp,
          soldeApresFcfa: nvSoldeBanque.toString(),
          enregistrePar:  userId,
        })
        .returning();

      await tx.update(comptesBancairesTable)
        .set({ soldeActuelFcfa: nvSoldeBanque.toString() })
        .where(eq(comptesBancairesTable.id, compteBancaireId));

      const [mvtMobile] = await tx
        .insert(mouvementsMobileMarchandTable)
        .values({
          compteId:       compteId,
          cooperativeId:  cid,
          type:           typeMobile,
          motif:          motifMobile,
          montantFcfa:    montantFcfa.toString(),
          libelle:        libMobile,
          reference:      ref,
          dateOperation:  dateOp,
          soldeApresFcfa: nvSoldeMobile.toString(),
          enregistrePar:  userId,
        })
        .returning();

      await tx.update(comptesMobilesMarchandsTable)
        .set({ soldeActuelFcfa: nvSoldeMobile.toString() })
        .where(eq(comptesMobilesMarchandsTable.id, compteId));

      return { mvtBanque: mvtBanque!, mvtMobile: mvtMobile! };
    });

    // Écriture comptable OHADA
    // banque_vers_mobile : 572 Débit / 521 Crédit
    // mobile_vers_banque : 521 Débit / 572 Crédit
    proposerEcriture(cid, {
      source:      "mobile_marchand",
      sourceId:    result.mvtMobile.id,
      libelle:     libelle ?? (direction === "banque_vers_mobile"
        ? `Appro mobile depuis ${compteBancaire.nom}`
        : `Reversement banque depuis ${compteMobile.nom}`),
      compteDebit:  direction === "banque_vers_mobile" ? "572" : "521",
      compteCredit: direction === "banque_vers_mobile" ? "521" : "572",
      montantFcfa:  montantFcfa, date: dateOp,
    }).catch((err) => logger.warn({ err }, "Écriture comptable virement mobile-banque non enregistrée"));

    res.status(201).json({
      mouvement_banque:  result.mvtBanque.id,
      mouvement_mobile:  result.mvtMobile.id,
      solde_banque:      nvSoldeBanque,
      solde_mobile:      nvSoldeMobile,
      reference:         ref,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postVirementBanque");
    res.status(400).json({ erreur: msg });
  }
}

// ─── Caisses disponibles (pour le modal de virement caisse) ───────────────────

export async function getCaissesCentrales(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const rows = await db.execute<{
      id: number; nom: string; type_caisse: string;
      solde_actuel_fcfa: string;
      session_id: number | null; session_statut: string | null;
    }>(sql`
      SELECT c.id, c.nom, c.type_caisse, c.solde_actuel_fcfa,
             s.id   AS session_id,
             s.statut AS session_statut
      FROM   caisses c
      LEFT JOIN sessions_caisse s
             ON s.caisse_id = c.id
            AND s.date_session = CURRENT_DATE
            AND s.statut = 'ouverte'
      WHERE  c.cooperative_id = ${cid}
        AND  c.actif = TRUE
      ORDER BY c.type_caisse DESC, c.nom
    `);
    res.json(rows.rows.map(r => ({
      id:               r.id,
      nom:              r.nom,
      type_caisse:      r.type_caisse,
      solde_actuel_fcfa:r.solde_actuel_fcfa,
      session_ouverte:  r.session_id !== null,
      session_id:       r.session_id ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "getCaissesCentrales");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

// ─── Virement caisse ↔ mobile marchand ────────────────────────────────────────

export async function postVirementCaisse(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  const mobileId = parseInt(String(req.params["id"]), 10);
  const { caisseId, sens, montantFcfa, libelle, reference, dateOperation } = req.body as {
    caisseId?: number;
    sens?: "caisse_vers_mobile" | "mobile_vers_caisse";
    montantFcfa?: number;
    libelle?: string; reference?: string; dateOperation?: string;
  };

  if (!caisseId || !sens || !montantFcfa || montantFcfa <= 0) {
    res.status(400).json({ erreur: "caisseId, sens et montantFcfa (> 0) requis" }); return;
  }
  if (sens !== "caisse_vers_mobile" && sens !== "mobile_vers_caisse") {
    res.status(400).json({ erreur: "sens invalide" }); return;
  }

  try {
    // 1. Vérifier les comptes
    const [compteMobile] = await db
      .select().from(comptesMobilesMarchandsTable)
      .where(and(eq(comptesMobilesMarchandsTable.id, mobileId), eq(comptesMobilesMarchandsTable.cooperativeId, cid)))
      .limit(1);
    if (!compteMobile) { res.status(404).json({ erreur: "Compte mobile introuvable" }); return; }

    const [caisse] = await db
      .select().from(caissesTable)
      .where(and(eq(caissesTable.id, caisseId), eq(caissesTable.cooperativeId, cid)))
      .limit(1);
    if (!caisse) { res.status(404).json({ erreur: "Caisse introuvable" }); return; }

    // 2. Session active requise sur la caisse
    const sessionRows = await db.execute<{ id: number; statut: string }>(sql`
      SELECT id, statut FROM sessions_caisse
      WHERE caisse_id = ${caisseId} AND date_session = CURRENT_DATE AND statut = 'ouverte'
      LIMIT 1
    `);
    const session = sessionRows.rows[0] ?? null;
    if (!session) {
      res.status(400).json({ erreur: `Aucune session ouverte sur la caisse "${caisse.nom}". Ouvrez d'abord une session depuis la page Caisse.` });
      return;
    }

    // 3. Vérifier le solde source
    const soldeCaisse  = parseFloat(String(caisse.soldeActuelFcfa));
    const soldeMobile  = parseFloat(String(compteMobile.soldeActuelFcfa));

    if (sens === "caisse_vers_mobile" && soldeCaisse < montantFcfa) {
      res.status(400).json({ erreur: `Solde insuffisant en caisse (${new Intl.NumberFormat("fr-FR").format(soldeCaisse)} FCFA disponible)` }); return;
    }
    if (sens === "mobile_vers_caisse" && soldeMobile < montantFcfa) {
      res.status(400).json({ erreur: `Solde mobile insuffisant (${new Intl.NumberFormat("fr-FR").format(soldeMobile)} FCFA disponible)` }); return;
    }

    const dateOp = dateOperation ?? new Date().toISOString().slice(0, 10);
    const ref    = reference ?? `VIR-${Date.now()}`;
    const userId = req.user?.id ?? null;

    const nvSoldeCaisse = sens === "caisse_vers_mobile" ? soldeCaisse - montantFcfa : soldeCaisse + montantFcfa;
    const nvSoldeMobile = sens === "caisse_vers_mobile" ? soldeMobile + montantFcfa : soldeMobile - montantFcfa;

    const typeCaisse  = sens === "caisse_vers_mobile" ? "sortie" : "entree";
    const typeMobile  = sens === "caisse_vers_mobile" ? "credit" : "debit";
    const libCaisse   = sens === "caisse_vers_mobile"
      ? `Virement vers ${compteMobile.nom}${libelle ? ` — ${libelle}` : ""}`
      : `Versement depuis ${compteMobile.nom}${libelle ? ` — ${libelle}` : ""}`;
    const libMobile   = sens === "caisse_vers_mobile"
      ? `Virement depuis caisse ${caisse.nom}${libelle ? ` — ${libelle}` : ""}`
      : `Reversement vers caisse ${caisse.nom}${libelle ? ` — ${libelle}` : ""}`;

    // 4. Transaction atomique
    const result = await db.transaction(async (tx) => {
      const [mvtCaisse] = await tx
        .insert(mouvementsCaisseTable)
        .values({
          caisseId:           caisseId,
          sessionId:          session.id,
          cooperativeId:      cid,
          type:               typeCaisse,
          motif:              "virement_mobile",
          montantFcfa:        montantFcfa.toString(),
          libelle:            libCaisse,
          referenceOperation: ref,
          soldeApresFcfa:     nvSoldeCaisse.toString(),
          enregistrePar:      userId,
        })
        .returning();

      await tx.update(caissesTable)
        .set({ soldeActuelFcfa: nvSoldeCaisse.toString() })
        .where(eq(caissesTable.id, caisseId));

      const [mvtMobile] = await tx
        .insert(mouvementsMobileMarchandTable)
        .values({
          compteId:       mobileId,
          cooperativeId:  cid,
          type:           typeMobile,
          motif:          sens === "caisse_vers_mobile" ? "virement_entrant" : "virement_sortant",
          montantFcfa:    montantFcfa.toString(),
          libelle:        libMobile,
          reference:      ref,
          dateOperation:  dateOp,
          soldeApresFcfa: nvSoldeMobile.toString(),
          enregistrePar:  userId,
        })
        .returning();

      await tx.update(comptesMobilesMarchandsTable)
        .set({ soldeActuelFcfa: nvSoldeMobile.toString() })
        .where(eq(comptesMobilesMarchandsTable.id, mobileId));

      return { mvtCaisse: mvtCaisse!, mvtMobile: mvtMobile! };
    });

    // 5. Écriture comptable OHADA
    // caisse_vers_mobile : 572 Débit / 571 Crédit
    // mobile_vers_caisse : 571 Débit / 572 Crédit
    proposerEcriture(cid, {
      source:      "mobile_marchand",
      sourceId:    result.mvtMobile.id,
      libelle:     libelle ?? (sens === "caisse_vers_mobile" ? `Appro mobile depuis ${caisse.nom}` : `Reversement caisse depuis ${compteMobile.nom}`),
      compteDebit:  sens === "caisse_vers_mobile" ? "572" : "571",
      compteCredit: sens === "caisse_vers_mobile" ? "571" : "572",
      montantFcfa:  montantFcfa, date: dateOp,
    }).catch((err) => logger.warn({ err }, "Écriture comptable virement caisse-mobile non enregistrée"));

    res.status(201).json({
      mouvement_caisse: result.mvtCaisse.id,
      mouvement_mobile: result.mvtMobile.id,
      solde_caisse:     nvSoldeCaisse,
      solde_mobile:     nvSoldeMobile,
      reference:        ref,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postVirementCaisse");
    res.status(400).json({ erreur: msg });
  }
}
