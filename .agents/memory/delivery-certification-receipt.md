---
name: Certification par livraison
description: Règle de priorité entre la certification choisie lors d’une pesée et celle du profil permanent du membre.
---

Le libellé de certification sur un reçu de livraison doit utiliser `livraisons.certification_cacao` lorsqu’il est renseigné. La certification permanente du membre ne sert que de fallback pour les anciennes livraisons sans certification enregistrée.

**Why:** Un même producteur peut livrer différents lots avec des certifications différentes; utiliser uniquement sa certification de profil affiche une information erronée sur le reçu.

**How to apply:** Pour les reçus et états liés à une livraison, lire d’abord la certification de la livraison, puis utiliser les données de certification du membre uniquement si cette valeur est absente.