---
name: Primes module — écritures OHADA
description: Comptes SYSCOHADA utilisés pour les réceptions et paiements de primes, et modes de paiement caisse vs banque.
---

## Réception de prime (exportateur → coopérative)
- **Débit 521 Banque / Crédit 7588 Autres produits d'exploitation divers**
- source TS : `"prime_reception"` → DB_SOURCE_MAP → `"encaissement"`
- Généré dans `generateEcrituresPrimeReception()` (comptabiliteService.ts)
- Appelé fire-and-forget dans `createReception()` (primesService.ts)

## Paiement de prime (coopérative → membre producteur)
- **Débit 6018 Complément d'achat cacao / Crédit 521 Banque ou 571 Caisse**
- source TS : `"prime_paiement"` → DB_SOURCE_MAP → `"paiement"`
- Généré dans `generateEcrituresPrimePaiement()` (comptabiliteService.ts)
- Appelé fire-and-forget dans `payerMembre()` et `payerBulk()` (primesService.ts)

## Mapping mode de paiement → compte de trésorerie
`MODES_CAISSE` (Set dans comptabiliteService.ts) :
- caisse, especes, espèces, orange_money, mtn_momo, wave, moov_money, mobile_money → **571**
- tout autre mode (virement, chèque, etc.) → **521**

**Why:** SYSCOHADA distingue trésorerie banque (521) et caisse/mobile (571). Les modes mobile-money doivent aller en 571, pas 521.

## Flag config_comptable
- `auto_primes boolean DEFAULT false` dans `configComptableTable`
- Migration 0065 : `ALTER TABLE config_comptable ADD COLUMN IF NOT EXISTS auto_primes boolean NOT NULL DEFAULT false`
- AUTO_KEY_MAP : `prime_reception` et `prime_paiement` → `"autoPrimes"`

## Fixes associés
- **Arrondi** : résidu de répartition proportionnelle affecté au membre avec le plus grand tonnage ; `deductionAvancesFcfa` re-cappée au nouveau montantBrut pour éviter l'over-repayment.
- **Déduction avances effective** : `reduireAvances()` dans primesService.ts réduit `avancesTable.soldeRestantFcfa` (integer) en ordre d'ancienneté ; statut → `"rembourse"` si solde = 0.
- **payerBulk logging** : `Promise.allSettled()` avec inspection de chaque rejected + log `primeMembreId`/`membreId`.
