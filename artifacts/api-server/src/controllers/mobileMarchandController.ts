import { Request, Response } from "express";
import { db, comptesMobilesMarchandsTable, mouvementsMobileMarchandTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

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
