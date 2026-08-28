---
name: Ordre des verrous des transferts de trésorerie
description: Règle de verrouillage commune aux transferts entre une banque et une caisse.
---

Les transferts banque↔caisse doivent verrouiller le compte bancaire avant la caisse, quel que soit le sens du transfert.

**Why:** Deux requêtes opposées qui verrouillent leurs comptes dans des ordres différents peuvent se bloquer mutuellement, même si chaque mouvement est transactionnel.

**How to apply:** Prendre les verrous `FOR UPDATE` dans l’ordre banque puis caisse avant de lire les soldes et d’insérer les mouvements.