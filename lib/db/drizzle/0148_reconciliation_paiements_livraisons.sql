-- Régulariser les anciennes dates de validation manquantes.
UPDATE paiements
SET date_validation = created_at
WHERE statut IN ('confirme', 'effectue')
  AND date_validation IS NULL;

-- Récupérer le mode lorsqu'un règlement historique possède une seule ligne
-- de ventilation. Les règlements multi-modes restent explicitement ventilés.
UPDATE paiements p
SET mode_paiement = l.mode_paiement
FROM paiement_lignes l
WHERE p.id = l.paiement_id
  AND p.mode_paiement IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM paiement_lignes l2
    WHERE l2.paiement_id = p.id
      AND l2.id <> l.id
  );

-- Recalculer l'état de paiement des livraisons à partir des règlements
-- effectivement confirmés ou effectués.
WITH paiements_regles AS (
  SELECT
    livraison_id,
    SUM(montant_fcfa)::numeric AS montant_paye
  FROM paiements
  WHERE livraison_id IS NOT NULL
    AND statut IN ('confirme', 'effectue')
  GROUP BY livraison_id
)
UPDATE livraisons l
SET
  statut_paiement = CASE
    WHEN pr.montant_paye >= l.montant_net_fcfa THEN 'PAYÉ'
    ELSE 'PARTIEL'
  END,
  montant_restant = GREATEST(l.montant_net_fcfa - pr.montant_paye, 0)
FROM paiements_regles pr
WHERE l.id = pr.livraison_id;