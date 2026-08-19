---
name: Bons de réception — créateurs autorisés
description: Règle métier confirmée par l'utilisateur sur qui peut créer un bon de réception membre délégué
---

Règle : un bon de réception membre délégué peut être créé par le **magasinier** (front-office, route `/pesee/bons-reception` + permission stocks.entree) **ET** par le **peseur central** (app terrain, route `/terrain/bons-reception` + guard `peseurOnly`).

**Why:** en août 2026, une session a restreint à tort la création au seul magasinier après une phrase ambiguë de l'utilisateur (« la création était réservée aux Magasiniers »). L'utilisateur a immédiatement corrigé : « Le peseur doit aussi pouvoir créer un bon de réception ». Le parcours peseur (bouton + CreateBonReceptionSheet + endpoint terrain) est voulu et doit être préservé.

**How to apply:** ne jamais retirer le parcours de création côté terrain/peseur lors de refactors d'autorisation ; la traçabilité passe par `cree_par_id`/`cree_par_role` sur `bons_reception_membres_delegues`.
