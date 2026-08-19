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

## Avances — déduction automatique (ajouté)

Pattern identique aux délégués terrain : `deduireAvancesMembreDelegue()` dans `peseeSessionService.ts`.

**Plafond** = commission nette = `commission.montantFcfa − (fraisCarburantFcfa + autresChargesFcfa du bon)`.  
Si pas de bon (pesée sans bon), plafond = commission brut entière.

**Itération** : avances `en_cours` / `en_retard` par `dateOctroi ASC` ; respect du `planType` (partiel → `montantPartielFcfa` comme plafond cycle).

**Tables touchées** :
- `avances` — mise à jour `montantRembourse_fcfa`, `soldeRestantFcfa`, `statut → rembourse` si solde = 0
- `remboursements_avances_membres` — ligne insérée pour chaque avance touchée, `note = "Retenue automatique — pesée #N"`

**Bug corrigé en passant** : `creerCommissionTransfert` (commissionService.ts) avait return type `number | null` mais retournait `{ id, montantFcfa: montantNet }` avec `montantNet` indéfini → corrigé en `{ id: number; montantFcfa: number } | null` retournant `montantBrut`.

## Présentation du bordereau

Pour une session d'un membre délégué issue d'un bon de réception, le bordereau
d'achat doit garder le format de réception centralisée : identité du délégué,
numéro de camion et chauffeur du bon, détail de chaque passage, puis les frais
de collecte, carburant, autres charges éventuelles, retenue d'avance et solde.
Ne pas afficher une ligne intermédiaire « Frais collecte net » dans ce cas.

**Why:** le bon de réception est la source contractuelle des informations de
transport et le bordereau validé par l'utilisateur doit présenter ces frais
bruts de façon directement vérifiable.

**How to apply:** toute évolution du PDF de session avec `bonReceptionId` doit
préserver ces champs et ce libellé de synthèse pour les membres dont la
catégorie est « délégué de localités ».

Depuis tout écran de livraisons (Terrain ou tableau de bord principal), le
téléchargement d'une livraison liée à cette session doit sélectionner
automatiquement le bordereau d'achat plutôt que le reçu de livraison générique.

Les informations de transport peuvent être saisies à la main pour un camion
externe, ou référencer un véhicule et un chauffeur de la flotte coopérative.
Le bordereau doit résoudre les références de flotte comme repli si les champs
manuels sont vides.

**Why:** les bons créés avec le mode coopératif ne dupliquent pas
l'immatriculation et le nom du chauffeur dans les champs de saisie externe.

**How to apply:** tout générateur de document lié à un bon doit lire les
valeurs manuelles en priorité, puis joindre véhicule et chauffeur par leurs
identifiants lorsque nécessaire.

## Comptabilisation des charges avancées

Le carburant et les autres charges payés par la coopérative au titre du bon
sont des créances sur le membre, pas des charges propres de la coopérative.
L'avance débite un compte fournisseur débiteur 409x, puis la récupération sur
le règlement débite la dette producteur et crédite exactement ce compte 409x.
La récupération ne doit jamais créditer un compte de produit 758.

Le compte de dette producteur utilisé lors de l'achat doit être figé sur la
livraison et réutilisé par les retenues et le paiement final, même si la
configuration comptable change entre-temps.

**Why:** relire la configuration courante au paiement peut débiter un autre
401x que celui crédité à la livraison et laisser une dette artificiellement
ouverte. Une charge supérieure au règlement doit rester une créance ouverte,
pas devenir une charge ou un produit de la coopérative.

**How to apply:** tout nouveau flux qui réduit ou règle une dette de livraison
doit partir du compte figé sur cette livraison; les comptes de retenue ne
doivent jamais être résolus indépendamment des écritures qui ont créé la dette
et la créance.
