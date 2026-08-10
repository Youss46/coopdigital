---
name: Commissions délégués
description: Architecture du module de commissions FCFA/kg pour les délégués de localité, y compris les tables, le service, les routes et les UIs concernées.
---

# Commissions délégués — architecture

## Règle principale
**Option A** : la commission est attribuée au délégué du **membre** (`membres.delegue_id`), pas à l'`agent_id` qui a saisi la livraison.

## Tables (migration 0066)
- `taux_commissions_delegues` — configuration des taux (FCFA/kg) avec résolution par priorité :
  1. (cooperative_id + campagne_id + delegue_id) — taux personnalisé
  2. (cooperative_id + campagne_id + delegue_id IS NULL) — taux campagne par défaut
  3. (cooperative_id + campagne_id IS NULL + delegue_id IS NULL) — taux global coop
- `commissions_delegues` — une ligne par livraison × délégué ; statuts : `en_attente` | `payé` | `annulé`

## Point d'entrée (hook)
Dans `terrainService.enregistrerCollecte()` — après l'insert livraison et les side-effects existants :
1. `SELECT membres.delegue_id WHERE membres.id = data.membreId`
2. Si `delegueId` existe → `creerCommissionSiTaux(livraisonId, delegueId, campagneId, poidsNet, cooperativeId)`
3. Le montant calculé est retourné dans la réponse (`commissionFcfa`)

## Service
`artifacts/api-server/src/services/commissionService.ts`
- `getTauxActif()` — résolution prioritaire du taux
- `creerCommissionSiTaux()` — fire-and-forget acceptable, retourne montant ou null
- `payerCommissions()` — crédite la caisse délégué + `mouvement_caisse_delegue` type `commission`
- `getCommissionsDelegue()` — liste avec totaux pour admin
- `getResumeMesCommissions()` — résumé pour l'app terrain
- `listTaux()` / `upsertTaux()` / `deleteTaux()` — gestion admin des taux

## Routes API
Dans `artifacts/api-server/src/routes/delegues.ts` (les routes `/commissions/taux` doivent être AVANT `/:agentId`) :
- `GET  /delegues/commissions/taux` — liste taux (admin)
- `POST /delegues/commissions/taux` — créer/modifier taux (admin)
- `DELETE /delegues/commissions/taux/:tauxId` — supprimer taux (admin)
- `GET  /delegues/:agentId/commissions` — commissions d'un délégué (admin)
- `POST /delegues/:agentId/commissions/payer` — versement en caisse (admin)
- `GET  /terrain/mes-commissions` — résumé délégué connecté (terrain)

## UIs
- `artifacts/frontend/src/pages/DeleguesPage.tsx` — onglet "Commissions" avec sous-onglets "Taux" et "Par délégué"
- `artifacts/terrain/src/pages/CollecteFlow.tsx` — affiche `commissionFcfa` dans l'écran de succès (step 4)
- `artifacts/terrain/src/lib/api.ts` — `getMesCommissions()` pour la future page terrain

**Why:** les délégués de localité perçoivent une rémunération variable selon les kg collectés ; le calcul doit être automatique et non bloquant pour la collecte.
