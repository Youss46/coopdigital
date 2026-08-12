-- Backfill tiers_id / tiers_type for existing accounting entries that pre-date
-- the tiers columns.  Only rows where tiers_id IS NULL are touched.
--
-- DB_SOURCE_MAP in comptabiliteService.ts collapses many application-level
-- sources onto a small set of DB enum values.  Several enum values are shared
-- by multiple application sources whose source_id sequences are independent
-- (IDs can collide), so source_id alone is never a safe discriminator for
-- those groups.
--
-- Strategy: each UPDATE is paired with a collision-safe discriminator that
-- matches exactly the hardcoded libelle template or numero_piece set by the
-- corresponding controller/service function.
--
-- Sources covered:
--   'livraison' ← application "livraison"             (1-to-1, no collision risk)
--   'avance'    ← application "avance"                (1-to-1, no collision risk)
--   'paiement'  ← 3 member-linked sub-paths disambiguated by piece/libelle:
--                  a) paiements table    → piece = 'PAI-{paiements.id}'
--                  b) caisse responsable → mc.reference_operation = 'PAI-{id}'
--                  c) caisse centrale    → mc.libelle = 'Paiement producteur — règlement #{id}'
--                  d) prime_paiement     → piece = 'PRM-PAY-{primes_membres.id}'
--   'don'       ← intrant gratuit distributions only  → piece = 'DIST-{di.id}'
--   'stock'     ← application "intrant":
--                  distributions (crédit/subventionné) → piece = 'DIST-{di.id}'
--                  remboursements                       → libelle LIKE 'Remboursement intrant%'

-- ── 1. Livraisons (unambiguous) ──────────────────────────────────────────────
UPDATE ecritures_comptables ec
SET    tiers_id   = l.membre_id,
       tiers_type = 'membre'
FROM   livraisons l
WHERE  ec.source    = 'livraison'
  AND  ec.source_id = l.id
  AND  ec.tiers_id  IS NULL
  AND  l.membre_id  IS NOT NULL;

-- ── 2. Avances (unambiguous) ─────────────────────────────────────────────────
UPDATE ecritures_comptables ec
SET    tiers_id   = a.membre_id,
       tiers_type = 'membre'
FROM   avances a
WHERE  ec.source    = 'avance'
  AND  ec.source_id = a.id
  AND  ec.tiers_id  IS NULL;

-- ── 3a. Paiements producteurs — non-cash (piece = 'PAI-{paiements.id}') ─────
-- paiementsController sets numeroPiece = 'PAI-{id}' explicitly for
-- mobile/chèque payments.  Other 'paiement'-mapped sources (emprunt,
-- transport, prime_paiement, caisse, etc.) use different prefixes and are
-- not matched here.
UPDATE ecritures_comptables ec
SET    tiers_id   = p.membre_id,
       tiers_type = 'membre'
FROM   paiements p
WHERE  ec.source       = 'paiement'
  AND  ec.source_id    = p.id
  AND  ec.numero_piece = 'PAI-' || p.id::text
  AND  ec.tiers_id     IS NULL
  AND  p.membre_id     IS NOT NULL;

-- ── 3b. Paiements producteurs — caisse responsable ───────────────────────────
-- debiterCaisseParResponsable sets reference_operation = 'PAI-{paiementId}'
-- and source_id = mouvements_caisse.id.  Join via referenceOperation to get
-- the paiement row, then its membre_id.
UPDATE ecritures_comptables ec
SET    tiers_id   = p.membre_id,
       tiers_type = 'membre'
FROM   mouvements_caisse mc
JOIN   paiements p ON mc.reference_operation = 'PAI-' || p.id::text
WHERE  ec.source    = 'paiement'
  AND  ec.source_id = mc.id
  AND  ec.tiers_id  IS NULL
  AND  mc.motif     = 'paiement_producteur'
  AND  p.membre_id  IS NOT NULL;

-- ── 3c. Paiements producteurs — caisse centrale ──────────────────────────────
-- The central-caisse debit path (paiementsController ~line 217) records:
--   libelle = 'Paiement producteur — règlement #${paiementId}'
-- No referenceOperation is set, so we use the exact libelle template.
UPDATE ecritures_comptables ec
SET    tiers_id   = p.membre_id,
       tiers_type = 'membre'
FROM   mouvements_caisse mc
JOIN   paiements p
       ON mc.libelle = 'Paiement producteur — règlement #' || p.id::text
WHERE  ec.source    = 'paiement'
  AND  ec.source_id = mc.id
  AND  ec.tiers_id  IS NULL
  AND  mc.motif     = 'paiement_producteur'
  AND  p.membre_id  IS NOT NULL;

-- ── 3d. Primes producteurs (piece = 'PRM-PAY-{primes_membres.id}') ────────────
-- comptabiliteService.generateEcrituresPrimePaiement sets:
--   sourceId = primes_membres.id, numeroPiece = 'PRM-PAY-{id}'
-- primes_membres.membre_id provides the member link.
UPDATE ecritures_comptables ec
SET    tiers_id   = pm.membre_id,
       tiers_type = 'membre'
FROM   primes_membres pm
WHERE  ec.source       = 'paiement'
  AND  ec.source_id    = pm.id
  AND  ec.numero_piece = 'PRM-PAY-' || pm.id::text
  AND  ec.tiers_id     IS NULL;

-- ── 4. Intrants gratuits — source 'don' (piece = 'DIST-{di.id}') ─────────────
-- intrantsController records modeVal='gratuit' with source='don' and
-- numeroPiece='DIST-{distributions_intrants.id}'.
-- donService uses reference numbers or NULL — never 'DIST-…' — so no collision.
UPDATE ecritures_comptables ec
SET    tiers_id   = di.membre_id,
       tiers_type = 'membre'
FROM   distributions_intrants di
WHERE  ec.source       = 'don'
  AND  ec.source_id    = di.id
  AND  ec.numero_piece = 'DIST-' || di.id::text
  AND  ec.tiers_id     IS NULL;

-- ── 5a. Intrants à crédit / subventionnés — source 'stock' ──────────────────
-- application source "intrant" maps to DB 'stock' via DB_SOURCE_MAP.
-- Controller sets numeroPiece='DIST-{distributions_intrants.id}' explicitly.
UPDATE ecritures_comptables ec
SET    tiers_id   = di.membre_id,
       tiers_type = 'membre'
FROM   distributions_intrants di
WHERE  ec.source       = 'stock'
  AND  ec.source_id    = di.id
  AND  ec.numero_piece = 'DIST-' || di.id::text
  AND  ec.tiers_id     IS NULL;

-- ── 5b. Remboursements d'intrants — source 'stock' ───────────────────────────
-- Controller hardcodes libelle = 'Remboursement intrant – membre #…'.
-- Combined with source_id = remboursements_intrants.id, this uniquely
-- identifies remboursement entries vs. stock movements and approvisionnements.
UPDATE ecritures_comptables ec
SET    tiers_id   = ri.membre_id,
       tiers_type = 'membre'
FROM   remboursements_intrants ri
WHERE  ec.source    = 'stock'
  AND  ec.source_id = ri.id
  AND  ec.libelle   LIKE 'Remboursement intrant%'
  AND  ec.tiers_id  IS NULL;
