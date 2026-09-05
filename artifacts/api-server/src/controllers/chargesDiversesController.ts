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
  securiserReglementPpsi,
} from "../services/chargesDiversesService";

export function erreurStructureCharge(
  modePaiement: string,
  compteCredit: string,
  tiers: string | null | undefined,
  compteTresorerieId: number | null | undefined,
  compteTresorerieType: "caisse" | "banque" | "mobile_marchand" | null | undefined,
): string | null {
  if (modePaiement === "credit") {
    if (compteCredit !== "401") return "Une charge à crédit doit utiliser le compte 401 — Fournisseurs";
    if (compteTresorerieId != null || compteTresorerieType != null) {
      return "Une charge à crédit ne peut pas avoir de compte de trésorerie";
    }
    if (!tiers?.trim()) return "Le fournisseur ou le tiers est requis pour une charge à crédit";
  }
  if (compteCredit === "401" && modePaiement !== "credit") {
    return "Le compte 401 — Fournisseurs nécessite le mode de paiement « À crédit »";
  }
  return null;
}

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
      compte_tresorerie_id?: number | null;
      compte_tresorerie_type?: "caisse" | "banque" | "mobile_marchand" | null;
    };
    const compteCredit = body.compte_credit ?? "571";
    const modePaiement = body.mode_paiement ?? "especes";
    const structureError = erreurStructureCharge(
      modePaiement,
      compteCredit,
      body.tiers,
      body.compte_tresorerie_id,
      body.compte_tresorerie_type,
    );
    if (structureError) { res.status(400).json({ erreur: structureError }); return; }
    if (!body.date_charge || !body.libelle || !body.montant_fcfa || body.montant_fcfa <= 0 || !body.categorie) {
      res.status(400).json({ erreur: "date_charge, libelle, montant_fcfa et categorie requis" });
      return;
    }
    if (body.categorie === "ppsi" && !body.tiers?.trim()) {
      res.status(400).json({ erreur: "Le nom du prestataire est requis pour une prestation soumise à la PPSSI" });
      return;
    }
    const row = await createChargeDiverses(cooperativeId, userId, {
      dateCharge:     body.date_charge,
      libelle:        body.libelle,
      description:    body.description ?? null,
      montantFcfa:    String(body.montant_fcfa),
      categorie:      body.categorie,
      compteDebit:    body.compte_debit  ?? COMPTE_DEBIT_DEFAUT[body.categorie] ?? "658",
      compteCredit,
      modePaiement,
      tiers:          body.tiers ?? null,
      referencePiece: body.reference_piece ?? null,
       compteTresorerieId: body.compte_tresorerie_id == null ? null : Number(body.compte_tresorerie_id),
       compteTresorerieType: body.compte_tresorerie_type ?? null,
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
      compte_tresorerie_id?: number | null;
      compte_tresorerie_type?: "caisse" | "banque" | "mobile_marchand" | null;
    };
    if (body.mode_paiement === "credit" || body.compte_credit === "401") {
      const structureError = erreurStructureCharge(
        body.mode_paiement ?? "credit",
        body.compte_credit ?? "401",
        body.tiers,
        body.compte_tresorerie_id,
        body.compte_tresorerie_type,
      );
      if (structureError) { res.status(400).json({ erreur: structureError }); return; }
    }
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
      ...(body.compte_tresorerie_id !== undefined
        ? { compteTresorerieId: body.compte_tresorerie_id == null ? null : Number(body.compte_tresorerie_id) }
        : {}),
      ...(body.compte_tresorerie_type !== undefined
        ? { compteTresorerieType: body.compte_tresorerie_type }
        : {}),
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

    // Pour une prestation informelle, le brut crée la dette prestataire,
    // la retenue la transfère vers la dette fiscale, et seul le net sort.
    const brut = Math.round(parseFloat(row.montantFcfa));
    if (row.categorie === "ppsi" && row.modePaiement !== "credit") {
      // Reborner aussi les anciennes lignes : validation ne garantit pas que
      // les montants persistés avant ce garde-fou soient cohérents.
      const reglement = securiserReglementPpsi(
        brut,
        row.retenuePpsiFcfa ?? 0,
        row.montantNetFcfa ?? brut - (row.retenuePpsiFcfa ?? 0),
      );
      const montantBrut = reglement.brut;
      const retenue = reglement.retenue;
      const net = reglement.net;
      const piece = row.referencePiece ?? `PPSI-${row.id}`;
       const compteTresorerie = ["571", "521", "552"].includes(row.compteCredit)
         ? row.compteCredit
         : row.modePaiement === "mobile_money" ? "552"
         : row.modePaiement === "virement" || row.modePaiement === "cheque" ? "521"
         : "571";
      const entries = [
        { compteDebit: row.compteDebit, compteCredit: "401", montantFcfa: montantBrut, libelle: `Prestation brute — ${row.libelle}` },
        ...(retenue > 0 ? [{ compteDebit: "401", compteCredit: "447", montantFcfa: retenue, libelle: `Retenue PPSI — ${row.libelle}` }] : []),
        ...(net > 0 ? [{ compteDebit: "401", compteCredit: compteTresorerie, montantFcfa: net, libelle: `Règlement net prestataire — ${row.libelle}` }] : []),
      ];
      await Promise.all(entries.map(entry => proposerEcriture(cooperativeId, {
        source: "charges_diverses",
        sourceId: row.id,
        ...entry,
        date: row.dateCharge,
        numeroPiece: piece,
      })));
    } else {
      await proposerEcriture(cooperativeId, {
        source: "charges_diverses",
        sourceId: row.id,
        libelle: row.libelle,
        compteDebit: row.compteDebit,
        compteCredit: row.compteCredit,
        montantFcfa: brut,
        date: row.dateCharge,
        numeroPiece: row.referencePiece ?? undefined,
      });
    }

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
    ppsi_taux_pct:    r.ppsiTauxPct == null ? null : parseFloat(r.ppsiTauxPct),
    retenue_ppsi_fcfa: r.retenuePpsiFcfa ?? 0,
    montant_net_fcfa: r.montantNetFcfa ?? null,
    categorie:        r.categorie,
    compte_debit:     r.compteDebit,
    compte_credit:    r.compteCredit,
    mode_paiement:    r.modePaiement,
    tiers:            r.tiers ?? null,
    reference_piece:  r.referencePiece ?? null,
    compte_tresorerie_id: r.compteTresorerieId ?? null,
    compte_tresorerie_type: r.compteTresorerieType ?? null,
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
  ppsi:             "632",
};
