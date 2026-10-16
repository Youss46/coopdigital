import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { apiError } from "../lib/apiError.js";

type PaiementRapportRow = {
  cooperativeNom: string;
  livraisonId: number | null;
  numeroLivraison: string | null;
  dateLivraison: string | null;
  producteur: string | null;
  village: string | null;
  montantNetFcfa: number | string | null;
  montantRegleFcfa: number | string | null;
  montantRestantFcfa: number | string | null;
};

function estDateValide(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function entier(value: number | string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export async function getPaiementsRapportEnAttente(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const dateDebut = typeof req.query["date_debut"] === "string"
    ? req.query["date_debut"]
    : "";
  const dateFin = typeof req.query["date_fin"] === "string"
    ? req.query["date_fin"]
    : "";
  if (!estDateValide(dateDebut) || !estDateValide(dateFin) || dateDebut > dateFin) {
    res.status(400).json({
      erreur: "Sélectionnez une période valide avec les dates au format AAAA-MM-JJ.",
    });
    return;
  }

  const estDelegue = req.user?.role === "delegue";
  const utilisateurId = req.user?.id ?? null;
  if (estDelegue && utilisateurId == null) {
    res.status(403).json({ erreur: "Utilisateur non identifié" });
    return;
  }

  try {
    const result = await db.execute<PaiementRapportRow>(sql`
      WITH paiements_en_attente AS (
        SELECT DISTINCT ON (l.id)
          l.id AS "livraisonId",
          COALESCE(
            NULLIF(l.numero_livraison, ''),
            p.numero_recu,
            'LIV-' || l.id::text
          ) AS "numeroLivraison",
          l.date_livraison::text AS "dateLivraison",
          COALESCE(
            NULLIF(BTRIM(CONCAT_WS(' ', m.nom, m.prenoms)), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', f.nom, f.prenoms)), ''),
            'Producteur non renseigné'
          ) AS producteur,
          m.village AS village,
          l.montant_net_fcfa::integer AS "montantNetFcfa",
          GREATEST(
            0,
            ROUND(COALESCE(l.montant_restant, l.montant_net_fcfa, 0))
          )::integer AS "montantRestantFcfa",
          GREATEST(
            0,
            l.montant_net_fcfa - GREATEST(
              0,
              ROUND(COALESCE(l.montant_restant, l.montant_net_fcfa, 0))
            )
          )::integer AS "montantRegleFcfa"
        FROM paiements p
        INNER JOIN livraisons l ON l.id = p.livraison_id
        LEFT JOIN membres m ON m.id = l.membre_id
        LEFT JOIN fournisseurs f ON f.id = l.fournisseur_id
        LEFT JOIN users agent_user ON agent_user.id = l.agent_id
        WHERE p.statut = 'en_attente'
          AND p.livraison_id IS NOT NULL
          AND l.cooperative_id = ${cooperativeId}
          AND l.date_livraison >= ${dateDebut}::date
          AND l.date_livraison <= ${dateFin}::date
          AND GREATEST(
            0,
            ROUND(COALESCE(l.montant_restant, l.montant_net_fcfa, 0))
          ) > 0
          AND (
            (
              ${estDelegue}::boolean
              AND ${utilisateurId}::integer IS NOT NULL
              AND (
                m.delegue_id = ${utilisateurId}
                OR f.cree_par_delegue_id = ${utilisateurId}
              )
            )
            OR (
              NOT ${estDelegue}::boolean
              AND (
                p.mode_paiement IS NULL
                OR p.mode_paiement <> 'especes'
                OR l.agent_id IS NULL
                OR agent_user.role <> 'delegue'
              )
            )
          )
        ORDER BY l.id, p.created_at DESC, p.id DESC
      )
      SELECT
        c.nom AS "cooperativeNom",
        pending."livraisonId",
        pending."numeroLivraison",
        pending."dateLivraison",
        pending.producteur,
        pending.village,
        pending."montantNetFcfa",
        pending."montantRegleFcfa",
        pending."montantRestantFcfa"
      FROM cooperatives c
      LEFT JOIN paiements_en_attente pending ON TRUE
      WHERE c.id = ${cooperativeId}
      ORDER BY pending."dateLivraison" ASC NULLS LAST,
        pending."numeroLivraison" ASC NULLS LAST,
        pending."livraisonId" ASC NULLS LAST
    `);

    if (result.rows.length === 0) {
      res.status(404).json({ erreur: "Coopérative introuvable" });
      return;
    }

    const cooperativeNom = result.rows[0]!.cooperativeNom;
    const items = result.rows
      .filter((row) => row.livraisonId != null)
      .map((row) => ({
        livraisonId: Number(row.livraisonId),
        numeroLivraison: row.numeroLivraison ?? `LIV-${row.livraisonId}`,
        dateLivraison: row.dateLivraison ?? "",
        producteur: row.producteur ?? "Producteur non renseigné",
        village: row.village,
        montantNetFcfa: entier(row.montantNetFcfa),
        montantRegleFcfa: entier(row.montantRegleFcfa),
        montantRestantFcfa: entier(row.montantRestantFcfa),
      }));
    const totaux = items.reduce(
      (sum, item) => ({
        montantNet: sum.montantNet + item.montantNetFcfa,
        montantRegle: sum.montantRegle + item.montantRegleFcfa,
        montantRestant: sum.montantRestant + item.montantRestantFcfa,
      }),
      { montantNet: 0, montantRegle: 0, montantRestant: 0 },
    );

    res.json({
      cooperativeNom,
      dateDebut,
      dateFin,
      genereLe: new Date().toISOString(),
      nombreLivraisons: items.length,
      totalMontantNetFcfa: totaux.montantNet,
      totalMontantRegleFcfa: totaux.montantRegle,
      totalMontantRestantFcfa: totaux.montantRestant,
      items,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getPaiementsRapportEnAttente");
    res.status(500).json({ erreur: apiError(err) });
  }
}
