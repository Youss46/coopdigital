import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { apiError } from "../lib/apiError.js";

type PaiementRapportEffectueRow = {
  cooperativeNom: string;
  itemId: string | null;
  dateReglement: string | null;
  typeOperation: string | null;
  dateOperation: string | null;
  referenceOperation: string | null;
  beneficiaire: string | null;
  description: string | null;
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
      paiements_context AS (
        SELECT
          p.id,
          p.numero_recu,
          p.reference_transaction,
          p.mode_paiement::text AS mode_paiement,
          p.montant_fcfa,
          COALESCE(p.date_validation, p.created_at)::date AS date_paiement,
          COALESCE(l.cooperative_id, b.cooperative_id, d.cooperative_id) AS cooperative_id,
          CASE
            WHEN l.id IS NOT NULL THEN 'livraison'
            WHEN b.id IS NOT NULL THEN 'carburant'
            ELSE 'depense_vehicule'
          END AS type_operation,
          CASE
            WHEN l.id IS NOT NULL THEN l.date_livraison::text
            WHEN b.id IS NOT NULL THEN COALESCE(b.date_utilisation, b.date_emission)::text
            ELSE d.date_depense::text
          END AS date_operation,
          CASE
            WHEN l.id IS NOT NULL THEN COALESCE(
              NULLIF(l.numero_livraison, ''),
              p.numero_recu,
              'LIV-' || l.id::text
            )
            WHEN b.id IS NOT NULL THEN COALESCE(NULLIF(b.numero, ''), 'BON-CARB-' || b.id::text)
            ELSE COALESCE(NULLIF(d.reference_piece, ''), 'DEP-' || d.id::text)
          END AS reference_operation,
          CASE
            WHEN l.id IS NOT NULL THEN COALESCE(
              NULLIF(BTRIM(CONCAT_WS(' ', m.nom, m.prenoms)), ''),
              NULLIF(BTRIM(CONCAT_WS(' ', f.nom, f.prenoms)), ''),
              'Producteur non renseigné'
            )
            WHEN b.id IS NOT NULL THEN COALESCE(NULLIF(BTRIM(b.station_service), ''), 'Bon carburant')
            ELSE COALESCE(
              NULLIF(BTRIM(d.fournisseur), ''),
              NULLIF(BTRIM(d.demandeur), ''),
              'Dépense véhicule'
            )
          END AS beneficiaire,
          CASE
            WHEN b.id IS NOT NULL THEN NULLIF(
              BTRIM(CONCAT_WS(' · ', b.type_carburant, b.motif)),
              ''
            )
            WHEN d.id IS NOT NULL THEN NULLIF(BTRIM(d.libelle), '')
            ELSE NULL
          END AS description,
          m.village AS village,
          l.agent_id,
          agent_user.role AS agent_role
        FROM paiements p
        LEFT JOIN livraisons l ON l.id = p.livraison_id
        LEFT JOIN membres m ON m.id = l.membre_id
        LEFT JOIN fournisseurs f ON f.id = l.fournisseur_id
        LEFT JOIN bons_carburant b ON b.id = p.bon_carburant_id
        LEFT JOIN depenses_vehicule d ON d.id = p.depense_vehicule_id
        LEFT JOIN users agent_user ON agent_user.id = l.agent_id
        WHERE p.statut IN ('confirme', 'effectue', 'en_cours')
          AND (
            p.livraison_id IS NOT NULL
            OR p.bon_carburant_id IS NOT NULL
            OR p.depense_vehicule_id IS NOT NULL
          )
          AND COALESCE(l.cooperative_id, b.cooperative_id, d.cooperative_id) = ${cooperativeId}
          AND (
            (
              ${estDelegue}::boolean
              AND ${utilisateurId}::integer IS NOT NULL
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
      ),
      evenements_regles AS (
        SELECT
          'paiement-ligne-' || pl.id::text AS "itemId",
          ctx.date_paiement::text AS "dateReglement",
          ctx.type_operation AS "typeOperation",
          ctx.date_operation AS "dateOperation",
          ctx.reference_operation AS "referenceOperation",
          ctx.beneficiaire AS beneficiaire,
          ctx.description AS description,
          ctx.village AS village,
          pl.mode_paiement::text AS "modePaiement",
          COALESCE(
            NULLIF(pl.reference_transaction, ''),
            ctx.numero_recu,
            ctx.reference_transaction,
            'REG-' || ctx.id::text
          ) AS "referencePaiement",
          pl.montant_fcfa::integer AS "montantFcfa"
        FROM paiements_context ctx
        INNER JOIN paiement_lignes pl ON pl.paiement_id = ctx.id
        WHERE pl.mode_paiement <> 'cheque'
          AND ctx.date_paiement >= ${dateDebut}::date
          AND ctx.date_paiement <= ${dateFin}::date

        UNION ALL

        SELECT
          'paiement-' || ctx.id::text AS "itemId",
          ctx.date_paiement::text AS "dateReglement",
          ctx.type_operation AS "typeOperation",
          ctx.date_operation AS "dateOperation",
          ctx.reference_operation AS "referenceOperation",
          ctx.beneficiaire AS beneficiaire,
          ctx.description AS description,
          ctx.village AS village,
          COALESCE(ctx.mode_paiement, 'paiement') AS "modePaiement",
          COALESCE(
            ctx.numero_recu,
            ctx.reference_transaction,
            'REG-' || ctx.id::text
          ) AS "referencePaiement",
          GREATEST(0, ctx.montant_fcfa - COALESCE(ct.montant_fcfa, 0))::integer AS "montantFcfa"
        FROM paiements_context ctx
        LEFT JOIN cheques_total ct ON ct.paiement_id = ctx.id
        WHERE (ctx.mode_paiement IS NULL OR ctx.mode_paiement <> 'cheque')
          AND NOT EXISTS (
            SELECT 1 FROM paiement_lignes pl_absentes WHERE pl_absentes.paiement_id = ctx.id
          )
          AND ctx.date_paiement >= ${dateDebut}::date
          AND ctx.date_paiement <= ${dateFin}::date

        UNION ALL

        SELECT
          'cheque-' || ch.id::text AS "itemId",
          ch.date_encaissement::text AS "dateReglement",
          ctx.type_operation AS "typeOperation",
          ctx.date_operation AS "dateOperation",
          ctx.reference_operation AS "referenceOperation",
          ctx.beneficiaire AS beneficiaire,
          ctx.description AS description,
          ctx.village AS village,
          'cheque'::text AS "modePaiement",
          COALESCE(
            NULLIF(ch.numero_cheque, ''),
            ctx.numero_recu,
            ctx.reference_transaction,
            'CHEQUE-' || ch.id::text
          ) AS "referencePaiement",
          ch.montant_fcfa::integer AS "montantFcfa"
        FROM cheques_emis ch
        LEFT JOIN paiement_lignes ligne_cheque ON ligne_cheque.id = ch.paiement_ligne_id
        INNER JOIN paiements_context ctx
          ON ctx.id = COALESCE(ch.paiement_id, ligne_cheque.paiement_id)
        WHERE ch.statut = 'encaisse'
          AND ch.date_encaissement >= ${dateDebut}::date
          AND ch.date_encaissement <= ${dateFin}::date
          AND ch.cooperative_id = ${cooperativeId}
          AND ctx.cooperative_id = ${cooperativeId}
      )
      SELECT
        c.nom AS "cooperativeNom",
        reglement_event."itemId",
        reglement_event."dateReglement",
        reglement_event."typeOperation",
        reglement_event."dateOperation",
        reglement_event."referenceOperation",
        reglement_event.beneficiaire,
        reglement_event.description,
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
        typeOperation: row.typeOperation ?? "livraison",
        dateOperation: row.dateOperation ?? "",
        referenceOperation: row.referenceOperation ?? "",
        beneficiaire: row.beneficiaire ?? "Bénéficiaire non renseigné",
        description: row.description,
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
