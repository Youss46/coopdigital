---
name: Agrégation des statistiques carburant
description: Les statistiques des bons carburant doivent séparer les totaux de bons des agrégats de paiements.
---

Les totaux de bons et le détail par véhicule se calculent sans jointure directe aux paiements; les montants de règlement sont agrégés séparément par paiement.

**Why:** Une jointure directe duplique les bons réglés en plusieurs versements et peut aussi rendre `montant_fcfa` ambigu entre les tables.

**How to apply:** Qualifier toutes les colonnes SQL et compter les paiements uniquement dans un agrégat dédié avant de recombiner les statistiques.