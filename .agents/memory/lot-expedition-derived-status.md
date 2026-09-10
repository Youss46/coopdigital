---
name: Statut d’expédition dans la traçabilité
description: Règle d’affichage pour les lots rattachés aux expéditions portuaires.
---

Le statut stock/vente d’un lot et le statut logistique de sa dernière expédition sont deux machines d’état distinctes. La traçabilité doit afficher le statut d’expédition dérivé séparément, notamment « Réceptionné au port », sans convertir automatiquement le lot en `vendu`.

**Why:** `vendu` représente la vente exportateur validée, tandis que la réception au port décrit un événement logistique qui peut survenir avant ou indépendamment du règlement commercial.

**How to apply:** Pour un lot rattaché à plusieurs expéditions, prendre le statut et le numéro de l’expédition la plus récente; conserver le statut natif du lot pour les filtres, les actions et le cycle stock/vente.