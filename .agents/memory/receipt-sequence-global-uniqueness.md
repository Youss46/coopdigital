---
name: Receipt sequence per cooperative
description: Les numéros de reçu sont séquentiels par coopérative et année, avec unicité composée.
---

Tous les règlements rattachés à une coopérative doivent recevoir un numéro via un compteur PostgreSQL atomique par coopérative et année civile. `paiements.cooperative_id` porte le tenant et l’unicité est composée avec `numero_recu`.

**Why:** Les coopératives sont des tenants distincts : chacune doit pouvoir commencer à `REC-AAAA-00001`, tout en empêchant les doublons à l’intérieur de son propre périmètre.

**How to apply:** Toute insertion applicative dans `paiements` doit réserver le prochain numéro via le compteur local `(cooperative_id, annee)` et renseigner `cooperative_id`; la base refuse un paiement tenant-scoped sans numéro.