import { type Request, type Response } from "express";
import * as licenceService from "../services/licenceService.js";
import { db } from "@workspace/db";
import { plansAbonnementTable, licencesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function m15UserId(req: Request): number {
  return req.m15User!.id;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function loginM15Handler(req: Request, res: Response): Promise<void> {
  const { email, motDePasse } = req.body as { email?: string; motDePasse?: string };
  if (!email || !motDePasse) {
    res.status(400).json({ erreur: "Email et mot de passe requis" });
    return;
  }
  try {
    const result = await licenceService.loginM15(email, motDePasse);
    if (!result) {
      res.status(401).json({ erreur: "Email ou mot de passe incorrect" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur login M15");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await licenceService.getDashboardM15();
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Erreur dashboard M15");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Coopératives ─────────────────────────────────────────────────────────────

export async function getCooperativesHandler(req: Request, res: Response): Promise<void> {
  try {
    const data = await licenceService.getCooperativesM15();
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Erreur liste coops M15");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createCooperativeHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    nom?: string; ville?: string; region?: string; telephone?: string;
    planId?: number; dureeAns?: number; renouvellementAuto?: boolean;
    trialActif?: boolean; dureeTrialJours?: number;
    montantPaye?: number; modePaiement?: string; referencePaiement?: string;
    notesInternes?: string;
    pcaNom?: string; pcaPrenoms?: string; pcaTelephone?: string; pcaEmail?: string;
  };

  const trialMode = body.trialActif === true;
  if (!body.nom || !body.ville || !body.region ||
      (!trialMode && (!body.planId || !body.dureeAns)) ||
      !body.pcaNom || !body.pcaPrenoms || !body.pcaTelephone) {
    res.status(400).json({ erreur: "Champs obligatoires manquants" });
    return;
  }

  try {
    const result = await licenceService.creerCooperativeM15({
      nom: body.nom,
      ville: body.ville,
      region: body.region,
      telephone: body.telephone,
      planId: body.planId,
      dureeAns: body.dureeAns,
      renouvellementAuto: body.renouvellementAuto,
      trialActif: body.trialActif,
      dureeTrialJours: body.dureeTrialJours,
      montantPaye: body.montantPaye,
      modePaiement: body.modePaiement,
      referencePaiement: body.referencePaiement,
      notesInternes: body.notesInternes,
      pcaNom: body.pcaNom,
      pcaPrenoms: body.pcaPrenoms,
      pcaTelephone: body.pcaTelephone,
      pcaEmail: body.pcaEmail,
    }, m15UserId(req));
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur création coop M15");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function getCooperativeHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const data = await licenceService.getCooperativeDetailM15(id);
    if (!data) { res.status(404).json({ erreur: "Coopérative introuvable" }); return; }
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Erreur détail coop M15");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function updateCooperativeHandler(req: Request, res: Response): Promise<void> {
  res.json({ message: "À implémenter" });
}

// ─── Licences ─────────────────────────────────────────────────────────────────

export async function getPlansHandler(req: Request, res: Response): Promise<void> {
  try {
    const plans = await db.select().from(plansAbonnementTable).where(eq(plansAbonnementTable.actif, true));
    res.json(plans);
  } catch (err) {
    req.log.error({ err }, "Erreur plans M15");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function updatePlanHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const body = req.body as {
    prix1anFcfa?: number; prix2ansFcfa?: number;
    prix3ansFcfa?: number; prix5ansFcfa?: number;
    nbMembresMax?: number | null; nbUsersMax?: number | null;
    stockageGo?: number | null; support?: string;
  };

  try {
    const [updated] = await db
      .update(plansAbonnementTable)
      .set({
        ...(body.prix1anFcfa !== undefined && { prix1anFcfa: String(body.prix1anFcfa) }),
        ...(body.prix2ansFcfa !== undefined && { prix2ansFcfa: String(body.prix2ansFcfa) }),
        ...(body.prix3ansFcfa !== undefined && { prix3ansFcfa: String(body.prix3ansFcfa) }),
        ...(body.prix5ansFcfa !== undefined && { prix5ansFcfa: String(body.prix5ansFcfa) }),
        ...(body.nbMembresMax !== undefined && { nbMembresMax: body.nbMembresMax }),
        ...(body.nbUsersMax !== undefined && { nbUsersMax: body.nbUsersMax }),
        ...(body.stockageGo !== undefined && { stockageGo: body.stockageGo }),
        ...(body.support !== undefined && { support: body.support }),
      })
      .where(eq(plansAbonnementTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ erreur: "Plan introuvable" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur mise à jour plan M15");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function genererLicenceHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    cooperativeId?: number; planId?: number; dureeAns?: number;
    renouvellementAuto?: boolean; notesInternes?: string;
    montantPaye?: number; modePaiement?: string; referencePaiement?: string;
  };

  if (!body.planId || !body.dureeAns) {
    res.status(400).json({ erreur: "planId et dureeAns requis" });
    return;
  }

  try {
    const cleLicence = await licenceService.genererCleLicence();

    const today = new Date();
    let dateExpiration: string | undefined;
    if (body.montantPaye && body.cooperativeId) {
      const exp = new Date(today);
      exp.setDate(exp.getDate() + body.dureeAns * 365);
      dateExpiration = exp.toISOString().slice(0, 10);
    }

    const [licence] = await db.insert(licencesTable).values({
      cooperativeId: body.cooperativeId ?? null,
      planId: body.planId,
      cleLicence,
      dureeAns: body.dureeAns,
      statut: (body.montantPaye && body.cooperativeId) ? "active" : "inactive",
      dateActivation: (body.montantPaye && body.cooperativeId) ? today.toISOString().slice(0, 10) : null,
      dateExpiration: dateExpiration ?? null,
      renouvellementAuto: body.renouvellementAuto ?? false,
      montantPayeFcfa: body.montantPaye ? String(body.montantPaye) : null,
      modePaiement: body.modePaiement ?? null,
      referencePaiement: body.referencePaiement ?? null,
      notesInternes: body.notesInternes ?? null,
      creePar: m15UserId(req),
    }).returning();

    res.status(201).json({ licence, cleLicence, dateExpiration: dateExpiration ?? null });
  } catch (err) {
    req.log.error({ err }, "Erreur génération licence M15");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function activerLicenceHandler(req: Request, res: Response): Promise<void> {
  const { cleLicence, cooperativeId } = req.body as { cleLicence?: string; cooperativeId?: number };
  if (!cleLicence || !cooperativeId) {
    res.status(400).json({ erreur: "cleLicence et cooperativeId requis" });
    return;
  }
  try {
    const result = await licenceService.activerLicence(cleLicence, cooperativeId, m15UserId(req));
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur activation licence M15");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function renouvelerLicenceHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]), 10);
  const body = req.body as { dureeAns?: number; montantPaye?: number; modePaiement?: string; referencePaiement?: string };
  if (isNaN(id) || !body.dureeAns) {
    res.status(400).json({ erreur: "ID et dureeAns requis" });
    return;
  }
  try {
    const result = await licenceService.renouvelerLicence(id, body.dureeAns, m15UserId(req), {
      montant: body.montantPaye, mode: body.modePaiement, reference: body.referencePaiement,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur renouvellement licence M15");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function toggleRenouvellementAutoHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]), 10);
  const { activer } = req.body as { activer?: boolean };
  if (isNaN(id) || typeof activer !== "boolean") {
    res.status(400).json({ erreur: "ID et activer (boolean) requis" });
    return;
  }
  try {
    await db.update(licencesTable)
      .set({ renouvellementAuto: activer, updatedAt: new Date() })
      .where(eq(licencesTable.id, id));
    res.json({ message: activer ? "Renouvellement automatique activé" : "Renouvellement automatique désactivé" });
  } catch (err) {
    req.log.error({ err }, "Erreur toggle renouvellement auto");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function suspendreCooperativeHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]), 10);
  const { motif } = req.body as { motif?: string };
  if (isNaN(id) || !motif) {
    res.status(400).json({ erreur: "ID et motif requis" });
    return;
  }
  try {
    await licenceService.suspendreCooperative(id, motif, m15UserId(req));
    res.json({ message: "Coopérative suspendue" });
  } catch (err) {
    req.log.error({ err }, "Erreur suspension coop M15");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function reactiverCooperativeHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    await licenceService.reactiverCooperative(id, m15UserId(req));
    res.json({ message: "Coopérative réactivée" });
  } catch (err) {
    req.log.error({ err }, "Erreur réactivation coop M15");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function supprimerCooperativeHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]), 10);
  const { motif, confirmation } = req.body as { motif?: string; confirmation?: string };

  if (isNaN(id) || !motif || !confirmation) {
    res.status(400).json({ erreur: "ID, motif et confirmation requis" });
    return;
  }

  try {
    const data = await licenceService.getCooperativeDetailM15(id);
    if (!data) { res.status(404).json({ erreur: "Coopérative introuvable" }); return; }

    const texteAttendu = `SUPPRIMER ${data.cooperative.nom.toUpperCase()}`;
    if (confirmation !== texteAttendu) {
      res.status(400).json({ erreur: `Confirmation incorrecte. Saisissez exactement : ${texteAttendu}` });
      return;
    }

    await licenceService.supprimerCooperative(id, motif, m15UserId(req));
    res.json({ message: "Coopérative supprimée et données anonymisées" });
  } catch (err) {
    req.log.error({ err }, "Erreur suppression coop M15");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function getHistoriqueLicenceHandler(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const { db } = await import("@workspace/db");
    const { historiqueLicencesTable, m15UsersTable } = await import("@workspace/db");
    const { desc, eq } = await import("drizzle-orm");
    const historique = await db
      .select({
        id: historiqueLicencesTable.id,
        action: historiqueLicencesTable.action,
        ancienStatut: historiqueLicencesTable.ancienStatut,
        nouveauStatut: historiqueLicencesTable.nouveauStatut,
        details: historiqueLicencesTable.details,
        createdAt: historiqueLicencesTable.createdAt,
        effectuePar: m15UsersTable.nom,
      })
      .from(historiqueLicencesTable)
      .leftJoin(m15UsersTable, eq(historiqueLicencesTable.effectuePar, m15UsersTable.id))
      .where(eq(historiqueLicencesTable.licenceId, id))
      .orderBy(desc(historiqueLicencesTable.createdAt));
    res.json(historique);
  } catch (err) {
    req.log.error({ err }, "Erreur historique licence M15");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
