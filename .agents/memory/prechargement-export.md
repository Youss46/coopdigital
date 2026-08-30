---
name: Pré-pesée export
description: Règles durables pour contrôler un chargement export avant la sortie de stock.
---

La pré-pesée export est une session de pesée dédiée, liée à une expédition, qui mesure et compare sans créer de livraison ni mouvement de stock. Le passage à `charge` exige une session clôturée conforme à la tolérance de `config_pesee`; un écart hors tolérance exige une validation motivée.

**Why:** la quantité prévue, la quantité contrôlée avant chargement et la quantité réellement chargée doivent rester auditables séparément, et un contrôle préparatoire ne doit jamais produire d’effet financier ou de stock.

**How to apply:** conserver le mode connecté pour cette opération sensible; déclencher les effets stock/comptabilité uniquement dans la transaction de confirmation du chargement.