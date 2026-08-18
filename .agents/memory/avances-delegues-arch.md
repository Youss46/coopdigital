---
name: Avances délégués — architecture
description: Table dédiée avances_delegues (séparée de avances membres), remboursement par retenue automatique sur commission.
---

## Règle clé
Avances délégués ≠ avances membres. Tables séparées car le remboursement est par retenue sur commission (pas sur livraison).

## Tables
- `avances_delegues` — delegueId FK users(id), cooperativeId, planType (integral/partiel/reporte), montantPartielFcfa
- `remboursements_avances_delegues` — avanceId + commissionId (set null on delete)

## Remboursement automatique
Dans `commissionService.payerCommissions` : avances en_cours/en_retard fetchées AVANT la transaction, retenue appliquée DANS la même transaction (atomique). planType `reporte` = pas de retenue ce cycle.

## Remboursement manuel
Via `POST /delegues/:agentId/avances/:avanceId/rembourser` — opération indépendante.

## Bordereau PDF
`generateBordereauAchatSession` fetch le delegueId via transfertsStockTable, puis avancesDeleguesTable pour afficher RETENUE AVANCE (estimée) + SOLDE SUR AVANCES (informatif).

## UI
Onglet "Avances" dans DeleguesPage.tsx (4e onglet après Commissions).

**Why:** Le mécanisme de remboursement est structurellement différent des avances membres — retenue sur commission plutôt que sur livraison. Une table séparée évite les if/else partout dans le code membres.
