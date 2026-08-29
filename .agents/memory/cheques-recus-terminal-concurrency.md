---
name: Concurrence des transitions terminales des chèques reçus
description: Règle de sérialisation entre encaissement, rejet et annulation d’un même chèque reçu.
---

Les transitions terminales d’un chèque reçu doivent verrouiller sa ligne avec `FOR UPDATE`, vérifier le statut après acquisition du verrou et conserver les effets bancaires, paiement, vente et comptabilité dans la même transaction. L’encaissement doit notamment vérifier `depose` avant de créer le mouvement bancaire.

**Why:** deux requêtes concurrentes peuvent sinon créer simultanément des effets financiers incompatibles, même si chacune valide individuellement le statut initial.

**How to apply:** pour toute nouvelle transition du cycle d’un chèque reçu, faire échouer explicitement l’opération perdante avant tout mouvement bancaire ou écriture inverse, et tester les états persistés des quatre domaines.