import type { Request, Response } from "express";
import { proposerEcriture } from "../services/comptabiliteService";
import {
  listChargesDiverses,
  getChargeDiverses,
  createChargeDiverses,
  updateChargeDiverses,
  validerChargeDiverses,
  deleteChargeDiverses,
  getStatsChargesDiverses,
} from "../services/chargesDiversesService";

// ── GET /charges-diverses ─────────────────────────────────────────────────────
export async function handleListChargesDiverses(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const { statut, categorie, date_debut, date_fin, limit, offset } = req.query as Record<string, string | undefined>;
    const rows = await listChargesDiverses(cooperativeId, {
      statut,
      categorie,
      dateDebut: date_debut,
      dateFin:   date_fin,
      limit:     limit  ? parseInt(limit)  : undefined,
      offset:    offset ? parseInt(offset) : undefined,
    });
    res.json(rows.map(mapCharge));
  } catch (err) {
    req.log.error({ err }, "Erreur listChargesDiverses");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── POST /charges-diverses ────────────────────────────────────────────────────
export async function handleCreateChargeDiverses(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    const userId = req.user?.id;
    if (!cooperativeId || !userId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const body = req.body as {
      date_charge: string; libelle: string; description?: string;
      montant_fcfa: number; categorie: string;
      compte_debit: string; compte_credit: string;
      mode_paiement: string; tiers?: string; reference_piece?: string;
    };
    if (!body.date_charge || !body.libelle || !body.montant_fcfa || !body.categorie) {
      res.status(400).json({ erreur: "date_charge, libelle, montant_fcfa et categorie requis" });
      return;
    }
    const row = await createChargeDiverses(cooperativeId, userId, {
      dateCharge:     body.date_charge,
      libelle:        body.libelle,
      description:    body.description ?? null,
      montantFcfa:    String(body.montant_fcfa),
      categorie:      body.categorie,
      compteDebit:    body.compte_debit  ?? COMPTE_DEBIT_DEFAUT[body.categorie] ?? "658",
      compteCredit:   body.compte_credit ?? "571",
      modePaiement:   body.mode_paiement ?? "especes",
      tiers:          body.tiers ?? null,
      referencePiece: body.reference_piece ?? null,
    });
    res.status(201).json(mapCharge(row));
  } catch (err) {
    req.log.error({ err }, "Erreur createChargeDiverses");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── GET /charges-diverses/:id ─────────────────────────────────────────────────
export async function handleGetChargeDiverses(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    const row = await getChargeDiverses(cooperativeId, id);
    if (!row) { res.status(404).json({ erreur: "Charge introuvable" }); return; }
    res.json(mapCharge(row));
  } catch (err) {
    req.log.error({ err }, "Erreur getChargeDiverses");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── PUT /charges-diverses/:id ─────────────────────────────────────────────────
export async function handleUpdateChargeDiverses(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    const body = req.body as {
      date_charge?: string; libelle?: string; description?: string;
      montant_fcfa?: number; categorie?: string;
      compte_debit?: string; compte_credit?: string;
      mode_paiement?: string; tiers?: string; reference_piece?: string;
    };
    const row = await updateChargeDiverses(cooperativeId, id, {
      ...(body.date_charge     ? { dateCharge:     body.date_charge }      : {}),
      ...(body.libelle         ? { libelle:        body.libelle }           : {}),
      ...(body.description     !== undefined ? { description: body.description } : {}),
      ...(body.montant_fcfa    ? { montantFcfa:    String(body.montant_fcfa) } : {}),
      ...(body.categorie       ? { categorie:      body.categorie }         : {}),
      ...(body.compte_debit    ? { compteDebit:    body.compte_debit }      : {}),
      ...(body.compte_credit   ? { compteCredit:   body.compte_credit }     : {}),
      ...(body.mode_paiement   ? { modePaiement:   body.mode_paiement }     : {}),
      ...(body.tiers           !== undefined ? { tiers: body.tiers }        : {}),
      ...(body.reference_piece !== undefined ? { referencePiece: body.reference_piece } : {}),
    });
    if (!row) { res.status(404).json({ erreur: "Charge introuvable ou déjà validée" }); return; }
    res.json(mapCharge(row));
  } catch (err) {
    req.log.error({ err }, "Erreur updateChargeDiverses");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── PUT /charges-diverses/:id/valider ─────────────────────────────────────────
export async function handleValiderChargeDiverses(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    const userId = req.user?.id;
    if (!cooperativeId || !userId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    const row = await validerChargeDiverses(cooperativeId, id, userId);
    if (!row) { res.status(404).json({ erreur: "Charge introuvable ou déjà validée" }); return; }

    // Écriture comptable OHADA — respecte le toggle auto/manuel de la coopérative
    void proposerEcriture(cooperativeId, {
      source:       "charges_diverses",
      sourceId:     row.id,
      libelle:      row.libelle,
      compteDebit:  row.compteDebit,
      compteCredit: row.compteCredit,
      montantFcfa:  Math.round(parseFloat(row.montantFcfa)),
      date:         row.dateCharge,
      numeroPiece:  row.referencePiece ?? undefined,
    });

    res.json(mapCharge(row));
  } catch (err) {
    req.log.error({ err }, "Erreur validerChargeDiverses");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── DELETE /charges-diverses/:id ──────────────────────────────────────────────
export async function handleDeleteChargeDiverses(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    const row = await deleteChargeDiverses(cooperativeId, id);
    if (!row) { res.status(404).json({ erreur: "Charge introuvable ou déjà validée (non supprimable)" }); return; }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Erreur deleteChargeDiverses");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── GET /charges-diverses/stats ───────────────────────────────────────────────
export async function handleStatsChargesDiverses(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const { date_debut, date_fin } = req.query as Record<string, string | undefined>;
    const stats = await getStatsChargesDiverses(cooperativeId, { dateDebut: date_debut, dateFin: date_fin });
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Erreur statsChargesDiverses");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mapCharge(r: Awaited<ReturnType<typeof getChargeDiverses>>) {
  if (!r) return null;
  return {
    id:               r.id,
    cooperative_id:   r.cooperativeId,
    date_charge:      r.dateCharge,
    libelle:          r.libelle,
    description:      r.description ?? null,
    montant_fcfa:     parseFloat(r.montantFcfa),
    categorie:        r.categorie,
    compte_debit:     r.compteDebit,
    compte_credit:    r.compteCredit,
    mode_paiement:    r.modePaiement,
    tiers:            r.tiers ?? null,
    reference_piece:  r.referencePiece ?? null,
    statut:           r.statut,
    created_by:       r.createdBy ?? null,
    approved_by:      r.approvedBy ?? null,
    approved_at:      r.approvedAt?.toISOString() ?? null,
    created_at:       r.createdAt.toISOString(),
    updated_at:       r.updatedAt.toISOString(),
  };
}

// Comptes OHADA par défaut par catégorie
const COMPTE_DEBIT_DEFAUT: Record<string, string> = {
  loyer:            "622",
  eau_electricite:  "605",
  fournitures:      "604",
  communication:    "628",
  deplacement:      "618",
  reception:        "627",
  entretien:        "624",
  honoraires:       "632",
  publicite:        "627",
  autre:            "658",
};
