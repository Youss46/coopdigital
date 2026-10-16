import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { apiError } from "../lib/apiError.js";

type PaiementRapportEffectueRow = {
  cooperativeNom: string;
  itemId: string | null;
  dateReglement: string | null;
  dateLivraison: string | null;
  numeroLivraison: string | null;
  producteur: string | null;
  village: string | null;
  modePaiement: string | null;
  referencePaiement: string | null;
  montantFcfa: number | string | null;
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

export async function getPaiementsRapportEffectues(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const dateDebut = typeof req.query["date_debut"] === "string" ? req.query["date_debut"] : "";
  const dateFin = typeof req.query["date_fin"] === "string" ? req.query["date_fin"] : "";
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
    const result = await db.execute<PaiementRapportEffectueRow>(sql`
      WITH cheques_total AS (
        SELECT
          COALESCE(ch.paiement_id, ligne_cheque.paiement_id) AS paiement_id,
          SUM(ch.montant_fcfa)::integer AS montant_fcfa
        FROM cheques_emis ch
        LEFT JOIN paiement_lignes ligne_cheque
          ON ligne_cheque.id = ch.paiement_ligne_id
        GROUP BY COALESCE(ch.paiement_id, ligne_cheque.paiement_id)
      ),
      evenements_regles AS (
        SELECT
          'paiement-ligne-' || pl.id::text AS "itemId",
          COALESCE(p.date_validation, p.created_at)::date::text AS "dateReglement",
          l.date_livraison::text AS "dateLivraison",
          COALESCE(
            NULLIF(l.numero_livraison, ''),
            p.numero_recu,
            'LIV-' || l.id::text
          ) AS "numeroLivraison",
          COALESCE(
            NULLIF(BTRIM(CONCAT_WS(' ', m.nom, m.prenoms)), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', f.nom, f.prenoms)), ''),
            'Producteur non renseigné'
          ) AS producteur,
          m.village AS village,
          pl.mode_paiement::text AS "modePaiement",
          COALESCE(
            NULLIF(pl.reference_transaction, ''),
            p.numero_recu,
            p.reference_transaction,
            'REG-' || p.id::text
          ) AS "referencePaiement",
          pl.montant_fcfa::integer AS "montantFcfa",
          l.id AS livraison_id,
          p.id AS paiement_id
        FROM paiements p
        INNER JOIN livraisons l ON l.id = p.livraison_id
        INNER JOIN paiement_lignes pl ON pl.paiement_id = p.id
        LEFT JOIN membres m ON m.id = l.membre_id
        LEFT JOIN fournisseurs f ON f.id = l.fournisseur_id
        LEFT JOIN users agent_user ON agent_user.id = l.agent_id
        WHERE p.statut IN ('confirme', 'effectue', 'en_cours')
          AND pl.mode_paiement <> 'cheque'
          AND l.cooperative_id = ${cooperativeId}
          AND COALESCE(p.date_validation, p.created_at)::date >= ${dateDebut}::date
          AND COALESCE(p.date_validation, p.created_at)::date <= ${dateFin}::date
          AND (
            (
              ${estDelegue}::boolean
              AND ${utilisateurId} IS NOT NULL
              AND (m.delegue_id = ${utilisateurId} OR f.cree_par_delegue_id = ${utilisateurId})
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

        UNION ALL

        SELECT
          'paiement-' || p.id::text AS "itemId",
          COALESCE(p.date_validation, p.created_at)::date::text AS "dateReglement",
          l.date_livraison::text AS "dateLivraison",
          COALESCE(
            NULLIF(l.numero_livraison, ''),
            p.numero_recu,
            'LIV-' || l.id::text
          ) AS "numeroLivraison",
          COALESCE(
            NULLIF(BTRIM(CONCAT_WS(' ', m.nom, m.prenoms)), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', f.nom, f.prenoms)), ''),
            'Producteur non renseigné'
          ) AS producteur,
          m.village AS village,
          COALESCE(p.mode_paiement::text, 'paiement') AS "modePaiement",
          COALESCE(
            p.numero_recu,
            p.reference_transaction,
            'REG-' || p.id::text
          ) AS "referencePaiement",
          GREATEST(0, p.montant_fcfa - COALESCE(ct.montant_fcfa, 0))::integer AS "montantFcfa",
          l.id AS livraison_id,
          p.id AS paiement_id
        FROM paiements p
        INNER JOIN livraisons l ON l.id = p.livraison_id
        LEFT JOIN membres m ON m.id = l.membre_id
        LEFT JOIN fournisseurs f ON f.id = l.fournisseur_id
        LEFT JOIN users agent_user ON agent_user.id = l.agent_id
        LEFT JOIN cheques_total ct ON ct.paiement_id = p.id
        WHERE p.statut IN ('confirme', 'effectue', 'en_cours')
          AND (p.mode_paiement IS NULL OR p.mode_paiement <> 'cheque')
          AND NOT EXISTS (
            SELECT 1 FROM paiement_lignes pl_absentes WHERE pl_absentes.paiement_id = p.id
          )
          AND l.cooperative_id = ${cooperativeId}
          AND COALESCE(p.date_validation, p.created_at)::date >= ${dateDebut}::date
          AND COALESCE(p.date_validation, p.created_at)::date <= ${dateFin}::date
          AND (
            (
              ${estDelegue}::boolean
              AND ${utilisateurId} IS NOT NULL
              AND (m.delegue_id = ${utilisateurId} OR f.cree_par_delegue_id = ${utilisateurId})
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

        UNION ALL

        SELECT
          'cheque-' || ch.id::text AS "itemId",
          ch.date_encaissement::text AS "dateReglement",
          l.date_livraison::text AS "dateLivraison",
          COALESCE(
            NULLIF(l.numero_livraison, ''),
            p.numero_recu,
            'LIV-' || l.id::text
          ) AS "numeroLivraison",
          COALESCE(
            NULLIF(BTRIM(CONCAT_WS(' ', m.nom, m.prenoms)), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', f.nom, f.prenoms)), ''),
            'Producteur non renseigné'
          ) AS producteur,
          m.village AS village,
          'cheque'::text AS "modePaiement",
          COALESCE(
            NULLIF(ch.numero_cheque, ''),
            p.numero_recu,
            p.reference_transaction,
            'CHEQUE-' || ch.id::text
          ) AS "referencePaiement",
          ch.montant_fcfa::integer AS "montantFcfa",
          l.id AS livraison_id,
          p.id AS paiement_id
        FROM cheques_emis ch
        LEFT JOIN paiement_lignes ligne_cheque ON ligne_cheque.id = ch.paiement_ligne_id
        INNER JOIN paiements p ON p.id = COALESCE(ch.paiement_id, ligne_cheque.paiement_id)
        INNER JOIN livraisons l ON l.id = COALESCE(p.livraison_id, ch.livraison_id)
        LEFT JOIN membres m ON m.id = l.membre_id
        LEFT JOIN fournisseurs f ON f.id = l.fournisseur_id
        LEFT JOIN users agent_user ON agent_user.id = l.agent_id
        WHERE ch.statut = 'encaisse'
          AND ch.date_encaissement >= ${dateDebut}::date
          AND ch.date_encaissement <= ${dateFin}::date
          AND ch.cooperative_id = ${cooperativeId}
          AND p.statut IN ('confirme', 'effectue', 'en_cours')
          AND l.cooperative_id = ${cooperativeId}
          AND (
            (
              ${estDelegue}::boolean
              AND ${utilisateurId} IS NOT NULL
              AND (m.delegue_id = ${utilisateurId} OR f.cree_par_delegue_id = ${utilisateurId})
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
      )
      SELECT
        c.nom AS "cooperativeNom",
        reglement_event."itemId",
        reglement_event."dateReglement",
        reglement_event."dateLivraison",
        reglement_event."numeroLivraison",
        reglement_event.producteur,
        reglement_event.village,
        reglement_event."modePaiement",
        reglement_event."referencePaiement",
        reglement_event."montantFcfa"
      FROM cooperatives c
      LEFT JOIN evenements_regles reglement_event ON TRUE
      WHERE c.id = ${cooperativeId}
        AND (reglement_event."montantFcfa" IS NULL OR reglement_event."montantFcfa" > 0)
      ORDER BY reglement_event."dateReglement" ASC NULLS LAST,
        reglement_event."numeroLivraison" ASC NULLS LAST,
        reglement_event."itemId" ASC NULLS LAST
    `);

    if (result.rows.length === 0) {
      res.status(404).json({ erreur: "Coopérative introuvable" });
      return;
    }

    const cooperativeNom = result.rows[0]!.cooperativeNom;
    const items = result.rows
      .filter((row) => row.itemId != null)
      .map((row) => ({
        id: row.itemId!,
        dateReglement: row.dateReglement ?? "",
        dateLivraison: row.dateLivraison ?? "",
        numeroLivraison: row.numeroLivraison ?? "",
        producteur: row.producteur ?? "Producteur non renseigné",
        village: row.village,
        modePaiement: row.modePaiement ?? "paiement",
        referencePaiement: row.referencePaiement ?? "",
        montantFcfa: entier(row.montantFcfa),
      }));
    const totalMontantRegleFcfa = items.reduce((total, item) => total + item.montantFcfa, 0);

    res.json({
      cooperativeNom,
      dateDebut,
      dateFin,
      genereLe: new Date().toISOString(),
      nombreReglements: items.length,
      totalMontantRegleFcfa,
      items,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getPaiementsRapportEffectues");
    res.status(500).json({ erreur: apiError(err) });
  }
}
