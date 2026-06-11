import { Request, Response, NextFunction } from "express";
import * as svc from "../services/equipementsService.js";
import { genererTableauAmortissement } from "../services/equipementsService.js";
import { proposerEcriture } from "../services/comptabiliteService.js";

function toDateStr(d: unknown): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d ?? "");
}

function getCoopId(req: Request, res: Response): number | null {
  const id = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ error: "Coopérative introuvable" }); return null; }
  return id;
}

// ─── Catégories ───────────────────────────────────────────────────────────────

export async function getCategoriesEquipements(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const data = await svc.listerCategories(coopId);
    res.json(data);
  } catch (e) { next(e); }
}

// ─── CRUD Équipements ─────────────────────────────────────────────────────────

export async function getEquipements(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const categorieId = req.query.categorie_id ? Number(req.query.categorie_id) : undefined;
    const statut = req.query.statut as string | undefined;
    const data = await svc.listerEquipements(coopId, { categorieId, statut });
    res.json(data);
  } catch (e) { next(e); }
}

export async function getEquipementsByCategorie(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const categorieId = Number(String(req.params["id"]));
    const data = await svc.listerEquipements(coopId, { categorieId });
    res.json(data);
  } catch (e) { next(e); }
}

export async function getEquipementById(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const id = Number(String(req.params["id"]));
    const data = await svc.getEquipement(id, coopId);
    if (!data) { res.status(404).json({ error: "Équipement introuvable" }); return; }
    res.json(data);
  } catch (e) { next(e); }
}

export async function postEquipement(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const body = req.body as {
      categorie_id: number;
      designation: string;
      marque?: string;
      modele?: string;
      numero_serie?: string;
      date_acquisition: unknown;
      valeur_acquisition_fcfa: number;
      valeur_residuelle_fcfa?: number;
      duree_amortissement_ans: number;
      methode_amortissement?: string;
      affecte_a?: string;
      affecte_user_id?: number;
      date_mise_service?: unknown;
      garantie_expiration?: unknown;
    };
    const data = await svc.creerEquipement(coopId, {
      ...body,
      date_acquisition: toDateStr(body.date_acquisition),
      date_mise_service: body.date_mise_service ? toDateStr(body.date_mise_service) : undefined,
      garantie_expiration: body.garantie_expiration ? toDateStr(body.garantie_expiration) : undefined,
    });
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function putEquipement(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const id = Number(String(req.params["id"]));
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { ...body };
    if (body.date_acquisition) patch.date_acquisition = toDateStr(body.date_acquisition);
    if (body.date_mise_service) patch.date_mise_service = toDateStr(body.date_mise_service);
    if (body.garantie_expiration) patch.garantie_expiration = toDateStr(body.garantie_expiration);
    const data = await svc.modifierEquipement(id, coopId, patch as Parameters<typeof svc.modifierEquipement>[2]);
    if (!data) { res.status(404).json({ error: "Équipement introuvable" }); return; }
    res.json(data);
  } catch (e) { next(e); }
}

export async function deleteEquipement(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const id = Number(String(req.params["id"]));
    const data = await svc.supprimerEquipement(id, coopId);
    if (!data) { res.status(404).json({ error: "Équipement introuvable" }); return; }
    res.json({ success: true });
  } catch (e) { next(e); }
}

// ─── Alertes & Amortis ────────────────────────────────────────────────────────

export async function getEquipementsAlertes(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const data = await svc.getAlertes(coopId);
    res.json(data);
  } catch (e) { next(e); }
}

export async function getEquipementsAmortis(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const data = await svc.getEquipementsAmortis(coopId);
    res.json(data);
  } catch (e) { next(e); }
}

// ─── Tableau d'amortissement ──────────────────────────────────────────────────

export async function getTableauAmortissement(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const id = Number(String(req.params["id"]));
    const equip = await svc.getEquipement(id, coopId);
    if (!equip) { res.status(404).json({ error: "Équipement introuvable" }); return; }
    const lignes = genererTableauAmortissement({
      id: equip.id,
      valeur_acquisition_fcfa: equip.valeur_acquisition_fcfa,
      valeur_residuelle_fcfa: equip.valeur_residuelle_fcfa,
      valeur_nette_comptable_fcfa: equip.valeur_nette_comptable_fcfa,
      cumul_amortissement_fcfa: equip.cumul_amortissement_fcfa,
      duree_amortissement_ans: equip.duree_amortissement_ans,
      methode_amortissement: equip.methode_amortissement,
      date_mise_service: equip.date_mise_service,
      date_acquisition: equip.date_acquisition,
    });
    res.json({ equipement: equip, lignes });
  } catch (e) { next(e); }
}

// ─── Dotations ────────────────────────────────────────────────────────────────

export async function postGenererDotations(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const { mois, annee } = req.body as { mois: number; annee: number };
    const data = await svc.genererDotationsMensuelles(coopId, mois, annee);
    res.json(data);
  } catch (e) { next(e); }
}

// ─── Rapport inventaire ───────────────────────────────────────────────────────

export async function getRapportInventaire(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const data = await svc.getRapportInventaire(coopId);
    res.json(data);
  } catch (e) { next(e); }
}

// ─── Maintenances ─────────────────────────────────────────────────────────────

export async function getMaintenances(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(String(req.params["id"]));
    const data = await svc.listerMaintenances(id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function postMaintenance(req: Request, res: Response, next: NextFunction) {
  try {
    const coopId = getCoopId(req, res); if (!coopId) return;
    const id = Number(String(req.params["id"]));
    const body = req.body as {
      type: string;
      date_maintenance: unknown;
      description?: string;
      cout_fcfa?: number;
      prestataire?: string;
      prochaine_maintenance?: unknown;
    };
    const data = await svc.enregistrerMaintenance(id, {
      ...body,
      date_maintenance: toDateStr(body.date_maintenance),
      prochaine_maintenance: body.prochaine_maintenance ? toDateStr(body.prochaine_maintenance) : undefined,
    });

    // Écriture comptable : frais maintenance équipement → 624 Entretien / 521 Banque
    if (body.cout_fcfa && body.cout_fcfa > 0) {
      const dateStr = toDateStr(body.date_maintenance);
      void proposerEcriture(coopId, {
        source: "paiement",
        sourceId: id,
        libelle: `Maintenance équipement – ${body.type}`,
        compteDebit:  "624",
        compteCredit: "521",
        montantFcfa:  Math.round(body.cout_fcfa),
        date:         dateStr,
        numeroPiece:  `MAINT-${id}`,
      });
    }

    res.status(201).json(data);
  } catch (e) { next(e); }
}
