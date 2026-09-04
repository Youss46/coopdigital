---
name: Receipt sequence per cooperative
description: Les numéros de reçu sont séquentiels par coopérative et année, avec unicité composée.
---

Les numéros de reçu doivent être attribués par un compteur PostgreSQL atomique par coopérative et année civile. `paiements.cooperative_id` porte le tenant et l’unicité est composée avec `numero_recu`.

**Why:** Les coopératives sont des tenants distincts : chacune doit pouvoir commencer à `REC-AAAA-00001`, tout en empêchant les doublons à l’intérieur de son propre périmètre.

**How to apply:** Réserver le prochain numéro via le compteur local `(cooperative_id, annee)` avec une mise à jour atomique; renseigner `paiements.cooperative_id` sur les paiements créés par l’application.