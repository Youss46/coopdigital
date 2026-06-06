import { type Request, type Response } from "express";
import * as donService from "../services/donService.js";

const pid = (v: string | string[]): number => parseInt(Array.isArray(v) ? (v[0] ?? "0") : v, 10);

// ── Catégories ─────────────────────────────────────────────────────────────────

export async function getCategoriesHandler(req: Request, res: Response): Promise<void> {
  const sens = req.query.sens as "effectue" | "recu" | undefined;
  const rows = await donService.getCategories(sens);
  res.json(rows);
}

// ── Statistiques ───────────────────────────────────────────────────────────────

export async function getStatsDonsHandler(req: Request, res: Response): Promise<void> {
  const campagneId = req.query.campagne_id ? pid(req.query.campagne_id as string) : undefined;
  const stats = await donService.getStatsDons(campagneId);
  res.json(stats);
}

// ── Liste des dons ─────────────────────────────────────────────────────────────

export async function listerDonsHandler(req: Request, res: Response): Promise<void> {
  const { sens, forme, statut, categorie_id, date_debut, date_fin, beneficiaire_membre_id } = req.query as Record<string, string>;
  const dons = await donService.listerDons({
    sens,
    forme,
    statut,
    categorieId: categorie_id ? parseInt(categorie_id) : undefined,
    dateDebut: date_debut,
    dateFin: date_fin,
    beneficiaireMembreId: beneficiaire_membre_id ? parseInt(beneficiaire_membre_id) : undefined,
  });
  res.json(dons);
}

// ── Créer un don ───────────────────────────────────────────────────────────────

export async function creerDonHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as donService.CreerDonPayload & { lignes_nature?: donService.CreerDonPayload["lignesNature"] };
  if (!body.sens || !body.forme || !body.libelle || !body.dateDon) {
    res.status(400).json({ erreur: "sens, forme, libelle et dateDon sont obligatoires" });
    return;
  }
  if (!["effectue", "recu"].includes(body.sens)) {
    res.status(400).json({ erreur: "sens doit être 'effectue' ou 'recu'" });
    return;
  }
  if (!["especes", "nature"].includes(body.forme)) {
    res.status(400).json({ erreur: "forme doit être 'especes' ou 'nature'" });
    return;
  }

  const userId = (req as Request & { user?: { id: number } }).user?.id;
  const don = await donService.creerDon({
    ...body,
    lignesNature: body.lignesNature ?? body.lignes_nature,
    enregistrePar: userId,
  });
  res.status(201).json(don);
}

// ── Détail d'un don ────────────────────────────────────────────────────────────

export async function getDonHandler(req: Request, res: Response): Promise<void> {
  try {
    const don = await donService.getDonDetail(pid(req.params.id));
    res.json(don);
  } catch {
    res.status(404).json({ erreur: "Don introuvable" });
  }
}

// ── Modifier un don ────────────────────────────────────────────────────────────

export async function modifierDonHandler(req: Request, res: Response): Promise<void> {
  try {
    const don = await donService.modifierDon(pid(req.params.id), req.body as Parameters<typeof donService.modifierDon>[1]);
    res.json(don);
  } catch (err) {
    res.status(400).json({ erreur: err instanceof Error ? err.message : "Erreur" });
  }
}

// ── Valider un don ─────────────────────────────────────────────────────────────

export async function validerDonHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as Request & { user?: { id: number } }).user?.id ?? 0;
    const don = await donService.validerDon(pid(req.params.id), userId);
    res.json(don);
  } catch (err) {
    res.status(400).json({ erreur: err instanceof Error ? err.message : "Erreur" });
  }
}

// ── Annuler un don ─────────────────────────────────────────────────────────────

export async function annulerDonHandler(req: Request, res: Response): Promise<void> {
  try {
    const { motif } = req.body as { motif?: string };
    const don = await donService.annulerDon(pid(req.params.id), motif ?? "");
    res.json(don);
  } catch (err) {
    res.status(400).json({ erreur: err instanceof Error ? err.message : "Erreur" });
  }
}

// ── PV de remise PDF ───────────────────────────────────────────────────────────

export async function getPVRemiseHandler(req: Request, res: Response): Promise<void> {
  try {
    await donService.generatePVRemisePDF(pid(req.params.id), res);
  } catch (err) {
    res.status(400).json({ erreur: err instanceof Error ? err.message : "Erreur PDF" });
  }
}

// ── Rapport PDF ────────────────────────────────────────────────────────────────

export async function getRapportDonsHandler(req: Request, res: Response): Promise<void> {
  const campagneId = req.query.campagne_id ? pid(req.query.campagne_id as string) : undefined;
  await donService.generateRapportDonsPDF(res, campagneId);
}

// ── Dons d'un membre ───────────────────────────────────────────────────────────

export async function getDonsMembreHandler(req: Request, res: Response): Promise<void> {
  const data = await donService.getDonsMembre(pid(req.params.membre_id));
  res.json(data);
}

// ── Programmes ─────────────────────────────────────────────────────────────────

export async function listerProgrammesHandler(req: Request, res: Response): Promise<void> {
  const progs = await donService.listerProgrammes();
  res.json(progs);
}

export async function creerProgrammeHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Parameters<typeof donService.creerProgramme>[0];
  if (!body.libelle || !body.budgetAlloueFcfa) {
    res.status(400).json({ erreur: "libelle et budgetAlloueFcfa sont obligatoires" });
    return;
  }
  const prog = await donService.creerProgramme(body);
  res.status(201).json(prog);
}

export async function cloturerProgrammeHandler(req: Request, res: Response): Promise<void> {
  try {
    const prog = await donService.cloturerProgramme(pid(req.params.id));
    res.json(prog);
  } catch (err) {
    res.status(400).json({ erreur: err instanceof Error ? err.message : "Erreur" });
  }
}
