---
name: Atomicité des règlements ventilés
description: Garanties à conserver lorsqu'un paiement utilise plusieurs moyens de règlement.
---

Un règlement ventilé doit valider le paiement, ses lignes, les chèques, les mouvements de trésorerie et toutes les écritures comptables dans une transaction commune. La somme des lignes est aussi contrôlée par une contrainte différée PostgreSQL.

**Why:** Une ventilation espèces + chèque peut créer plusieurs effets financiers; une erreur ou une double validation ne doit laisser aucun sous-ensemble enregistré.

**How to apply:** Toute nouvelle ligne de règlement ou tout nouveau moyen doit passer par la transaction de validation et préserver l'égalité entre le montant parent et la somme des lignes.