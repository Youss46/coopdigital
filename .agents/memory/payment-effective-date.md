---
name: Date effective des règlements
description: Référence temporelle commune pour les règlements effectués et les statistiques.
---

Pour compter un règlement confirmé, effectué ou en cours dans une période, utiliser `date_validation` lorsqu’elle existe, sinon `created_at`. Les anciens règlements effectués peuvent ne pas avoir de date de validation.

**Why:** La page Règlements affichait des paiements effectués alors que la carte Tableau de bord affichait 0 parce que son filtre exigeait uniquement `date_validation`.

**How to apply:** Réutiliser cette date effective dans les KPI, les statistiques de règlements et tout export périodique; conserver le statut comme condition d’inclusion.