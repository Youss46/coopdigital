---
name: Receipt sequence global uniqueness
description: Les numéros de reçu sont globalement uniques malgré le cloisonnement par coopérative.
---

Les numéros de reçu doivent être attribués par une séquence PostgreSQL globale, pas par un compteur séparé dans chaque coopérative.

**Why:** `paiements.numero_recu` possède une contrainte `UNIQUE` globale, donc deux coopératives ne peuvent pas chacune générer le même suffixe `REC-AAAA-NNNNN`.

**How to apply:** Toute création de paiement doit réserver le prochain numéro via la séquence globale; ne pas réintroduire un compteur tenant-local sans clé composite incluant la coopérative.