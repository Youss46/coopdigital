---
name: Parité tonnage PCA et tableau de bord
description: Règle commune pour les indicateurs de tonnage de campagne et leur détail.
---

Le tonnage affiché pour « Toute la campagne » doit avoir la même définition dans le Tableau de bord et la vue PCA : livraisons de la campagne plus transferts de stock confirmés. La modale par certification détaille les livraisons et peut donc être inférieure au total PCA.

**Why:** Une différence entre le KPI et sa modale faisait apparaître 0 ou 25,2 T côté Tableau de bord alors que la synthèse PCA affichait 42,1 T avec 16,9 T de transferts confirmés.

**How to apply:** Lors d’une modification de ces écrans, comparer séparément livraisons, transferts et détail par certification; ne pas prendre la modale des livraisons comme total incluant les transferts.