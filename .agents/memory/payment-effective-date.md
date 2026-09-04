---
name: Date effective des règlements
description: Référence temporelle commune pour les règlements effectués et les statistiques.
---

Pour compter un règlement confirmé, effectué ou en cours dans une période, utiliser `date_validation` lorsqu’elle existe, sinon `created_at`, pour la part réglée immédiatement. Une part payée par chèque ne compte qu’au statut `encaisse`, à sa `date_encaissement`; un chèque `emis` compte pour zéro.

**Why:** La page Règlements affichait des paiements effectués alors que la carte Tableau de bord affichait 0 parce que son filtre exigeait uniquement `date_validation`. À l’inverse, les chèques seulement émis gonflaient les cartes avant toute sortie bancaire réelle.

**How to apply:** Dans les KPI, statistiques et exports périodiques, séparer le montant immédiat du montant des chèques. Compter chaque chèque encaissé dans la période de son encaissement, y compris pour un règlement ventilé.

Tout reçu PDF marqué payé affiche obligatoirement la date effective sous « Date de règlement ». Le reçu d’une livraison payée prend le dernier règlement confirmé/effectué.