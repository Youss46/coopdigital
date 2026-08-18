---
name: Bons réception membres délégués
description: Architecture complète du flux bon de réception membre délégué de localités → pesée → bordereau
---

## Flux

1. **Magasinier** (frontend `/bons-reception-membres`) crée un bon le jour J → `POST /api/pesee/bons-reception`
2. **Push notification** envoyée aux peseurs (role "peseur")
3. **Peseur** (terrain app, onglet "Membres délégués" dans `ReceptionsTransfertsPage`) voit le bon → tape "Démarrer la pesée"
4. Terrain appelle `createSessionPesee({ bonReceptionId, operation: "reception_membre_delegue" })` → Cas 0 dans `createSession`
5. Session créée avec `bonReceptionId` + `membreId = bon.membreDelegueId` + `operation = "reception_membre_delegue"`
6. Bon statut → `en_pesee`, `sessionPeseeId` renseigné
7. `terminerSession` → commission membre délégué calculée + bon statut → `terminee`
8. **PDF bordereau** : lit `bon.fraisCarburantFcfa` + `bon.autresChargesFcfa` depuis `bonsReceptionMembresDeleguesTable` si `session.bonReceptionId != null`

## Tables modifiées

- **Nouvelle table** `bons_reception_membres_delegues` — créée via hotfix dans `migrate.ts`
- **`sessions_pesee`** — colonne `bon_reception_id integer` ajoutée via `ALTER TABLE … ADD COLUMN IF NOT EXISTS`

## Fichiers clés

- Schema : `lib/db/src/schema/bons_reception_membres_delegues.ts`
- Service API : `artifacts/api-server/src/services/bonReceptionService.ts`
- Routes : `artifacts/api-server/src/routes/bons_reception.ts` + terrain inline dans `routes/pesee.ts`
- Terrain route : `GET /terrain/bons-reception/en-attente` (terrainAuthMiddleware + peseurOrDelegueOnly)
- Frontend page magasinier : `artifacts/frontend/src/pages/BonsReceptionMembresDeleguesPage.tsx`
- Terrain page : `ReceptionsTransfertsPage.tsx` (onglet "Transferts délégués" + "Membres délégués")

**Why:** frais transport avancés par la coop (carburant, autres charges) doivent être traçables et déduits du net membre sur le bordereau — table séparée pour isoler ce flux des transferts délégués classiques.
